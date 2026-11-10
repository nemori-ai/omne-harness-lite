// closeout:metrics：每个改动成员跑 vitest 出 lcov，再调一次 pqw metrics.mjs；合成不超过 12 行的摘要。
// 圈复杂度、CRAP、基线配对、断言判定全在 pqw，这里只拼参数、读回 JSON、合成摘要。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { linesArgument, type ReadingConfig } from './config.ts'
import { PQW_SCRIPTS, slugOf } from './locations.ts'
import type { ChangedMember, Grouping } from './members.ts'
import type { Executor, Outcome } from './process.ts'

export type Tier = 'fast' | 'slow'

/** 切片收口只跑快层；一程全量（--full）快慢两层都跑，pqw 对两份 lcov 取并。 */
export const tiersOf = (full: boolean): readonly Tier[] => (full ? ['fast', 'slow'] : ['fast'])

/** 构建改动成员及其上游：成员的用例常导入自己的 dist，覆盖率要从新产物取。 */
export function buildArgs(names: readonly string[]): string[] {
  return [
    'exec',
    'turbo',
    'run',
    'build',
    '--output-logs=errors-only',
    ...names.map(name => `--filter=${name}...`),
  ]
}

/**
 * 一层测试的覆盖率参数（在成员目录里 `pnpm` 之后的部分）。与 repo-toolchain src/metrics/coverage.ts 的取法一致：
 * v8、`src/**` 加 `dist/**\/*.js`、测试失败照样出报告、关类型测试、时限放宽到 120 秒、限定工作进程数；
 * 报告器换成 pqw 读的 lcovonly。
 */
export function coverageArgs(tier: Tier, reportsDirectory: string, workers: number): string[] {
  return [
    'exec',
    'vitest',
    'run',
    '--mode',
    tier,
    '--exclude=**/*.legacy/**',
    '--coverage.enabled',
    '--coverage.provider=v8',
    '--coverage.reporter=lcovonly',
    '--coverage.include=src/**',
    '--coverage.include=dist/**/*.js',
    '--coverage.reportOnFailure',
    `--coverage.reportsDirectory=${reportsDirectory}`,
    '--typecheck.enabled=false',
    '--testTimeout=120000',
    '--hookTimeout=120000',
    `--maxWorkers=${workers}`,
  ]
}

export interface MetricsCall {
  readonly root: string
  readonly base: string
  readonly lcovs: readonly string[]
  readonly scopes: readonly string[]
  readonly config: ReadingConfig
  readonly json: string
}

export function metricsArgs(call: MetricsCall): string[] {
  return [
    join(call.root, PQW_SCRIPTS, 'metrics.mjs'),
    '--repo',
    call.root,
    '--base',
    call.base,
    ...(call.lcovs.length === 0 ? [] : ['--lcov', call.lcovs.join(',')]),
    '--scope',
    call.scopes.join(','),
    '--cc',
    linesArgument(call.config.cyclomatic),
    '--crap',
    linesArgument(call.config.crap),
    '--assert-pattern',
    call.config.assertPattern,
    '--json',
    call.json,
  ]
}

/** pqw 读数 JSON 里摘要要用的字段。 */
export interface PqwFunction {
  readonly name: string
  readonly path: string
  readonly startLine: number
  readonly cyclomatic: number
  readonly crap: number | null
  readonly worse: boolean
  readonly trend?: string
  readonly band?: string
}

export interface PqwMetrics {
  readonly functions: readonly PqwFunction[]
  readonly uncovered: readonly { readonly path: string; readonly reason: string }[]
  readonly testsWithoutAssertions: readonly unknown[]
  readonly warnings?: readonly string[]
  readonly summary: { readonly overLineNotWorse?: number }
}

export interface MemberReading {
  readonly member: string
  readonly json: string
  /** 覆盖率那一趟测试非零退出的层与退出码。 */
  readonly failedTiers: readonly string[]
  /** 没有 test 脚本，没跑覆盖率，CRAP 记无覆盖。 */
  readonly untested: boolean
  readonly result?: PqwMetrics
  /** metrics.mjs 失败时的退出码与错误尾巴。 */
  readonly error?: string
}

export interface MetricsContext {
  readonly root: string
  readonly base: string
  readonly head: string
  readonly dirty: boolean
  readonly full: boolean
  readonly config: ReadingConfig
  readonly outDir: string
  readonly workers: number
  readonly exec: Executor
}

const tail = (outcome: Outcome) =>
  (outcome.stderr.trim() || outcome.stdout.trim()).split('\n').slice(-3).join(' ⏎ ')

function writeLog(path: string, outcome: Outcome) {
  writeFileSync(
    path,
    `${outcome.stdout}${outcome.stderr === '' ? '' : `\n--- stderr ---\n${outcome.stderr}`}`,
  )
}

