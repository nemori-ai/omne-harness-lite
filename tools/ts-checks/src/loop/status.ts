// 回路状态的判定与文字：各指标的带位、要解释的红项、超预算的成员，渲染成终端与 status.md 共用的几十行。
// 这里只有纯函数；读 git、跑传感器、写文件都在 cli.ts。
import { basename } from 'node:path'
import type { DirectionFinding } from '../metrics/graph.ts'
import { describeFunction } from '../metrics/report.ts'
import { BAND_WORDS, judgeIndicator, type Band, type Comparison } from './bands.ts'
import { BUDGET_LABELS, type ItemComparison, type MemberBudget } from './budget.ts'
import { CATEGORIES, type CatalogueStatus } from './catalogue.ts'
import {
  BUDGET_ITEMS,
  INDICATORS,
  type BudgetItem,
  SWITCHED_SENSORS,
  type IndicatorId,
  type LoopConfig,
  type SwitchedSensor,
} from './config.ts'
import { describeAgainstBase, type ExplainedFunction } from './against-base.ts'
import { describeClone, fixed } from './proposals.ts'
import type { Reading } from './reading.ts'
import type { CaseWithoutAssertion } from './sensors/assertions.ts'
import type { Clone } from './sensors/duplication.ts'
import type { EdgeChange } from './sensors/new-edges.ts'
import type { StabilityEdge } from './sensors/stability.ts'
import type { BaselineSnapshot, IndicatorSnapshot, Snapshot } from './trend.ts'

export const INDICATOR_LABELS: Readonly<Record<IndicatorId, string>> = {
  redMembers: '红色成员数',
  functionsOverAlert: '超 alert 的函数数',
  stableOnUnstable: '稳定依赖不稳定的边数',
  cochangePairs: '一起改却分属两组的成员对数',
  newEdges: '新增跨成员依赖数',
  testsWithoutAssertions: '没有断言的测试数',
  duplicationPercent: '全仓重复行占比（%）',
  topicRevChurn: '单个 topic 窗口内 rev 翻动次数',
  worktrees: '并行工作树数',
  worktreeSharedMembers: '被多棵工作树同时改的成员数',
  acceptanceSeconds: '验收总耗时（秒）',
  acceptanceSlowestSeconds: '最慢一份验收的耗时（秒）',
}

/** 一个指标这次的读数，`note` 是跟在行尾的简短事实（例如达到提醒线的 topic）。 */
export interface IndicatorInput {
  readonly reading: Reading<number>
  readonly note?: string
}

export interface IndicatorRow {
  readonly id: IndicatorId
  readonly label: string
  readonly reading: Reading<number>
  /** 有数据且有绝对线或与基线比时才有带位。 */
  readonly band?: Band
  /** 配置里与基线比的指标才有。 */
  readonly comparison?: Comparison
  readonly baselineValue?: number
  readonly note?: string
}

export function judgeIndicators(input: {
  readonly values: Readonly<Record<IndicatorId, IndicatorInput>>
  readonly config: LoopConfig
  readonly previous: Snapshot | undefined
  readonly baseline: BaselineSnapshot
}): IndicatorRow[] {
  return INDICATORS.map(id => {
    const { reading, note } = input.values[id]
    const setting = input.config.indicators[id]
    const base = {
      id,
      label: INDICATOR_LABELS[id],
      reading,
      ...(note === undefined ? {} : { note }),
    }
    if (reading.status === 'no-data' || (setting.lines === null && !setting.baseline)) return base
    const previous = input.previous?.indicators[id]?.band ?? undefined
    const baselineValue =
      input.baseline.kind === 'none'
        ? undefined
        : (input.baseline.snapshot.indicators[id]?.value ?? undefined)
    const judged = judgeIndicator({
      value: reading.data,
      lines: setting.lines,
      ...(previous === undefined ? {} : { previous }),
      baseline: {
        enabled: setting.baseline,
        ...(baselineValue === undefined ? {} : { value: baselineValue }),
      },
    })
    return {
      ...base,
      band: judged.band,
      ...(judged.comparison === undefined ? {} : { comparison: judged.comparison }),
      ...(baselineValue === undefined ? {} : { baselineValue }),
    }
  })
}

