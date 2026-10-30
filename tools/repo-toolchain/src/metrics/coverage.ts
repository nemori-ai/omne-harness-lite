// 覆盖率层：逐成员跑它自己的测试并收集 v8 覆盖率，只计本成员 `src/` 下的源码；成员之间串行，或在给定并发度内并行。
// 不少成员的测试经包名导入自己，执行的是 `dist/`；所以把 `dist/**/*.js` 一并纳入，由 sourcemap
// 映射回 `src/`（2026-10-01 在 core/messages 上核过：只纳入 src 时 475 条语句命中 0）。
// 只纳入 `.js`：`.map` 与 `.d.ts` 不是执行的代码，纳入后会被当成 JS 解析并报警告。
// 这要求 dist 由当前源码构建——本层不重建，只报告哪些成员的 dist 早于源码。
// 别的成员的 dist 与子进程里执行的代码不计入。
import { spawn, spawnSync, type SpawnOptions } from 'node:child_process'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  statSync,
  type Dirent,
} from 'node:fs'
import { delimiter, join, relative } from 'node:path'
import { isLegacyDirectory, isLegacyFile } from '../core/check-scope.ts'
import { hasArchivedDirectories } from '../core/check-scope.ts'
import { VITEST_ARCHIVE_ENTRY } from '../archive/archive-project.ts'
import type { CoverageInput, LineHits } from './report.ts'

/**
 * 起 pnpm 的可执行文件与前置参数。POSIX 上就是 `pnpm`；Windows 上 PATH 里的 `pnpm` 是 `pnpm.cmd`，
 * Node 不经 shell 起不了它，改为用本进程的 Node 运行同一目录下 `node_modules/pnpm/bin/pnpm.cjs`
 * （npm 全局安装的布局）。找不到就报错，不把起不来记成一个退出码。
 */
function pnpmCommand(): { command: string; args: string[] } {
  if (process.platform !== 'win32') return { command: 'pnpm', args: [] }
  const seen: string[] = []
  for (const directory of (process.env['PATH'] ?? process.env['Path'] ?? '').split(delimiter)) {
    if (directory === '' || !existsSync(join(directory, 'pnpm.cmd'))) continue
    const entry = join(directory, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')
    if (existsSync(entry)) return { command: process.execPath, args: [entry] }
    seen.push(join(directory, 'pnpm.cmd'))
  }
  throw new Error(
    seen.length === 0
      ? 'PATH 里没有 pnpm.cmd'
      : `${seen.join('、')} 旁边都没有 node_modules/pnpm/bin/pnpm.cjs，起不了 pnpm`,
  )
}

interface IstanbulFile {
  readonly statementMap: Readonly<Record<string, { readonly start: { readonly line: number } }>>
  readonly s: Readonly<Record<string, number>>
}

/** istanbul 形状的 `coverage-final.json` → 仓库相对路径上的行命中。 */
export function lineHitsFrom(
  report: Readonly<Record<string, IstanbulFile>>,
  root: string,
): Map<string, LineHits> {
  const files = new Map<string, LineHits>()
  for (const [absolute, entry] of Object.entries(report)) {
    const path = relative(root, absolute).replaceAll('\\', '/')
    if (isLegacyFile(path)) continue
    const hits = new Map<number, boolean>()
    for (const [id, location] of Object.entries(entry.statementMap)) {
      const line = location.start.line
      hits.set(line, (hits.get(line) ?? false) || (entry.s[id] ?? 0) > 0)
    }
    files.set(path, hits)
  }
  return files
}

function newestMtime(dir: string): number {
  let newest = 0
  if (!existsSync(dir)) return newest
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory() && isLegacyDirectory(entry)) continue
    newest = Math.max(newest, stat.isDirectory() ? newestMtime(full) : stat.mtimeMs)
  }
  return newest
}

/** 有 dist 而它早于 src 里最新的文件：映射回源码的行号可能对不上。 */
export function distIsStale(memberDir: string): boolean {
  const dist = newestMtime(join(memberDir, 'dist'))
  return dist !== 0 && newestMtime(join(memberDir, 'src')) > dist
}

