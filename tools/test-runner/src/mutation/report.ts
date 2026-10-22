// 读 Stryker 的 JSON 报告（mutation-testing-report-schema 1.x），只留落在要变异的行上的变异体，按成员汇总。
import type { RunRecord } from './run-reporter.ts'
import { withinTarget, type MutationTarget } from './scope.ts'

/**
 * 报告里的变异体状态；被杀与超时算测出来了，存活与无覆盖算没测出来，其余不计分。
 * 只因时限到了而超时的，以单独复核的判定为准（#649，见 `classify`）。
 */
export const MUTANT_STATUSES = [
  'Killed',
  'Timeout',
  'Survived',
  'NoCoverage',
  'CompileError',
  'RuntimeError',
  'Ignored',
  'Pending',
] as const
export type MutantStatus = (typeof MUTANT_STATUSES)[number]

interface Position {
  readonly line: number
  readonly column: number
}

export interface ReportMutant {
  readonly id: string
  readonly mutatorName: string
  readonly replacement?: string
  readonly status: MutantStatus
  readonly static?: boolean
  readonly location: { readonly start: Position; readonly end: Position }
  /** 为这个变异体实际跑完的用例数。 */
  readonly testsCompleted?: number
  /** 初跑时覆盖到它的用例。 */
  readonly coveredBy?: readonly string[]
  /** Stryker 给的原因；超时的变异体只有命中次数超限时才有。 */
  readonly statusReason?: string
}

