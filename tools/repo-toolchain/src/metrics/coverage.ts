// 覆盖率层：逐成员、串行地跑它自己的测试并收集 v8 覆盖率，只计本成员 `src/` 下的源码。
// 不少成员的测试经包名导入自己，执行的是 `dist/`；所以把 `dist/**/*.js` 一并纳入，由 sourcemap
// 映射回 `src/`（2026-10-01 在 core/messages 上核过：只纳入 src 时 475 条语句命中 0）。
// 只纳入 `.js`：`.map` 与 `.d.ts` 不是执行的代码，纳入后会被当成 JS 解析并报警告。
// 这要求 dist 由当前源码构建——本层不重建，只报告哪些成员的 dist 早于源码。
// 别的成员的 dist 与子进程里执行的代码不计入。
import { spawnSync } from 'node:child_process'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs'
import { join, relative } from 'node:path'
import { isLegacyDirectory, isLegacyFile } from '../core/check-scope.ts'
import { hasArchivedDirectories } from '../core/check-scope.ts'
import { VITEST_ARCHIVE_ENTRY } from '../archive/archive-project.ts'
import type { CoverageInput, LineHits } from './report.ts'

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

/**
 * 不重建 dist，不并行。测试退出码原样记下，不因失败中断：度量与测试结果分开报告。
 * 每个成员的原始输出在 `<outDir>/<成员>.vitest.log`——放在报告目录外面，因为 vitest 开覆盖率时
 * 会先清空报告目录。进度逐个成员打到 stderr，耗时一并返回。
 */
export function measureCoverage(
  root: string,
  members: readonly string[],
  outDir: string,
): CoverageInput & { readonly seconds: ReadonlyMap<string, number> } {
  const files = new Map<string, LineHits>()
  const exitCodes = new Map<string, number>()
  const seconds = new Map<string, number>()
  const staleDist: string[] = []
  const targets = members.filter(
    member => !isLegacyDirectory(member) && runsVitest(join(root, member)),
  )
  mkdirSync(outDir, { recursive: true })
  for (const [index, member] of targets.entries()) {
    const memberDir = join(root, member)
    if (distIsStale(memberDir)) staleDist.push(member)
    const slug = member.replaceAll('/', '__')
    const reports = join(outDir, slug)
    const log = openSync(join(outDir, `${slug}.vitest.log`), 'w')
    const started = Date.now()
    process.stderr.write(`覆盖率 ${index + 1}/${targets.length} ${member} …`)
    try {
      const archiveArgs: string[] = []
      const distDir = join(memberDir, 'dist')
      if (
        hasArchivedDirectories(memberDir) ||
        (existsSync(distDir) && hasArchivedDirectories(distDir))
      ) {
        const optionsPath = join(outDir, `${slug}.archive-options.json`)
        const prepared = spawnSync(
          process.execPath,
          [
            '--experimental-strip-types',
            VITEST_ARCHIVE_ENTRY,
            'vitest run',
            'coverage',
            optionsPath,
          ],
          { cwd: memberDir, encoding: 'utf8' },
        )
        if (prepared.error !== undefined) throw prepared.error
        if (prepared.status !== 0)
          throw new Error(prepared.stderr || 'Cannot prepare archived coverage scope')
        const extra: unknown = JSON.parse(readFileSync(optionsPath, 'utf8'))
        if (!Array.isArray(extra) || !extra.every((value: unknown) => typeof value === 'string'))
          throw new Error('Invalid archived coverage scope arguments')
        archiveArgs.push(...extra)
      }
      const result = spawnSync(
        'pnpm',
        [
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
        ],
        { cwd: memberDir, stdio: ['ignore', log, log] },
      )
      exitCodes.set(member, result.status ?? -1)
    } finally {
      closeSync(log)
    }
    const elapsed = Math.round((Date.now() - started) / 1000)
    seconds.set(member, elapsed)
    process.stderr.write(` ${elapsed} 秒，退出码 ${exitCodes.get(member) ?? -1}\n`)
    const final = join(reports, 'coverage-final.json')
    if (!existsSync(final)) continue
    const parsed: unknown = JSON.parse(readFileSync(final, 'utf8'))
    for (const [path, hits] of lineHitsFrom(parsed as Record<string, IstanbulFile>, root))
      if (path.startsWith(`${member}/src/`)) files.set(path, hits)
  }
  return { files, members: exitCodes, staleDist, seconds }
}