export function indicatorSnapshots(
  rows: readonly IndicatorRow[],
): Record<string, IndicatorSnapshot> {
  return Object.fromEntries(
    rows.map(row => [
      row.id,
      {
        value: row.reading.status === 'data' ? row.reading.data : null,
        band: row.band ?? null,
      },
    ]),
  )
}

/** 开着却没数据的传感器与原因。 */
export interface SilentSensor {
  readonly sensor: SwitchedSensor
  readonly reason: string
}

/** 硬线「传感器有数据」：只在严格模式下判；配置里关掉的不算，单列出来。 */
export type SensorLine =
  | { readonly status: 'unjudged'; readonly reason: string }
  | {
      readonly status: 'judged'
      readonly silent: readonly SilentSensor[]
      readonly off: readonly SwitchedSensor[]
    }

export function judgeSensors(
  readings: Readonly<Record<SwitchedSensor, Reading<unknown>>>,
  config: LoopConfig,
): SensorLine {
  const silent: SilentSensor[] = []
  const off: SwitchedSensor[] = []
  for (const sensor of SWITCHED_SENSORS) {
    const reading = readings[sensor]
    if (!config.sensors[sensor].enabled) off.push(sensor)
    else if (reading.status === 'no-data') silent.push({ sensor, reason: reading.reason })
  }
  return { status: 'judged', silent, off }
}

/** 对一段提交范围判的硬线：没给基线时不判。 */
export type RangeLine =
  | { readonly status: 'unjudged'; readonly reason: string }
  | { readonly status: 'judged'; readonly violations: readonly string[] }

export interface HardLines {
  readonly direction: readonly DirectionFinding[]
  readonly cycles: readonly DirectionFinding[]
  readonly acceptanceLock: RangeLine
  /** 删卡要有记录：与验收锁同一个基线。 */
  readonly cardRetire: RangeLine
  readonly sensors: SensorLine
}

const broken = (line: RangeLine) => line.status === 'judged' && line.violations.length > 0

export function hardLinesBroken(lines: HardLines): boolean {
  return (
    lines.direction.length > 0 ||
    lines.cycles.length > 0 ||
    broken(lines.acceptanceLock) ||
    broken(lines.cardRetire) ||
    (lines.sensors.status === 'judged' && lines.sensors.silent.length > 0)
  )
}

/** 这次变更里要解释的红项，五类；全量，终端只列前 explainTop 条。 */
export interface Explain {
  /** 碰过、带位不是 ok，且比基线涨了、新出现或拿不准的函数。 */
  readonly functions: readonly ExplainedFunction[]
  /** 碰过、原来就在线外、这次没有变差的函数：不要解释，但数出来。 */
  readonly functionsNotWorse: readonly ExplainedFunction[]
  readonly newEdges: Reading<readonly EdgeChange[]>
  readonly newStableOnUnstable: Reading<readonly StabilityEdge[]>
  readonly casesWithoutAssertions: Reading<readonly CaseWithoutAssertion[]>
  readonly clones: Reading<readonly Clone[]>
}

export interface OverBudget {
  readonly budget: MemberBudget
  /** 生成了草稿时是它的路径；结构问题不生成。 */
  readonly proposal?: string
}