function runsVitest(memberDir: string): boolean {
  const manifest: unknown = JSON.parse(readFileSync(join(memberDir, 'package.json'), 'utf8'))
  const test = (manifest as { scripts?: { test?: unknown } }).scripts?.test
  return typeof test === 'string' && test.includes('vitest')
}

/** 跨成员并行的并发度：同时几个成员，每个成员的 vitest 至多几个工作进程。 */
export interface CoverageParallelism {
  readonly members: number
  readonly workers: number
}

/**
 * `--coverage-parallel` 的环境变量写法。根脚本 `scripts/metrics.sh` 经它把测试运行器给的并发度交下来：
 * 不认它的旧版本 omne-metrics 照旧串行，不因多一个参数而失败。
 */
export const COVERAGE_PARALLEL_ENV = 'OMNE_METRICS_COVERAGE_PARALLEL'

/** `<同时成员数>x<每成员工作进程数>`，两个都是正整数。 */
export function parseCoverageParallel(text: string): CoverageParallelism {
  const matched = /^([1-9]\d*)x([1-9]\d*)$/u.exec(text)
  if (matched === null)
    throw new Error(
      `覆盖率并发度要写成 <同时成员数>x<每成员工作进程数>（例如 3x5），现在是 ${JSON.stringify(text)}`,
    )
  return { members: Number(matched[1]), workers: Number(matched[2]) }
}

/**
 * 历次度量记下的各成员覆盖率耗时（各目录下 `<运行>/metrics.json` 的 `meta.coverageSeconds`），
 * 同一成员取最新一份里的正数。只用来排先后，不影响读数；读不了的目录与文件跳过。
 */
export function previousCoverageSeconds(historyDirs: readonly string[]): Map<string, number> {
  const runs: { readonly mtime: number; readonly seconds: Readonly<Record<string, unknown>> }[] = []
  for (const dir of new Set(historyDirs)) {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }
    for (const entry of entries) {
      const file = join(dir, entry, 'metrics.json')
      try {
        const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
          meta?: { coverageSeconds?: unknown }
        }
        const seconds = parsed.meta?.coverageSeconds
        if (typeof seconds === 'object' && seconds !== null)
          runs.push({ mtime: statSync(file).mtimeMs, seconds: seconds as Record<string, unknown> })
      } catch {
        // 没有或读不了：这一份不参与排序。
      }
    }
  }
  const latest = new Map<string, number>()
  for (const run of runs.sort((a, b) => a.mtime - b.mtime))
    for (const [member, value] of Object.entries(run.seconds))
      if (typeof value === 'number' && value > 0) latest.set(member, value)
  return latest
}

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/u

/** 成员里的测试文件数，不算 node_modules、dist、点目录与归档目录。 */
export function countTestFiles(memberDir: string): number {
  let count = 0
  const visit = (dir: string): void => {
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.'))
          continue
        if (!isLegacyDirectory(entry.name)) visit(join(dir, entry.name))
      } else if (TEST_FILE.test(entry.name)) count += 1
    }
  }
  visit(memberDir)
  return count
}

/**
 * 预计最久的先跑：有上次耗时用上次耗时；没有的按测试文件数，乘上有耗时的成员平均每个文件的秒数
 * （都没有就按每个文件 1 秒）。一样久的保持原顺序。
 */
export function longestFirst(
  targets: readonly string[],
  seconds: ReadonlyMap<string, number>,
  testFiles: ReadonlyMap<string, number>,
): string[] {
  let knownSeconds = 0
  let knownFiles = 0
  for (const member of targets) {
    const spent = seconds.get(member)
    const files = testFiles.get(member) ?? 0
    if (spent !== undefined && files > 0) {
      knownSeconds += spent
      knownFiles += files
    }
  }
  const perFile = knownFiles > 0 ? knownSeconds / knownFiles : 1
  const estimate = (member: string) => seconds.get(member) ?? (testFiles.get(member) ?? 0) * perFile
  return targets
    .map((member, index) => ({ member, index, estimate: estimate(member) }))
    .sort((a, b) => b.estimate - a.estimate || a.index - b.index)
    .map(entry => entry.member)
}

