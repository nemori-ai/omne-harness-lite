import type { CriterionId, GoalBody, Metric, MetricId, RuleId } from './body.ts'
import type { CriterionReading, RuleReading } from './verdict.ts'

/** Who a reading came from: the system following a tool result, the judge's observation, or the agent's own word. */
export type ReadingSource = 'system' | 'judge' | 'agent'
export type Reading<V> = Readonly<{ value: V; source: ReadingSource; ref: string | null }>

/** The latest reading of each numbered entry. An entry without one was never read. */
export type Readings = Readonly<{
  criteria: Readonly<Partial<Record<CriterionId, Reading<CriterionReading>>>>
  metrics: Readonly<Partial<Record<MetricId, Reading<number>>>>
  rules: Readonly<Partial<Record<RuleId, Reading<RuleReading>>>>
}>
export const NO_READINGS: Readings = Object.freeze({ criteria: {}, metrics: {}, rules: {} })

/** One row of the gap table: what ought to be, the latest reading, where it came from and what is still short. */
export type GapRow = Readonly<{
  id: string
  ought: string
  reading: string
  source: ReadingSource | null
  ref: string | null
  open: boolean
  short: string | null
}>

const CRITERION_WORDS: Readonly<Record<CriterionReading, string>> = {
  holds: '成立',
  fails: '证据显示没做到',
  'no-evidence': '没有证据',
  stale: '证据过时',
  'cannot-tell': '判不了',
}
const RULE_WORDS: Readonly<Record<RuleReading, string>> = {
  kept: '守住',
  broken: '违反',
  unclear: '看不出',
}
const UNREAD = '没读过'

const at = (metric: Metric, value: number | undefined, mark: number): boolean =>
  value !== undefined && (metric.direction === 'lower' ? value <= mark : value >= mark)

function metricRow(metric: Metric, read: Reading<number> | undefined): GapRow {
  const reached = at(metric, read?.value, metric.target)
  const floor = metric.floor === null ? '' : `，底线 ${String(metric.floor)}`
  const baseline = typeof metric.baseline === 'number' ? `（基线 ${String(metric.baseline)}）` : ''
  return {
    id: metric.id,
    ought: `目标 ${String(metric.target)}${floor}`,
    reading: read === undefined ? UNREAD : `${String(read.value)}${baseline}`,
    source: read?.source ?? null,
    ref: read?.ref ?? null,
    open: !reached,
    short:
      read === undefined || reached ? null : `还差 ${String(Math.abs(read.value - metric.target))}`,
  }
}

/** The gap table: every criterion, metric and rule by its number, then the budget. */
export function gapTable(body: GoalBody, readings: Readings, rounds: number): readonly GapRow[] {
  const metrics = body.metrics.map(metric => metricRow(metric, readings.metrics[metric.id]))
  const criteria = body.criteria.map((criterion): GapRow => {
    const { evidence } = criterion
    if (evidence.kind === 'metric') {
      const measured = metrics.find(row => row.id === evidence.metric)
      const open = measured?.open ?? true
      return {
        id: criterion.id,
        ought: criterion.statement,
        reading: measured?.source == null ? UNREAD : open ? '未成立' : '成立',
        source: measured?.source ?? null,
        ref: measured?.ref ?? null,
        open,
        short: measured?.short == null ? null : `${evidence.metric} ${measured.short}`,
      }
    }
    const read = readings.criteria[criterion.id]
    return {
      id: criterion.id,
      ought: criterion.statement,
      reading: read === undefined ? UNREAD : CRITERION_WORDS[read.value],
      source: read?.source ?? null,
      ref: read?.ref ?? null,
      open: read?.value !== 'holds',
      short: null,
    }
  })
  const rules = body.rules.map((rule): GapRow => {
    const read = readings.rules[rule.id]
    return {
      id: rule.id,
      ought: rule.statement,
      reading: read === undefined ? UNREAD : RULE_WORDS[read.value],
      source: read?.source ?? null,
      ref: read?.ref ?? null,
      open: read?.value === 'broken',
      short: null,
    }
  })
  const limit = body.exits.find(exit => exit.kind === 'budget')?.limits[0]
  const budget: GapRow[] =
    limit === undefined
      ? []
      : [
          {
            id: '预算',
            ought: `${String(limit.amount)} 轮`,
            reading: `用了 ${String(rounds)} 轮`,
            source: 'system',
            ref: null,
            open: false,
            short: `剩 ${String(Math.max(0, limit.amount - rounds))}`,
          },
        ]
  return [...criteria, ...metrics, ...rules, ...budget]
}

const SOURCE_WORDS: Readonly<Record<ReadingSource, string>> = {
  system: '系统',
  judge: '判定',
  agent: '自述',
}

/** The rows as text, one line each: what the agent reads with `Goal show` and in a reminder to go on. */
export function renderGap(rows: readonly GapRow[]): string {
  return rows
    .map(row => {
      const from =
        row.source === null
          ? ''
          : `（${SOURCE_WORDS[row.source]}${row.ref === null ? '' : `，${row.ref}`}）`
      const short = row.short === null ? '' : `，${row.short}`
      const head = row.id === '预算' ? '- 预算' : `- [${row.id}]`
      return `${head} ${row.ought}：${row.reading}${from}${short}`
    })
    .join('\n')
}
