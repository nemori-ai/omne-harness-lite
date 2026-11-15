import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import {
  closeSync,
  copyFileSync,
  existsSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import {
  VITEST_ARCHIVE_ENTRY,
  hasArchivedDirectories,
} from '@omne-harness/repo-toolchain/archive/archive-project'
import type { TestMember } from '@omne-harness/repo-toolchain/core/workspace'
import { VITEST_MAX_WORKERS_ENV, type Parallelism, type RunScript, type RunTier } from './config.ts'
import type { MemberRun, VitestJsonReport } from './ledger.ts'
import type { TimingReport } from './timing-reporter.ts'
import { pnpmCommand } from './support.ts'
import {
  checkMemberTurboConfigs,
  TIER_TASKS,
  TURBO_BIN,
  turboTestCommand,
  type TestBuild,
} from './turbo.ts'

export const slugOf = (member: string) => member.replaceAll('/', '__')

const children = new Set<ChildProcess>()
let forwarding = false

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

export interface SpawnLoggedOptions {
  readonly cwd: string
  readonly env: NodeJS.ProcessEnv
  readonly logPath: string
  readonly onLine?: (line: string) => void
}

const PIPE_DRAIN_MS = 10_000

export function spawnLogged(
  command: string,
  args: readonly string[],
  options: SpawnLoggedOptions,
): Promise<SpawnResult> {
  forwardTermination()
  const started = Date.now()
  const log = openSync(options.logPath, 'w')
  const { onLine } = options
  return new Promise(resolve => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: onLine === undefined ? ['ignore', log, log] : ['ignore', 'pipe', 'pipe'],
    })
    children.add(child)
    let finished = false
    let drainTimer: NodeJS.Timeout | undefined
    const finish = (exitCode: number) => {
      if (finished) return
      finished = true
      if (drainTimer !== undefined) clearTimeout(drainTimer)
      children.delete(child)
      closeSync(log)
      resolve({ exitCode, wallSeconds: (Date.now() - started) / 1000 })
    }
    if (onLine === undefined) {
      child.once('error', () => finish(-1))
      child.once('exit', code => finish(code ?? -1))
      return
    }
    const flushes = [child.stdout, child.stderr].map(stream => {
      let pending = ''
      const emit = (line: string) => onLine(line.endsWith('\r') ? line.slice(0, -1) : line)
      stream?.setEncoding('utf8')
      stream?.on('data', (chunk: string) => {
        writeSync(log, chunk)
        const lines = (pending + chunk).split('\n')
        pending = lines.pop() ?? ''
        for (const line of lines) emit(line)
      })
      return () => {
        if (pending !== '') emit(pending)
        pending = ''
      }
    })
    let exitCode = -1
    child.once('error', () => {
      exitCode = -1
    })
    child.once('exit', code => {
      exitCode = code ?? -1
      drainTimer = setTimeout(() => {
        child.stdout?.destroy()
        child.stderr?.destroy()
        for (const flush of flushes) flush()
        finish(exitCode)
      }, PIPE_DRAIN_MS)
    })
    // 起不来时只有 error 与 close，没有 exit；正常时 close 在 exit 之后、两条管道都读完时到。
    child.once('close', () => {
      for (const flush of flushes) flush()
      finish(exitCode)
    })
  })
}

export function readReport(path: string): VitestJsonReport | undefined {
  if (!existsSync(path)) return undefined
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<VitestJsonReport>
    return Array.isArray(parsed.testResults) ? (parsed as VitestJsonReport) : undefined
  } catch {
    return undefined
  }
}

export function readTiming(path: string): TimingReport | undefined {
  if (!existsSync(path)) return undefined
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<TimingReport>
    return Array.isArray(parsed.files) ? (parsed as TimingReport) : undefined
  } catch {
    return undefined
  }
}