export interface StatusView {
  readonly shortHead: string
  readonly branch: string
  readonly dirty: boolean
  readonly base?: { readonly ref: string; readonly mergeBase: string }
  readonly baseline: BaselineSnapshot
  /** 找基线快照时用的合并点，以及它从哪来。 */
  readonly baselineFrom: string
  /** 抬头里的事实行：趋势文件、上一次的带位、快照写没写、坏行、产物位置。 */
  readonly notes: readonly string[]
  readonly hardLines: HardLines
  readonly indicators: readonly IndicatorRow[]
  readonly explain: Explain | undefined
  readonly explainTop: number
  readonly overBudget: readonly OverBudget[]
  /** 判过预算的全部成员；列「比基线变差的成员」用。 */
  readonly budgets: readonly MemberBudget[]
  /** 配置里成员预算与不与基线比（`memberBudget.baseline`）。 */
  readonly budgetBaseline: boolean
  readonly proposalDir: string
  readonly catalogue: CatalogueStatus
  readonly cataloguePath: string
}

const COMPARISON_WORD: Record<Comparison, string> = {
  better: '好了',
  same: '一样',
  worse: '差了',
  unjudged: '未判',
}

const at = (site: { readonly path: string; readonly line: number } | undefined) =>
  site === undefined ? '' : `（${site.path}:${site.line}）`

function headerLines(view: StatusView): string[] {
  const base =
    view.base === undefined
      ? '无基线，只报全仓现状'
      : `基线 ${view.base.ref}（合并点 ${view.base.mergeBase.slice(0, 9)}）`
  const snapshot =
    view.baseline.kind === 'none'
      ? `基线快照：没有（${view.baselineFrom}），「不比基线差」这一类本次未判`
      : `基线快照：${view.baseline.snapshot.commit.slice(0, 9)}（${view.baseline.kind === 'exact' ? '合并点那个提交' : '合并点之前最近的一条'}；${view.baselineFrom}），记于 ${view.baseline.snapshot.recordedAt}`
  return [
    `回路状态 ${view.shortHead}${view.dirty ? '（工作树不干净）' : ''} · 分支 ${view.branch} · ${base}`,
    snapshot,
    ...view.notes,
  ]
}

function hardLineLines(lines: HardLines): string[] {
  const finding = (label: string, found: readonly DirectionFinding[]) => {
    const first = found[0]
    return first === undefined
      ? `  ${label} 0`
      : `  ✗ ${label} ${found.length}：${first.message}${at(first.sites[0])}${found.length > 1 ? ' 等' : ''}`
  }
  const range = (line: RangeLine, label: string, ok: string, bad: string) =>
    line.status === 'unjudged'
      ? `  ${label} 未判：${line.reason}`
      : line.violations.length === 0
        ? `  ${label} ${ok}`
        : `  ✗ ${label} ${bad} ${line.violations.length} 处：${line.violations[0] ?? ''}${line.violations.length > 1 ? ' 等' : ''}`
  return [
    '## 硬线',
    finding('方向违规', lines.direction),
    finding('环', lines.cycles),
    range(lines.acceptanceLock, '验收锁', '没破', '破'),
    range(lines.cardRetire, '删卡记录', '齐', '缺'),
    sensorLine(lines.sensors),
  ]
}

function sensorLine(line: SensorLine): string {
  if (line.status === 'unjudged') return `  传感器有数据 未判：${line.reason}`
  const off =
    line.off.length === 0
      ? ''
      : `；配置里关了、不算：${line.off.map(sensor => `sensors.${sensor}`).join('、')}`
  if (line.silent.length === 0) return `  传感器有数据 是${off}`
  const silent = line.silent.map(entry => `sensors.${entry.sensor}（${entry.reason}）`).join('、')
  return `  ✗ 传感器没数据 ${line.silent.length} 个：${silent}${off}`
}

function indicatorLine(row: IndicatorRow): string {
  if (row.reading.status === 'no-data') return `  ${row.label} · 没数据：${row.reading.reason}`
  const parts = [`  ${row.label} ${fixed(row.reading.data)}`]
  parts.push(row.band === undefined ? '不分带' : BAND_WORDS[row.band])
  if (row.comparison === undefined) parts.push('不与基线比')
  else
    parts.push(
      `与基线比 ${COMPARISON_WORD[row.comparison]}` +
        (row.baselineValue === undefined ? '' : `（基线 ${fixed(row.baselineValue)}）`),
    )
  return parts.join(' · ') + (row.note === undefined ? '' : `；${row.note}`)
}