/**
 * 至多 `limit` 个任务同时跑，结果按 `items` 的顺序返回，与完成先后无关。
 * 一个任务失败后不再开新任务，等已开始的结束，再抛出第一个错误：不留下没人等的子进程。
 */
export async function inPool<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  let next = 0
  let failure: { readonly error: unknown } | undefined
  const lane = async (): Promise<void> => {
    while (failure === undefined && next < items.length) {
      const index = next
      next += 1
      try {
        results[index] = await task(items[index] as T)
      } catch (error) {
        failure ??= { error }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane))
  if (failure !== undefined) throw failure.error
  return results
}

/** 子进程的退出码；被信号终止记 -1（与 `spawnSync` 的 `status ?? -1` 相同）。起不来时拒绝。 */
function exitCodeOf(
  command: string,
  args: readonly string[],
  options: SpawnOptions,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options)
    child.once('error', reject)
    child.once('close', code => resolve(code ?? -1))
  })
}

interface MemberCoverage {
  readonly exitCode: number
  readonly seconds: number
  readonly files: readonly (readonly [string, LineHits])[]
}

/** 准备归档目录的排除参数：成员或它的 dist 里有 `.legacy` 目录时才需要。 */
function archiveArguments(memberDir: string, optionsPath: string): string[] {
  const distDir = join(memberDir, 'dist')
  if (
    !hasArchivedDirectories(memberDir) &&
    !(existsSync(distDir) && hasArchivedDirectories(distDir))
  )
    return []
  const prepared = spawnSync(
    process.execPath,
    ['--experimental-strip-types', VITEST_ARCHIVE_ENTRY, 'vitest run', 'coverage', optionsPath],
    { cwd: memberDir, encoding: 'utf8' },
  )
  if (prepared.error !== undefined) throw prepared.error
  if (prepared.status !== 0)
    throw new Error(prepared.stderr || 'Cannot prepare archived coverage scope')
  const extra: unknown = JSON.parse(readFileSync(optionsPath, 'utf8'))
  if (!Array.isArray(extra) || !extra.every((value: unknown) => typeof value === 'string'))
    throw new Error('Invalid archived coverage scope arguments')
  return extra
}

