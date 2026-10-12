// 运行器：按给定的并行度逐成员跑它自己的 `test`（或 `acceptance`）脚本，一个失败不拦其余的；
// 每个成员的输出落到运行目录里的日志，vitest 的 JSON 报告与计时报告落在旁边，供账本与失败归因读取。
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { closeSync, existsSync, openSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hasArchivedDirectories } from './archive-project.ts'
import type { TestMember } from './members.ts'
import {
  TEST_TIER_ENV,
  VITEST_MAX_WORKERS_ENV,
  type Parallelism,
  type RunScript,
  type RunTier,
} from './config.ts'
import type { MemberRun, VitestJsonReport } from './ledger.ts'
import { TIMING_FILE_ENV, type TimingReport } from './timing-reporter.ts'

const TIMING_REPORTER = fileURLToPath(new URL('./timing-reporter.ts', import.meta.url))

export const slugOf = (member: string) => member.replaceAll('/', '__')

const children = new Set<ChildProcess>()
let forwarding = false

/** 运行器被终止时把信号转给还在跑的成员，不留孤儿进程。 */
function forwardTermination(): void {
  if (forwarding) return
  forwarding = true
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () => {
      for (const child of children) child.kill(signal)
      process.exitCode = 130
    })
}

export interface SpawnResult {
  readonly exitCode: number
  readonly wallSeconds: number
}

/** 起一个子进程，输出全部进日志文件；起不来或被信号杀掉都记为非零退出码，不抛。 */
export function spawnLogged(
  command: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv; readonly logPath: string },
): Promise<SpawnResult> {
  forwardTermination()
  const started = Date.now()
  const log = openSync(options.logPath, 'w')
  return new Promise(resolve => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', log, log],
    })
    children.add(child)
    const finish = (exitCode: number) => {
      children.delete(child)
      closeSync(log)
      resolve({ exitCode, wallSeconds: (Date.now() - started) / 1000 })
    }
    child.once('error', () => finish(-1))
    child.once('exit', code => finish(code ?? -1))
  })
}

/** vitest 的 JSON 报告；没写出来或写了一半都当作没有。 */
export function readReport(path: string): VitestJsonReport | undefined {
  if (!existsSync(path)) return undefined
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<VitestJsonReport>
    return Array.isArray(parsed.testResults) ? (parsed as VitestJsonReport) : undefined
  } catch {
    return undefined
  }
}

/** 计时报告；没写出来或写了一半都当作没有，账本退回只用 JSON 报告。 */
export function readTiming(path: string): TimingReport | undefined {
  if (!existsSync(path)) return undefined
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<TimingReport>
    return Array.isArray(parsed.files) ? (parsed as TimingReport) : undefined
  } catch {
    return undefined
  }
}

/** 运行器加给成员 vitest 的参数：两份报告；慢层另关掉类型测试（`*.spec-d.ts` 都归快层，不重跑）。 */
export function vitestArgs(reportPath: string, tier: RunTier): string[] {
  return [
    '--exclude',
    '**/*.legacy/**',
    '--reporter=default',
    '--reporter=json',
    `--outputFile.json=${reportPath}`,
    `--reporter=${TIMING_REPORTER}`,
    ...(tier === 'slow' ? ['--typecheck.enabled=false'] : []),
  ]
}

async function runMember(
  root: string,
  member: TestMember,
  runDir: string,
  vitestMaxWorkers: number,
  script: RunScript,
  tier: RunTier,
): Promise<MemberRun> {
  const slug = slugOf(member.path)
  const reportPath = join(runDir, `${slug}.json`)
  const timingPath = join(runDir, `${slug}.timing.json`)
  // 只有 vitest 的脚本才认这几个参数；别的脚本原样跑，账本里只有成员一级的耗时。
  const args = /\bvitest\b/u.test(member.script) ? vitestArgs(reportPath, tier) : []
  const memberDirectory = join(root, member.path)
  const env = {
    ...process.env,
    [VITEST_MAX_WORKERS_ENV]: String(vitestMaxWorkers),
    [TIMING_FILE_ENV]: timingPath,
    [TEST_TIER_ENV]: tier === 'all' ? '' : tier,
  }
  if (/^vitest\s/u.test(member.script.trim()) || hasArchivedDirectories(memberDirectory)) {
    const optionsPath = join(runDir, `${slug}.archive-options.json`)
    const prepared = spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        fileURLToPath(
          new URL(
            `./vitest-archive.${import.meta.url.endsWith('.ts') ? 'ts' : 'js'}`,
            import.meta.url,
          ),
        ),
        member.script,
        tier,
        optionsPath,
      ],
      { cwd: memberDirectory, env, encoding: 'utf8' },
    )
    if (prepared.error !== undefined) throw prepared.error
    if (prepared.status !== 0)
      throw new Error(prepared.stderr || 'Cannot prepare archived test scope')
    const extra: unknown = JSON.parse(readFileSync(optionsPath, 'utf8'))
    if (!Array.isArray(extra) || !extra.every((value: unknown) => typeof value === 'string'))
      throw new Error('Invalid archived test scope arguments')
    args.push(...extra)
  }
  const result = await spawnLogged('pnpm', ['run', script, ...args], {
    cwd: memberDirectory,
    env,
    logPath: join(runDir, `${slug}.log`),
  })
  const report = readReport(reportPath)
  const timing = readTiming(timingPath)
  return {
    member: member.path,
    ...result,
    ...(report === undefined ? {} : { report }),
    ...(timing === undefined ? {} : { timing }),
  }
}

/** 同时最多跑 `memberConcurrency` 个成员，各跑它的 `script` 脚本的 `tier` 那一层；返回顺序与传入顺序一致。 */
export async function runMembers(
  root: string,
  members: readonly TestMember[],
  runDir: string,
  parallel: Parallelism,
  script: RunScript,
  tier: RunTier,
  onDone: (run: MemberRun, finished: number) => void,
): Promise<MemberRun[]> {
  const runs = new Array<MemberRun>(members.length)
  let next = 0
  let finished = 0
  const worker = async () => {
    for (let index = next++; index < members.length; index = next++) {
      const member = members[index]
      if (member === undefined) continue
      const run = await runMember(root, member, runDir, parallel.vitestMaxWorkers, script, tier)
      runs[index] = run
      finished += 1
      onDone(run, finished)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(parallel.memberConcurrency, members.length) }, worker),
  )
  return runs
}
