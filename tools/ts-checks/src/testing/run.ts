// 运行器：按给定的并行度逐成员跑它自己的 `test` 脚本，一个失败不拦其余的；
// 每个成员的输出落到运行目录里的日志，vitest 的 JSON 报告落在旁边，供账本与失败归因读取。
import { spawn, type ChildProcess } from 'node:child_process'
import { closeSync, existsSync, openSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestMember } from './affected.ts'
import { VITEST_MAX_WORKERS_ENV, type Parallelism } from './config.ts'
import type { MemberRun, VitestJsonReport } from './ledger.ts'

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

async function runMember(
  root: string,
  member: TestMember,
  runDir: string,
  vitestMaxWorkers: number,
): Promise<MemberRun> {
  const slug = slugOf(member.path)
  const reportPath = join(runDir, `${slug}.json`)
  // 只有 vitest 的脚本才认这几个参数；别的脚本原样跑，账本里只有成员一级的耗时。
  const reporters = /\bvitest\b/u.test(member.testScript)
    ? ['--reporter=default', '--reporter=json', `--outputFile.json=${reportPath}`]
    : []
  const result = await spawnLogged('pnpm', ['run', 'test', ...reporters], {
    cwd: join(root, member.path),
    env: { ...process.env, [VITEST_MAX_WORKERS_ENV]: String(vitestMaxWorkers) },
    logPath: join(runDir, `${slug}.log`),
  })
  const report = readReport(reportPath)
  return { member: member.path, ...result, ...(report === undefined ? {} : { report }) }
}

/** 同时最多跑 `memberConcurrency` 个成员；返回顺序与传入顺序一致。 */
export async function runMembers(
  root: string,
  members: readonly TestMember[],
  runDir: string,
  parallel: Parallelism,
  onDone: (run: MemberRun, finished: number) => void,
): Promise<MemberRun[]> {
  const runs = new Array<MemberRun>(members.length)
  let next = 0
  let finished = 0
  const worker = async () => {
    for (let index = next++; index < members.length; index = next++) {
      const member = members[index]
      if (member === undefined) continue
      const run = await runMember(root, member, runDir, parallel.vitestMaxWorkers)
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