async function runMember(
  root: string,
  member: TestMember,
  runDir: string,
  vitestMaxWorkers: number,
  script: RunScript,
): Promise<MemberRun> {
  const slug = slugOf(member.path)
  const args = /\bvitest\b/u.test(member.script)
    ? [
        '--exclude',
        '**/*.legacy/**',
        '--reporter=default',
        '--reporter=json',
        `--outputFile.json=${join(runDir, `${slug}.json`)}`,
      ]
    : []
  const memberDirectory = join(root, member.path)
  const env = { ...process.env, [VITEST_MAX_WORKERS_ENV]: String(vitestMaxWorkers) }
  const nativeVitest =
    /^vitest(?:\s|$)/u.test(member.script.trim()) && !/[;&|<>]/u.test(member.script)
  if (nativeVitest || hasArchivedDirectories(memberDirectory)) {
    const optionsPath = join(runDir, `${slug}.archive-options.json`)
    const prepared = spawnSync(
      process.execPath,
      ['--experimental-strip-types', VITEST_ARCHIVE_ENTRY, member.script, 'all', optionsPath],
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
  const pnpm = pnpmCommand()
  const result = await spawnLogged(pnpm.command, [...pnpm.args, 'run', script, ...args], {
    cwd: memberDirectory,
    env,
    logPath: join(runDir, `${slug}.log`),
  })
  return { member: member.path, ...result, ...reportsOf(runDir, slug) }
}

export async function runMembers(
  root: string,
  members: readonly TestMember[],
  runDir: string,
  parallel: Parallelism,
  script: RunScript,
  onDone: (run: MemberRun, finished: number) => void,
): Promise<MemberRun[]> {
  const runs = Array.from<MemberRun>({ length: members.length })
  let next = 0
  let finished = 0
  const worker = async () => {
    for (let index = next++; index < members.length; index = next++) {
      const member = members[index]
      if (member === undefined) continue
      const run = await runMember(root, member, runDir, parallel.vitestMaxWorkers, script)
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

function reportsOf(runDir: string, slug: string): Pick<MemberRun, 'report' | 'timing'> {
  const report = readReport(join(runDir, `${slug}.json`))
  const timing = readTiming(join(runDir, `${slug}.timing.json`))
  return {
    ...(report === undefined ? {} : { report }),
    ...(timing === undefined ? {} : { timing }),
  }
}

interface TurboSummary {
  readonly tasks: readonly {
    readonly package: string
    readonly task: string
    readonly execution?: {
      readonly startTime: number
      readonly endTime: number
      readonly exitCode: number | null
    }
  }[]
}

const SUMMARY_LINE = /^\s*Summary:\s+(\S.*\.json)\s*$/mu

const isNumber = (value: unknown): value is number => typeof value === 'number'

function summaryTask(value: unknown): TurboSummary['tasks'][number] | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { package: name, task, execution } = value as Record<string, unknown>
  if (typeof name !== 'string' || typeof task !== 'string') return undefined
  const { startTime, endTime, exitCode } = (execution ?? {}) as Record<string, unknown>
  return isNumber(startTime) && isNumber(endTime) && (exitCode === null || isNumber(exitCode))
    ? { package: name, task, execution: { startTime, endTime, exitCode } }
    : { package: name, task }
}

function takeSummary(
  root: string,
  output: string,
  runDir: string,
): { readonly summary: TurboSummary } | { readonly missing: string } {
  const match = SUMMARY_LINE.exec(output)
  if (match?.[1] === undefined) return { missing: 'turbo 的输出里没有 Summary 行' }
  const source = isAbsolute(match[1]) ? match[1] : join(root, match[1])
  if (!existsSync(source)) return { missing: `turbo 说的摘要文件不存在：${source}` }
  const target = join(runDir, 'turbo-summary.json')
  copyFileSync(source, target)
  rmSync(source, { force: true })
  try {
    const parsed = JSON.parse(readFileSync(target, 'utf8')) as { tasks?: unknown }
    if (!Array.isArray(parsed.tasks)) return { missing: `摘要里没有 tasks：${target}` }
    return {
      summary: { tasks: parsed.tasks.map(summaryTask).filter(task => task !== undefined) },
    }
  } catch {
    return { missing: `摘要不是 JSON：${target}` }
  }
}

function memberLogs(output: string, names: readonly string[], task: string): Map<string, string[]> {
  const logs = new Map(names.map(name => [name, [] as string[]]))
  for (const line of stripVTControlCharacters(output).split('\n')) {
    const name = names.find(candidate => line.startsWith(`${candidate}:${task}: `))
    if (name !== undefined) logs.get(name)?.push(line.slice(`${name}:${task}: `.length))
  }
  return logs
}

function hasScript(memberDirectory: string, script: string): boolean {
  try {
    const manifest = JSON.parse(readFileSync(join(memberDirectory, 'package.json'), 'utf8')) as {
      scripts?: Record<string, unknown>
    }
    return typeof manifest.scripts?.[script] === 'string'
  } catch {
    return false
  }
}

export function archivedReportFiles(
  memberDirectory: string,
  report: VitestJsonReport | undefined,
): string[] {
  return (report?.testResults ?? [])
    .map(result => relative(memberDirectory, result.name))
    .filter(file => file.split(/[\\/]/u).some(segment => segment.endsWith('.legacy')))
}

export async function runTurboTests(
  root: string,
  members: readonly TestMember[],
  runDir: string,
  parallel: Parallelism,
  tier: RunTier,
  build: TestBuild,
  onDone: (run: MemberRun, finished: number) => void,
): Promise<MemberRun[]> {
  checkMemberTurboConfigs(root, members)
  const names = members.map(member => member.name)
  const task = TIER_TASKS[tier]
  const command = turboTestCommand(names, tier, parallel, runDir, build)
  const turboLog = join(runDir, 'turbo.log')
  console.log(`$ turbo ${command.args.join(' ')}（输出写进 ${turboLog}）`)
  const turbo = await spawnLogged(TURBO_BIN, command.args, {
    cwd: root,
    env: command.env,
    logPath: turboLog,
  })
  const output = readFileSync(turboLog, 'utf8')
  const taken = takeSummary(root, output, runDir)
  const summary = 'summary' in taken ? taken.summary : undefined
  const logs = memberLogs(output, names, task)
  const failedBuilds = (summary?.tasks ?? [])
    .filter(entry => entry.task === 'build' && (entry.execution?.exitCode ?? 0) !== 0)
    .map(entry => entry.package)
  return members.map((member, index) => {
    const slug = slugOf(member.path)
    const lines = logs.get(member.name) ?? []
    const execution = summary?.tasks.find(
      entry => entry.package === member.name && entry.task === task,
    )?.execution
    const reports = reportsOf(runDir, slug)
    const archived = archivedReportFiles(join(root, member.path), reports.report)
    const problem =
      execution === undefined
        ? failedBuilds.length > 0
          ? `没有运行：构建失败（${failedBuilds.join('、')}），见 ${turboLog}`
          : !hasScript(join(root, member.path), task)
            ? `没有 \`${task}\` 脚本：成员要有 test:fast、test:slow 与 test 三个脚本`
            : 'missing' in taken
              ? `没有执行记录：${taken.missing}（turbo 退出码 ${turbo.exitCode}），见 ${turboLog}`
              : `turbo 的运行摘要里没有它的执行记录（turbo 退出码 ${turbo.exitCode}），见 ${turboLog}`
        : archived.length > 0
          ? `跑了嵌套归档目录里的测试（成员配置的 exclude 没有排除它们）：${archived.join('、')}`
          : reports.report === undefined && execution.exitCode === 0
            ? `退出码 0 却没有写出报告 ${slug}.json：成员配置没有展开 testTiers，或报告目录没传到 vitest`
            : undefined
    if (problem !== undefined) lines.push(`test-runner: ${problem}`)
    writeFileSync(join(runDir, `${slug}.log`), `${lines.join('\n')}\n`)
    const exitCode = execution === undefined ? -1 : (execution.exitCode ?? -1)
    const run: MemberRun = {
      member: member.path,
      exitCode: problem !== undefined && exitCode === 0 ? 1 : exitCode,
      wallSeconds: execution === undefined ? 0 : (execution.endTime - execution.startTime) / 1000,
      ...reports,
      ...(problem === undefined ? {} : { problem }),
    }
    onDone(run, index + 1)
    return run
  })
}
