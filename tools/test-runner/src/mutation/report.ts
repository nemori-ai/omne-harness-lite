// 读 Stryker 的 JSON 报告（mutation-testing-report-schema 1.x），只留落在要变异的行上的变异体，按成员汇总。
import { withinTarget, type MutationTarget } from './scope.ts'

/** 报告里的变异体状态；被杀与超时算测出来了，存活与无覆盖算没测出来，其余不计分。 */
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
}

export interface MutationReport {
  /** 键是相对 Stryker 工作目录（成员目录）的路径。 */
  readonly files: Readonly<
    Record<string, { readonly source: string; readonly mutants: readonly ReportMutant[] }>
  >
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

export interface MemberMutation {
  readonly member: string
  readonly counts: Readonly<Record<MutantStatus, number>>
  /** 测出来的占（测出来＋没测出来）的百分比；一个都没有时为 null。 */
  readonly score: number | null
  readonly survived: readonly Finding[]
  readonly noCoverage: readonly Finding[]
  /**
   * 报成存活、有用例覆盖、却一条用例都没跑完的变异体：是运行器没跑测试，不是测试没测出来（#405）。
   * 不计入各状态与分数，入口把它判为运行出错。
   */
  readonly notRun: readonly Finding[]
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

export function summarizeMember(target: MutationTarget, report: MutationReport): MemberMutation {
  const counts = zeroCounts()
  const survived: Finding[] = []
  const noCoverage: Finding[] = []
  const notRun: Finding[] = []
  let outside = 0
  for (const [local, file] of Object.entries(report.files)) {
    const path = `${target.member.path}/${local}`
    for (const mutant of file.mutants) {
      if (!withinTarget(target, path, mutant.location.start.line, mutant.location.end.line)) {
        outside += 1
        continue
      }
      const unrun =
        mutant.status === 'Survived' &&
        mutant.testsCompleted === 0 &&
        (mutant.coveredBy?.length ?? 0) > 0
      if (!unrun) counts[mutant.status] += 1
      if (mutant.status !== 'Survived' && mutant.status !== 'NoCoverage') continue
      const finding = {
        file: path,
        line: mutant.location.start.line,
        mutator: mutant.mutatorName,
        original: originalText(file.source, mutant),
        replacement: oneLine(mutant.replacement ?? ''),
        static: mutant.static === true,
      }
      ;(unrun ? notRun : mutant.status === 'Survived' ? survived : noCoverage).push(finding)
    }
  }
  const byPlace = (a: Finding, b: Finding) => a.file.localeCompare(b.file) || a.line - b.line
  const detected = counts.Killed + counts.Timeout
  const scored = detected + counts.Survived + counts.NoCoverage
  return {
    member: target.member.path,
    counts,
    score: scored === 0 ? null : Math.round((detected / scored) * 1000) / 10,
    survived: survived.sort(byPlace),
    noCoverage: noCoverage.sort(byPlace),
    notRun: notRun.sort(byPlace),
    outside,
  }
}

const describeFinding = (finding: Finding) =>
  `${finding.file}:${finding.line} ${finding.mutator}${finding.static ? '（static）' : ''} ` +
  `\`${finding.original}\` → \`${finding.replacement}\``

/** 一个成员的读数；`detail` 为真时逐条列出存活与无覆盖的变异体。 */
export function memberLines(result: MemberMutation, detail: boolean): string[] {
  const { counts } = result
  const lines = [
    `${result.member}：变异体 ${MUTANT_STATUSES.reduce((sum, status) => sum + counts[status], 0)} 个——` +
      `被杀 ${counts.Killed}、超时 ${counts.Timeout}、存活 ${counts.Survived}、无覆盖 ${counts.NoCoverage}、` +
      `编译错误 ${counts.CompileError}、运行错误 ${counts.RuntimeError}；` +
      `分数 ${result.score === null ? '—' : `${result.score}%`}`,
  ]
  if (!detail) return lines
  for (const finding of result.survived) lines.push(`  存活 ${describeFinding(finding)}`)
  for (const finding of result.noCoverage) lines.push(`  无覆盖 ${describeFinding(finding)}`)
  for (const finding of result.notRun) lines.push(`  没跑测试 ${describeFinding(finding)}`)
  return lines
}