function explainLines(view: StatusView): string[] {
  const out = ['## 这次变更里要解释的红项']
  const { explain } = view
  if (explain === undefined) return [...out, '  未判：没给基线']
  const section = <T>(title: string, reading: Reading<readonly T[]>, line: (item: T) => string) => {
    if (reading.status === 'no-data') {
      out.push(`  ${title}：没数据，${reading.reason}`)
      return
    }
    if (reading.data.length === 0) return
    out.push(`  ${title} ${reading.data.length} 条：`)
    for (const item of reading.data.slice(0, view.explainTop)) out.push(`    ${line(item)}`)
    if (reading.data.length > view.explainTop)
      out.push(`    其余 ${reading.data.length - view.explainTop} 条见 status.json`)
  }
  section(
    '变更函数里超过 warn、且比基线涨了或新出现的',
    { status: 'data', data: explain.functions },
    row => `${describeFunction(row)}：${describeAgainstBase(row)}`,
  )
  section('新增的跨成员依赖', explain.newEdges, edge => `${edge.from} → ${edge.to}${at(edge.site)}`)
  section(
    '新增依赖里稳定依赖不稳定的',
    explain.newStableOnUnstable,
    edge =>
      `${edge.from}（I ${edge.fromInstability.toFixed(2)}）→ ${edge.to}（I ${edge.toInstability.toFixed(2)}）${at(edge.site)}`,
  )
  section(
    '改动过的测试文件里没有断言的用例',
    explain.casesWithoutAssertions,
    found => `${found.path}:${found.line} ${found.name}`,
  )
  section('有一端落在改动文件里的克隆', explain.clones, describeClone)
  if (out.length === 1) out.push('  无')
  // 不要解释、但不让它们无声消失：放在最后，不影响上面「无」的判断。
  if (explain.functionsNotWorse.length > 0)
    out.push(
      `  另有 ${explain.functionsNotWorse.length} 个碰过的函数原来就在线外、这次没有变差（见 status.json）`,
    )
  return out
}

function budgetLines(view: StatusView): string[] {
  const out = ['## 超预算的成员']
  if (view.overBudget.length === 0) out.push('  无')
  else {
    const drafted = view.overBudget.filter(entry => entry.proposal !== undefined).length
    out.push(
      `  ${view.overBudget.length} 个，其中结构问题 ${view.overBudget.length - drafted} 个；草稿在 ${view.proposalDir}/`,
    )
  }
  // 结构问题排前面，再按超了几项、成员路径。
  const ordered = [...view.overBudget].sort(
    (a, b) =>
      Number(b.budget.structural) - Number(a.budget.structural) ||
      b.budget.over.length - a.budget.over.length ||
      a.budget.member.localeCompare(b.budget.member),
  )
  for (const { budget, proposal } of ordered.slice(0, view.explainTop)) {
    const items = budget.over.map(item => itemWithComparison(budget, item)).join('、')
    out.push(
      budget.structural
        ? `  ${budget.member}：${items} → 结构问题：反复变红 ${budget.relapses} 次，上报，不派清理`
        : `  ${budget.member}：${items} → 草稿 ${proposal === undefined ? '（未生成）' : basename(proposal)}`,
    )
  }
  if (ordered.length > view.explainTop)
    out.push(`  其余 ${ordered.length - view.explainTop} 个见 status.json`)
  out.push(...baselineBudgetLines(view))
  out.push(catalogueLine(view.cataloguePath, view.catalogue))
  return out
}

function comparisonText(comparison: ItemComparison): string {
  switch (comparison.result) {
    case 'new':
      return '新成员'
    case 'unjudged':
      return `与基线比未判：${comparison.reason}`
    default:
      return `与基线比 ${COMPARISON_WORD[comparison.result]}，基线 ${fixed(comparison.baseline)}`
  }
}

