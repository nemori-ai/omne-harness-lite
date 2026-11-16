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
import { join, relative } from 'node:path'
import { isLegacyDirectory, isLegacyFile } from '../core/check-scope.ts'
import { hasArchivedDirectories } from '../core/check-scope.ts'
import { VITEST_ARCHIVE_ENTRY } from '../archive/archive-project.ts'
import type { CoverageInput, LineHits } from './report.ts'

export interface PnpmHost {
  readonly platform: NodeJS.Platform
  readonly env: Readonly<Record<string, string | undefined>>
  readonly execPath: string
}

function realPnpmHost(): PnpmHost {
  return { platform: process.platform, env: process.env, execPath: process.execPath }
}

export function pnpmCommand(host: PnpmHost = realPnpmHost()): { command: string; args: string[] } {
  if (host.platform !== 'win32') return { command: 'pnpm', args: [] }
  const searched: string[] = []
  for (const directory of (host.env['PATH'] ?? host.env['Path'] ?? '').split(';')) {
    if (directory === '') continue
    const exe = join(directory, 'pnpm.exe')
    if (existsSync(exe)) return { command: exe, args: [] }
    if (!existsSync(join(directory, 'pnpm.cmd'))) {
      searched.push(`${directory} 里没有 pnpm.exe，也没有 pnpm.cmd`)
      continue
    }
    const entry = join(directory, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')
    if (existsSync(entry)) return { command: host.execPath, args: [entry] }
    searched.push(`${directory} 里的 pnpm.cmd 旁边没有 node_modules/pnpm/bin/pnpm.cjs`)
  }
  throw new Error(
    searched.length === 0
      ? '起不了 pnpm：PATH 里没有目录，找不到 pnpm.exe 或 pnpm.cmd'
      : `起不了 pnpm：PATH 里找过 ${searched.length} 个目录，都没有可用的 pnpm：${searched.join('；')}`,
  )
}

interface IstanbulFile {
  readonly statementMap: Readonly<Record<string, { readonly start: { readonly line: number } }>>
  readonly s: Readonly<Record<string, number>>
}

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

export function distIsStale(memberDir: string): boolean {
  const dist = newestMtime(join(memberDir, 'dist'))
  return dist !== 0 && newestMtime(join(memberDir, 'src')) > dist
}

function runsVitest(memberDir: string): boolean {
  const manifest: unknown = JSON.parse(readFileSync(join(memberDir, 'package.json'), 'utf8'))
  const test = (manifest as { scripts?: { test?: unknown } }).scripts?.test
  return typeof test === 'string' && test.includes('vitest')
}

export interface CoverageParallelism {
  readonly members: number
  readonly workers: number
}

export const COVERAGE_PARALLEL_ENV = 'OMNE_METRICS_COVERAGE_PARALLEL'

export function parseCoverageParallel(text: string): CoverageParallelism {
  const matched = /^([1-9]\d*)x([1-9]\d*)$/u.exec(text)
  if (matched === null)
    throw new Error(
      `覆盖率并发度要写成 <同时成员数>x<每成员工作进程数>（例如 3x5），现在是 ${JSON.stringify(text)}`,
    )
  return { members: Number(matched[1]), workers: Number(matched[2]) }
}

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
      } catch {}
    }
  }
  const latest = new Map<string, number>()
  for (const run of runs.sort((a, b) => a.mtime - b.mtime))
    for (const [member, value] of Object.entries(run.seconds))
      if (typeof value === 'number' && value > 0) latest.set(member, value)
  return latest
}

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/u

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
          '--coverage.reportOnFailure',
          `--coverage.reportsDirectory=${reports}`,
          '--typecheck.enabled=false',
          '--testTimeout=120000',
          '--hookTimeout=120000',
          ...(workers === undefined ? [] : [`--maxWorkers=${workers}`]),
        ],
        { cwd: memberDir, stdio: ['ignore', log, log] },
      )
    } catch (error) {
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
  readonly parallel?: CoverageParallelism
  readonly historyDirs?: readonly string[]
}

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

// 每个成员的日志放在报告目录之外：vitest 开覆盖率时会先清空报告目录。
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