/** 一个成员：各层跑覆盖率（lcov 写在本次产物目录里，工作树外），再调一次 metrics.mjs。 */
export async function measureMember(
  member: ChangedMember,
  context: MetricsContext,
): Promise<MemberReading> {
  const slug = slugOf(member.path)
  const dir = join(context.outDir, slug)
  mkdirSync(dir, { recursive: true })
  const lcovs: string[] = []
  const failedTiers: string[] = []
  if (member.testable)
    for (const tier of tiersOf(context.full)) {
      const reports = join(dir, tier)
      const outcome = await context.exec({
        command: 'pnpm',
        args: coverageArgs(tier, reports, context.workers),
        cwd: join(context.root, member.path),
      })
      writeLog(join(dir, `${tier}.vitest.log`), outcome)
      if (outcome.code !== 0) failedTiers.push(`${tier} 退出 ${outcome.code ?? '信号'}`)
      if (existsSync(join(reports, 'lcov.info'))) lcovs.push(join(reports, 'lcov.info'))
    }
  const json = join(context.outDir, `${slug}.metrics.json`)
  const outcome = await context.exec({
    command: process.execPath,
    args: metricsArgs({
      root: context.root,
      base: context.base,
      lcovs,
      scopes: member.scopes,
      config: context.config,
      json,
    }),
    cwd: context.root,
  })
  writeLog(join(dir, 'metrics.log'), outcome)
  const reading = { member: member.path, json, failedTiers, untested: !member.testable }
  if (outcome.code !== 0 || !existsSync(json))
    return { ...reading, error: `metrics.mjs 退出 ${outcome.code ?? '信号'}：${tail(outcome)}` }
  return { ...reading, result: JSON.parse(readFileSync(json, 'utf8')) as PqwMetrics }
}

/** 摘要的上限，与 omne summary.md 的习惯相同。 */
export const SUMMARY_LIMIT = 12

/** 读的人要知道的限制，摘要末行原样写出。 */
export const METRICS_LIMITS: readonly string[] = [
  '依赖方向、环与新增边不在本读数，看 pnpm run lint:deps',
]

const short = (sha: string) => sha.slice(0, 9)
const crapText = (crap: number | null) => (crap === null ? '无覆盖' : crap.toFixed(1))

export function metricsSummary(
  readings: readonly MemberReading[],
  grouping: Grouping,
  context: Pick<MetricsContext, 'base' | 'head' | 'dirty' | 'full' | 'config'>,
): string[] {
  const results = readings.flatMap(reading =>
    reading.result === undefined ? [] : [reading.result],
  )
  const functions = results.flatMap(result => result.functions)
  const worse = functions.filter(f => f.worse)
  const { warn, alert } = context.config.cyclomatic
  const failedTests = readings.filter(r => r.failedTiers.length > 0)
  const failedReadings = readings.filter(r => r.error !== undefined)
  const untested = readings.filter(r => r.untested)
  const lines = [
    `结构读数 ${short(context.head)}${context.dirty ? '（工作树不干净）' : ''} · 基线 ${short(context.base)} · ${context.full ? '快慢两层' : '快层'} · 圈复杂度与 CRAP 线 warn ${warn}／alert ${alert}`,
    `范围：改动成员 ${grouping.members.length} 个、改动函数 ${functions.length} 个${grouping.outside.length === 0 ? '' : `；成员外改动 ${grouping.outside.length} 个文件，只量复杂度`}`,
    `变差 ${worse.length} 个（逐条交代）；过线没变差 ${results.reduce((n, r) => n + (r.summary.overLineNotWorse ?? 0), 0)} 个；拿不准的基线 ${functions.filter(f => f.trend === 'unsure').length} 个`,
    ...worse
      .slice(0, 3)
      .map(
        f =>
          `! ${f.name} ${f.path}:${f.startLine} 圈复杂度 ${f.cyclomatic} CRAP ${crapText(f.crap)}`,
      ),
    ...(worse.length > 3 ? [`另有 ${worse.length - 3} 个变差，见各成员 JSON`] : []),
    `无断言用例 ${results.reduce((n, r) => n + r.testsWithoutAssertions.length, 0)} 个；未覆盖的改动文件 ${results.reduce((n, r) => n + r.uncovered.length, 0)} 个；覆盖率警告 ${results.reduce((n, r) => n + (r.warnings?.length ?? 0), 0)} 条`,
    ...(failedTests.length === 0
      ? []
      : [
          `覆盖率那趟测试没通过：${failedTests.map(r => `${r.member}（${r.failedTiers.join('，')}）`).join('、')}`,
        ]),
    ...(untested.length === 0
      ? []
      : [`没有 test 脚本、CRAP 记无覆盖：${untested.map(r => r.member).join('、')}`]),
    ...(failedReadings.length === 0
      ? []
      : [`读数失败：${failedReadings.map(r => `${r.member}（${r.error}）`).join('；')}`]),
    `限制：${METRICS_LIMITS.join('；')}`,
  ]
  return lines
}