function itemWithComparison(budget: MemberBudget, item: BudgetItem): string {
  const text = `${BUDGET_LABELS[item]} ${fixed(budget.values[item] ?? 0)}`
  const comparison = budget.comparisons?.[item]
  return comparison === undefined ? text : `${text}（${comparisonText(comparison)}）`
}

/** 每个成员一行，列出满足 `pick` 的那几项；没有这样的项的成员不列。按成员路径排。 */
function memberItemLines(
  budgets: readonly MemberBudget[],
  pick: (budget: MemberBudget, item: BudgetItem) => string | undefined,
): string[] {
  return [...budgets]
    .sort((a, b) => a.member.localeCompare(b.member))
    .flatMap(budget => {
      const items = BUDGET_ITEMS.flatMap(item => {
        const text = pick(budget, item)
        return text === undefined ? [] : [text]
      })
      return items.length === 0 ? [] : [`${budget.member}：${items.join('、')}`]
    })
}

/**
 * 成员预算与基线比的那一段：比基线变差的成员（基线值 → 现值），与过了提醒线的新成员。
 * 配置里不比时整段不出，输出与不比时的旧样子逐字相同。
 */
function baselineBudgetLines(view: StatusView): string[] {
  if (!view.budgetBaseline) return []
  const title = '  比基线变差的成员'
  if (view.baseline.kind === 'none') return [`${title}：未判：没有基线快照`]
  const band = (budget: MemberBudget, item: BudgetItem) => {
    const found = budget.bands[item]
    return found === undefined ? '' : `（${BAND_WORDS[found]}）`
  }
  const worse = memberItemLines(view.budgets, (budget, item) => {
    const comparison = budget.comparisons?.[item]
    return comparison?.result === 'worse'
      ? `${BUDGET_LABELS[item]} ${fixed(comparison.baseline)} → ${fixed(budget.values[item] ?? 0)}${band(budget, item)}`
      : undefined
  })
  const fresh = memberItemLines(view.budgets, (budget, item) =>
    budget.comparisons?.[item]?.result === 'new' &&
    budget.bands[item] !== undefined &&
    budget.bands[item] !== 'normal'
      ? `${BUDGET_LABELS[item]} ${fixed(budget.values[item] ?? 0)}${band(budget, item)}`
      : undefined,
  )
  const listed = (label: string, entries: readonly string[]) => {
    if (entries.length === 0) return [`${label}：无`]
    return [
      `${label} ${entries.length} 个：`,
      ...entries.slice(0, view.explainTop).map(entry => `    ${entry}`),
      ...(entries.length > view.explainTop
        ? [`    其余 ${entries.length - view.explainTop} 个见 status.json`]
        : []),
    ]
  }
  return [...listed(title, worse), ...listed('  新成员过了提醒线的', fresh)]
}

export function catalogueLine(path: string, catalogue: CatalogueStatus): string {
  const { categories, crossCheck } = catalogue
  if (categories.status === 'no-data') return `对照表（${path}）：没数据，${categories.reason}`
  const counts = CATEGORIES.map(name => `${name} ${categories.data.counts[name]}`).join('、')
  const check =
    crossCheck.status === 'no-data'
      ? `对回全表：没数据，${crossCheck.reason}`
      : `对回全表：全表有而对照表缺 ${crossCheck.data.missing.length}、对照表有而全表没有 ${crossCheck.data.unknown.length}、对照表比全表多出 ${crossCheck.data.repeated.length}`
  return `对照表（${path}）：${counts}；不合约定 ${categories.data.invalid.length} 行；${check}`
}

export function renderStatus(view: StatusView): string[] {
  return [
    ...headerLines(view),
    ...hardLineLines(view.hardLines),
    '## 各项指标的带位',
    ...view.indicators.map(indicatorLine),
    ...explainLines(view),
    ...budgetLines(view),
  ]
}
