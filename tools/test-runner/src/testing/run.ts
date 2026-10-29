// 运行器：成员测试交给 turbo 跑一层任务（`test:fast`、`test:slow` 或 `test`），可执行验收仍逐成员跑它的
// `acceptance` 脚本；两种都按给定的并行度、一个失败不拦其余的。每个成员的输出落到运行目录里的日志，
// vitest 的 JSON 报告与计时报告落在旁边，供账本与失败归因读取。
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import {
  closeSync,
  copyFileSync,
  existsSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
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

async function runMember(
  root: string,
  member: TestMember,
  runDir: string,
  vitestMaxWorkers: number,
  script: RunScript,
): Promise<MemberRun> {
  const slug = slugOf(member.path)
  // 只有 vitest 的脚本才认这几个参数；别的脚本原样跑，账本里只有成员一级的耗时。
  // 计时报告器的输出路径只能写在配置里（命令行给不了报告器选项），验收的账本因此没有导入耗时，贴线按缺省时限判。
  // 命令行的 `--reporter` 替换配置里的报告器，`vitest.tiers.mts` 的过滤守卫因此不在场；这里不带过滤，也用不到它。
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

/** 同时最多跑 `memberConcurrency` 个成员，各跑它的 `script` 脚本（验收用）；返回顺序与传入顺序一致。 */
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

/** 成员在运行目录里的两份报告；没写出来的就不带。 */
function reportsOf(runDir: string, slug: string): Pick<MemberRun, 'report' | 'timing'> {
  const report = readReport(join(runDir, `${slug}.json`))
  const timing = readTiming(join(runDir, `${slug}.timing.json`))
  return {
    ...(report === undefined ? {} : { report }),
    ...(timing === undefined ? {} : { timing }),
  }
}

/** turbo 运行摘要里这里用到的部分：每个任务的包名、任务名与执行结果（没执行的任务没有 `execution`）。 */
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

// turbo 在输出末尾写一行 `Summary: <路径>`。
const SUMMARY_LINE = /^\s*Summary:\s+(\S.*\.json)\s*$/mu

const isNumber = (value: unknown): value is number => typeof value === 'number'

/** 摘要里的一个任务；执行记录的起止时间不是数就当作没有执行记录。 */
function summaryTask(value: unknown): TurboSummary['tasks'][number] | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { package: name, task, execution } = value as Record<string, unknown>
  if (typeof name !== 'string' || typeof task !== 'string') return undefined
  const { startTime, endTime, exitCode } = (execution ?? {}) as Record<string, unknown>
  return isNumber(startTime) && isNumber(endTime) && (exitCode === null || isNumber(exitCode))
    ? { package: name, task, execution: { startTime, endTime, exitCode } }
    : { package: name, task }
}

/**
 * 读 turbo 的运行摘要并挪进运行目录（不让它在被测检出的 `.turbo/runs` 里越攒越多）。
 * 拿不到时给出原因，写进各成员的问题，不只说「没有执行记录」。
 */
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

/** turbo 的输出按 `<包名>:<任务>: ` 前缀拆给各成员，去掉颜色码（turbo 给子进程的输出强制着色）。 */
function memberLogs(output: string, names: readonly string[], task: string): Map<string, string[]> {
  const logs = new Map(names.map(name => [name, [] as string[]]))
  for (const line of stripVTControlCharacters(output).split('\n')) {
    const name = names.find(candidate => line.startsWith(`${candidate}:${task}: `))
    if (name !== undefined) logs.get(name)?.push(line.slice(`${name}:${task}: `.length))
  }
  return logs
}

/** 成员清单里有没有这个脚本；读不出清单当作没有。 */
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

/** 报告里落在嵌套归档目录（名字以 `.legacy` 结尾）里的测试文件；成员配置该排除它们。 */
export function archivedReportFiles(
  memberDirectory: string,
  report: VitestJsonReport | undefined,
): string[] {
  return (report?.testResults ?? [])
    .map(result => relative(memberDirectory, result.name))
    .filter(file => file.split(/[\\/]/u).some(segment => segment.endsWith('.legacy')))
}

/**
 * 用 turbo 跑一批成员的 `tier` 那一层，同时最多 `memberConcurrency` 个成员；`build` 定由谁构建（见 turboTestCommand）。
 * 整份输出落 `turbo.log`，再按成员拆成各自的日志；退出码与耗时取自 turbo 的运行摘要，摘要里没有执行记录的成员记为 -1
 * （它或上游的构建失败时就是这样，失败的构建点名写进它的问题）。
 * 报告里出现嵌套归档目录里的文件就判这个成员失败：排除没生效，跑了不该跑的测试。退出码 0 却没有报告也判失败：
 * 报告由成员配置挂上，缺了就看不出跑了什么。返回顺序与传入顺序一致。
 */
export async function runTurboTests(
  root: string,
  members: readonly TestMember[],
  runDir: string,
  parallel: Parallelism,
  tier: RunTier,
  build: TestBuild,
  onDone: (run: MemberRun, finished: number) => void,
): Promise<MemberRun[]> {
  // 成员目录下的 turbo.json 能给测试任务开缓存，第二次就回放日志、报告通过；`--all` 不经计划，这里再核一次。
  checkMemberTurboConfigs(root, members)
  const names = members.map(member => member.name)
  const task = TIER_TASKS[tier]
  const command = turboTestCommand(names, tier, parallel, runDir, build)
  const turboLog = join(runDir, 'turbo.log')
  // turbo 的输出按成员成组，整层跑完才逐个报结果；跑的时候看这份日志。
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