export interface MutationReport {
  /** 键是相对 Stryker 工作目录（成员目录）的路径。 */
  readonly files: Readonly<
    Record<string, { readonly source: string; readonly mutants: readonly ReportMutant[] }>
  >
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPosition(value: unknown): value is Position {
  return (
    isRecord(value) &&
    Number.isInteger(value['line']) &&
    typeof value['line'] === 'number' &&
    value['line'] > 0 &&
    Number.isInteger(value['column']) &&
    typeof value['column'] === 'number' &&
    value['column'] > 0
  )
}

function isReportMutant(value: unknown): value is ReportMutant {
  if (!isRecord(value) || !isRecord(value['location'])) return false
  return (
    typeof value['id'] === 'string' &&
    typeof value['mutatorName'] === 'string' &&
    MUTANT_STATUSES.some(status => status === value['status']) &&
    isPosition(value['location']['start']) &&
    isPosition(value['location']['end']) &&
    (value['replacement'] === undefined || typeof value['replacement'] === 'string') &&
    (value['static'] === undefined || typeof value['static'] === 'boolean') &&
    (value['testsCompleted'] === undefined ||
      (typeof value['testsCompleted'] === 'number' &&
        Number.isInteger(value['testsCompleted']) &&
        value['testsCompleted'] >= 0)) &&
    (value['statusReason'] === undefined || typeof value['statusReason'] === 'string') &&
    (value['coveredBy'] === undefined ||
      (Array.isArray(value['coveredBy']) && value['coveredBy'].every(id => typeof id === 'string')))
  )
}

export function isMutationReport(value: unknown): value is MutationReport {
  return (
    isRecord(value) &&
    isRecord(value['files']) &&
    Object.values(value['files']).every(
      file =>
        isRecord(file) &&
        typeof file['source'] === 'string' &&
        Array.isArray(file['mutants']) &&
        file['mutants'].every(isReportMutant),
    )
  )
}

export interface Finding {
  /** 仓库相对路径。 */
  readonly file: string
  readonly line: number
  readonly mutator: string
  readonly original: string
  readonly replacement: string
  /** 模块加载时就求值的变异体：Stryker 只能为它跑全部测试。 */
  readonly static: boolean
}

/** 不能计分的原因。 */
export type InvalidReason =
  /** 报成存活、有用例覆盖、却一条用例都没跑完：运行器没跑测试，不是测试没测出来（#405）。 */
  | 'notRun'
  /** 只因时限到了而超时，没有单独复核的判定（#649）。 */
  | 'timeoutUnchecked'

export interface InvalidFinding extends Finding {
  readonly reason: InvalidReason
}

/** 第一遍只因时限到了而超时、单独复核后得到判定的变异体（#649）。 */
export interface RecheckedFinding extends Finding {
  /** 复核的判定，已计入各状态与分数。 */
  readonly verdict: MutantStatus
}

/** 类型测试在 static 变异体的运行中是否缺席（#649）。 */
export interface TypeTestReading {
  /** 初跑跑的类型测试数。 */
  readonly dryRun: number
  /** 有运行记录的 static 变异体（在要变异的行上）。 */
  readonly staticRuns: number
  /** 其中类型测试比初跑少的。 */
  readonly withoutTypeTests: number
}

export interface MemberMutation {
  readonly member: string
  /** 测量有效：原始报告没有 RuntimeError，也没有不能计分的变异体。无效时不给分数。 */
  readonly valid: boolean
  readonly counts: Readonly<Record<MutantStatus, number>>
  /** 测出来的占（测出来＋没测出来）的百分比；测量无效或一个都没有时为 null。 */
  readonly score: number | null
  readonly survived: readonly Finding[]
  readonly noCoverage: readonly Finding[]
  /** 不能计分的变异体：不计入各状态与分数，使测量无效。 */
  readonly invalid: readonly InvalidFinding[]
  /** 复核过的变异体：按复核的判定计入。 */
  readonly rechecked: readonly RecheckedFinding[]
  /** 原始报告（第一遍与复核）里的 RuntimeError，含不在要变异的行上的；有就使测量无效。 */
  readonly runtimeErrors: number
  /** 没有运行记录，或初跑没有类型测试时为 null。 */
  readonly typeTests: TypeTestReading | null
  /** 报告里有、却不在要变异的行上的变异体（跨行的表达式等）；不计入上面各项。 */
  readonly outside: number
}

const SHOWN = 80

/** 变异体在源码里替换掉的那段原文，压成一行。 */
function originalText(source: string, mutant: ReportMutant): string {
  const lines = source.split('\n')
  const { start, end } = mutant.location
  const picked =
    start.line === end.line
      ? (lines[start.line - 1] ?? '').slice(start.column - 1, end.column - 1)
      : [
          (lines[start.line - 1] ?? '').slice(start.column - 1),
          ...lines.slice(start.line, end.line - 1),
          (lines[end.line - 1] ?? '').slice(0, end.column - 1),
        ].join('\n')
  return oneLine(picked)
}

function oneLine(text: string): string {
  const flat = text.replaceAll(/\s+/gu, ' ').trim()
  return flat.length > SHOWN ? `${flat.slice(0, SHOWN)}…` : flat
}

const zeroCounts = (): Record<MutantStatus, number> =>
  Object.fromEntries(MUTANT_STATUSES.map(status => [status, 0])) as Record<MutantStatus, number>

/** 报成存活、有用例覆盖、却一条用例都没跑完（#405）。两个字段缺了任一个，按普通存活算。 */
function ranNoTests(mutant: ReportMutant): boolean {
  return (
    mutant.status === 'Survived' &&
    mutant.testsCompleted === 0 &&
    (mutant.coveredBy?.length ?? 0) > 0
  )
}

/**
 * Stryker 命中次数超限判出的超时带这个原因（@stryker-mutator/api 10.0.0 的 `determineHitLimitReached`）：
 * 变异让被变异的代码比初跑多执行了上百倍，是变异造成的，算测出来。时限到了的超时没有原因。
 */
export const HIT_LIMIT_REASON = 'Hit limit reached'

/**
 * 只因时限到了而超时（#649）。时限按单进程的初跑估出，变异时几个工作进程同时冷启动或机器负载高，
 * 真实存活也会超时；真的死循环同样只能这样超时。只凭这一次分不出两者，所以要单独复核。
 */
export function wallClockTimeout(mutant: ReportMutant): boolean {
  return (
    mutant.status === 'Timeout' && !(mutant.statusReason?.startsWith(HIT_LIMIT_REASON) ?? false)
  )
}

/** 要单独复核的变异体：在要变异的行上、只因时限到了而超时的；`file` 是报告里的键。 */
export function recheckTargets(
  target: MutationTarget,
  report: MutationReport,
): { readonly file: string; readonly mutant: ReportMutant }[] {
  return Object.entries(report.files).flatMap(([file, entry]) =>
    entry.mutants
      .filter(
        mutant =>
          wallClockTimeout(mutant) &&
          withinTarget(
            target,
            `${target.member.path}/${file}`,
            mutant.location.start.line,
            mutant.location.end.line,
          ),
      )
      .map(mutant => ({ file, mutant })),
  )
}

/**
 * 只变异这一个位置的 Stryker mutate 条目。报告的列从 1 起，mutate 条目的列与 babel 一样从 0 起；
 * 范围内嵌套的变异体也会被变异，复核按位置、算子与替换对回原来的那个。
 */
export function exactEntry(file: string, mutant: ReportMutant): string {
  const { start, end } = mutant.location
  return `${file}:${start.line}:${start.column - 1}-${end.line}:${end.column - 1}`
}

const identity = (file: string, mutant: ReportMutant) =>
  JSON.stringify([file, mutant.location, mutant.mutatorName, mutant.replacement ?? null])

/** 一个变异体计不计分：计分时给出计入的状态，不计分时给出原因。 */
type Verdict =
  | { readonly kind: 'scored'; readonly status: MutantStatus; readonly rechecked: boolean }
  | { readonly kind: 'invalid'; readonly reason: InvalidReason }

function classify(mutant: ReportMutant, second: ReportMutant | undefined): Verdict {
  if (ranNoTests(mutant)) return { kind: 'invalid', reason: 'notRun' }
  if (!wallClockTimeout(mutant)) return { kind: 'scored', status: mutant.status, rechecked: false }
  if (second === undefined) return { kind: 'invalid', reason: 'timeoutUnchecked' }
  if (ranNoTests(second)) return { kind: 'invalid', reason: 'notRun' }
  // 复核又超时：单独一个工作进程、时限又放宽了，仍跑不完，按变异造成的挂起算测出来。
  return ['Killed', 'Timeout', 'Survived', 'NoCoverage'].includes(second.status)
    ? { kind: 'scored', status: second.status, rechecked: true }
    : { kind: 'invalid', reason: 'timeoutUnchecked' }
}

const runtimeErrorCount = (report: MutationReport | undefined) =>
  report === undefined
    ? 0
    : Object.values(report.files)
        .flatMap(file => file.mutants)
        .filter(mutant => mutant.status === 'RuntimeError').length

function typeTestReading(
  target: MutationTarget,
  report: MutationReport,
  runs: readonly RunRecord[],
): TypeTestReading | null {
  const dryRun = Math.max(
    0,
    ...runs.filter(run => run.mode === 'dry-run').map(run => run.typeTests),
  )
  if (dryRun === 0) return null
  const staticIds = new Set(
    Object.entries(report.files).flatMap(([file, entry]) =>
      entry.mutants
        .filter(
          mutant =>
            mutant.static === true &&
            withinTarget(
              target,
              `${target.member.path}/${file}`,
              mutant.location.start.line,
              mutant.location.end.line,
            ),
        )
        .map(mutant => mutant.id),
    ),
  )
  const staticRuns = runs.filter(
    run =>
      run.mode === 'mutant' && run.activeMutant !== undefined && staticIds.has(run.activeMutant),
  )
  return {
    dryRun,
    staticRuns: staticRuns.length,
    withoutTypeTests: staticRuns.filter(run => run.typeTests < dryRun).length,
  }
}

export interface SummaryInputs {
  /** 复核的原始报告；没有复核时不给。 */
  readonly recheck?: MutationReport
  /** 第一遍每次 vitest 运行的记录。 */
  readonly runs?: readonly RunRecord[]
}

export function summarizeMember(
  target: MutationTarget,
  report: MutationReport,
  inputs: SummaryInputs = {},
): MemberMutation {
  const counts = zeroCounts()
  const survived: Finding[] = []
  const noCoverage: Finding[] = []
  const invalid: InvalidFinding[] = []
  const rechecked: RecheckedFinding[] = []
  const second = new Map(
    Object.entries(inputs.recheck?.files ?? {}).flatMap(([file, entry]) =>
      entry.mutants.map(mutant => [identity(file, mutant), mutant] as const),
    ),
  )
  let outside = 0
  for (const [local, file] of Object.entries(report.files)) {
    const path = `${target.member.path}/${local}`
    for (const mutant of file.mutants) {
      if (!withinTarget(target, path, mutant.location.start.line, mutant.location.end.line)) {
        outside += 1
        continue
      }
      const finding: Finding = {
        file: path,
        line: mutant.location.start.line,
        mutator: mutant.mutatorName,
        original: originalText(file.source, mutant),
        replacement: oneLine(mutant.replacement ?? ''),
        static: mutant.static === true,
      }
      const verdict = classify(
        mutant,
        inputs.recheck === undefined ? undefined : second.get(identity(local, mutant)),
      )
      if (verdict.kind === 'invalid') {
        invalid.push({ ...finding, reason: verdict.reason })
        continue
      }
      counts[verdict.status] += 1
      if (verdict.rechecked) rechecked.push({ ...finding, verdict: verdict.status })
      if (verdict.status === 'Survived') survived.push(finding)
      else if (verdict.status === 'NoCoverage') noCoverage.push(finding)
    }
  }
  const byPlace = (a: Finding, b: Finding) => a.file.localeCompare(b.file) || a.line - b.line
  const runtimeErrors = runtimeErrorCount(report) + runtimeErrorCount(inputs.recheck)
  const valid = runtimeErrors === 0 && invalid.length === 0
  const detected = counts.Killed + counts.Timeout
  const scored = detected + counts.Survived + counts.NoCoverage
  return {
    member: target.member.path,
    valid,
    counts,
    score: !valid || scored === 0 ? null : Math.round((detected / scored) * 1000) / 10,
    survived: survived.sort(byPlace),
    noCoverage: noCoverage.sort(byPlace),
    invalid: invalid.sort(byPlace),
    rechecked: rechecked.sort(byPlace),
    runtimeErrors,
    typeTests: inputs.runs === undefined ? null : typeTestReading(target, report, inputs.runs),
    outside,
  }
}

const describeFinding = (finding: Finding) =>
  `${finding.file}:${finding.line} ${finding.mutator}${finding.static ? '（static）' : ''} ` +
  `\`${finding.original}\` → \`${finding.replacement}\``

const STATUS_NAMES: Readonly<Record<MutantStatus, string>> = {
  Killed: '被杀',
  Timeout: '超时',
  Survived: '存活',
  NoCoverage: '无覆盖',
  CompileError: '编译错误',
  RuntimeError: '运行错误',
  Ignored: '忽略',
  Pending: '未跑',
}

const INVALID_NAMES: Readonly<Record<InvalidReason, string>> = {
  notRun: '没跑测试',
  timeoutUnchecked: '超时未复核',
}

const INVALID_REASONS = Object.keys(INVALID_NAMES) as InvalidReason[]

/** 一个成员的读数；`detail` 为真时逐条列出存活、无覆盖、不计分与复核过的变异体。 */
export function memberLines(result: MemberMutation, detail: boolean): string[] {
  const { counts } = result
  const total =
    MUTANT_STATUSES.reduce((sum, status) => sum + counts[status], 0) + result.invalid.length
  const invalidCounts = INVALID_REASONS.map(
    reason => [reason, result.invalid.filter(finding => finding.reason === reason).length] as const,
  ).filter(([, count]) => count > 0)
  const lines = [
    `${result.member}：变异体 ${total} 个——` +
      `被杀 ${counts.Killed}、超时 ${counts.Timeout}、存活 ${counts.Survived}、无覆盖 ${counts.NoCoverage}、` +
      `编译错误 ${counts.CompileError}、运行错误 ${counts.RuntimeError}` +
      invalidCounts.map(([reason, count]) => `、${INVALID_NAMES[reason]} ${count}`).join('') +
      (result.rechecked.length > 0 ? `，其中复核 ${result.rechecked.length}` : '') +
      `；分数 ${result.valid ? (result.score === null ? '—' : `${result.score}%`) : '—（测量无效）'}`,
  ]
  if (result.typeTests !== null && result.typeTests.withoutTypeTests > 0)
    lines.push(
      `  类型测试：初跑 ${result.typeTests.dryRun} 项；static 变异体的运行 ${result.typeTests.staticRuns} 次，` +
        `其中 ${result.typeTests.withoutTypeTests} 次没有跑类型测试（上游复用 Vitest 实例，类型测试不随变异体改变结果）`,
    )
  if (!detail) return lines
  for (const finding of result.survived) lines.push(`  存活 ${describeFinding(finding)}`)
  for (const finding of result.noCoverage) lines.push(`  无覆盖 ${describeFinding(finding)}`)
  for (const finding of result.invalid)
    lines.push(`  ${INVALID_NAMES[finding.reason]} ${describeFinding(finding)}`)
  for (const finding of result.rechecked)
    lines.push(
      `  复核 ${describeFinding(finding)}：第一遍超时，单独复核判为${STATUS_NAMES[finding.verdict]}`,
    )
  return lines
}

/** 测量无效的原因，一条一句；有效时为空。`reports` 是读过的原始报告路径。 */
export function memberErrors(
  result: MemberMutation,
  paths: { readonly logPath: string; readonly reports: readonly string[] },
): string[] {
  const errors: string[] = []
  if (result.runtimeErrors > 0)
    errors.push(
      `${result.member}：${result.runtimeErrors} 个 RuntimeError，成员测量无效，原始报告 ${paths.reports.join('、')}`,
    )
  const count = (reason: InvalidReason) =>
    result.invalid.filter(finding => finding.reason === reason).length
  if (count('notRun') > 0)
    errors.push(
      `${result.member}：${count('notRun')} 个变异体有用例覆盖、却一条用例都没跑完，Stryker 报成了存活；判为运行出错，日志 ${paths.logPath}`,
    )
  if (count('timeoutUnchecked') > 0)
    errors.push(
      `${result.member}：${count('timeoutUnchecked')} 个变异体只因时限到了而超时，没有得到单独复核的判定，没有计分；` +
        `判为测量无效，原因见上一条或日志 ${paths.logPath}`,
    )
  return errors
}