/** 跑一个成员的测试并读回它 `src/` 下的行命中。`workers` 给了才限定 vitest 的工作进程数。 */
async function coverMember(
  root: string,
  member: string,
  outDir: string,
  workers: number | undefined,
): Promise<MemberCoverage> {
  const memberDir = join(root, member)
  const slug = member.replaceAll('/', '__')
  const reports = join(outDir, slug)
  const log = openSync(join(outDir, `${slug}.vitest.log`), 'w')
  const started = Date.now()
  let exitCode: number
  try {
    const archiveArgs = archiveArguments(memberDir, join(outDir, `${slug}.archive-options.json`))
    const pnpm = pnpmCommand()
    try {
      exitCode = await exitCodeOf(
        pnpm.command,
        [
          ...pnpm.args,
          'exec',
          'vitest',
          'run',
          '--exclude=**/*.legacy/**',
          '--coverage.enabled',
          '--coverage.provider=v8',
          '--coverage.reporter=json',
          '--coverage.include=src/**',
          '--coverage.include=dist/**/*.js',
          ...archiveArgs,
          // 测试失败时照样出报告；失败由退出码单独记下。
          '--coverage.reportOnFailure',
          `--coverage.reportsDirectory=${reports}`,
          '--typecheck.enabled=false',
          // 插桩会拖慢大输入用例；这一趟是取度量，不是测试结论，超时放宽。
          '--testTimeout=120000',
          '--hookTimeout=120000',
          ...(workers === undefined ? [] : [`--maxWorkers=${workers}`]),
        ],
        { cwd: memberDir, stdio: ['ignore', log, log] },
      )
    } catch (error) {
      // A vitest that could not start is not a test outcome: the exit code would say "tests failed".
      throw new Error(
        `覆盖率运行无法启动（${member}）：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  } finally {
    closeSync(log)
  }
  const seconds = Math.round((Date.now() - started) / 1000)
  const final = join(reports, 'coverage-final.json')
  if (!existsSync(final)) return { exitCode, seconds, files: [] }
  const parsed: unknown = JSON.parse(readFileSync(final, 'utf8'))
  const files = [...lineHitsFrom(parsed as Record<string, IstanbulFile>, root)].filter(([path]) =>
    path.startsWith(`${member}/src/`),
  )
  return { exitCode, seconds, files }
}

export interface CoverageOptions {
  /** 不给就逐个成员串行、不限定 vitest 的工作进程数（vitest 自己按核数定）。 */
  readonly parallel?: CoverageParallelism
  /** 并行时排先后用：到这些目录下找历次的 `metrics.json`。 */
  readonly historyDirs?: readonly string[]
}

/** 并行跑，结果按 `targets` 的原顺序排好。 */
async function coverInParallel(
  root: string,
  targets: readonly string[],
  outDir: string,
  parallel: CoverageParallelism,
  historyDirs: readonly string[],
): Promise<MemberCoverage[]> {
  const order = longestFirst(
    targets,
    previousCoverageSeconds(historyDirs),
    new Map(targets.map(member => [member, countTestFiles(join(root, member))])),
  )
  process.stderr.write(
    `覆盖率：${targets.length} 个成员，同时 ${parallel.members} 个，每个至多 ${parallel.workers} 个工作进程，预计最久的先跑\n`,
  )
  let finished = 0
  const covered = await inPool(order, parallel.members, async member => {
    const result = await coverMember(root, member, outDir, parallel.workers)
    finished += 1
    process.stderr.write(
      `覆盖率 ${finished}/${targets.length} ${member} ${result.seconds} 秒，退出码 ${result.exitCode}\n`,
    )
    return result
  })
  const byMember = new Map(order.map((member, index) => [member, covered[index]]))
  return targets.map(member => byMember.get(member) as MemberCoverage)
}

/**
 * 不重建 dist。测试退出码原样记下，不因失败中断：度量与测试结果分开报告。
 * 每个成员的原始输出在 `<outDir>/<成员>.vitest.log`——放在报告目录外面，因为 vitest 开覆盖率时
 * 会先清空报告目录。进度打到 stderr，耗时一并返回。
 *
 * 不给 `parallel` 就逐个成员串行。给了就跨成员并行：同时至多 `members` 个成员，每个的 vitest 至多
 * `workers` 个工作进程，预计最久的先开始（见 `longestFirst`）。各成员的日志与报告目录互不相干，
 * 结果按 `members` 的原顺序合并，所以读数与串行时相同，不随完成先后变。
 */
export async function measureCoverage(
  root: string,
  members: readonly string[],
  outDir: string,
  options: CoverageOptions = {},
): Promise<CoverageInput & { readonly seconds: ReadonlyMap<string, number> }> {
  const targets = members.filter(
    member => !isLegacyDirectory(member) && runsVitest(join(root, member)),
  )
  mkdirSync(outDir, { recursive: true })
  // 本层不重建 dist，跑测试也不改它，所以先核后核都一样；按原顺序列出。
  const staleDist = targets.filter(member => distIsStale(join(root, member)))
  let results: MemberCoverage[] = []
  if (options.parallel === undefined)
    for (const [index, member] of targets.entries()) {
      process.stderr.write(`覆盖率 ${index + 1}/${targets.length} ${member} …`)
      const covered = await coverMember(root, member, outDir, undefined)
      process.stderr.write(` ${covered.seconds} 秒，退出码 ${covered.exitCode}\n`)
      results.push(covered)
    }
  else
    results = await coverInParallel(
      root,
      targets,
      outDir,
      options.parallel,
      options.historyDirs ?? [],
    )
  const files = new Map<string, LineHits>()
  const exitCodes = new Map<string, number>()
  const seconds = new Map<string, number>()
  for (const [index, member] of targets.entries()) {
    const result = results[index] as MemberCoverage
    exitCodes.set(member, result.exitCode)
    seconds.set(member, result.seconds)
    for (const [path, hits] of result.files) files.set(path, hits)
  }
  return { files, members: exitCodes, staleDist, seconds }
}
