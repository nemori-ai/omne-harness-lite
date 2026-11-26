import { z } from 'zod'
import {
  CriterionIdSchema,
  MetricIdSchema,
  RuleIdSchema,
  type Criterion,
  type CriterionId,
  type GoalBody,
  type Metric,
  type RuleId,
} from './body.ts'
import { examined, verificationOf, type Verification } from './verification.ts'
import {
  CriterionReadingSchema,
  RuleReadingSchema,
  type CriterionReading,
  type RuleReading,
} from './verdict.ts'

export const ReadingSourceSchema = z.enum(['system', 'judge', 'agent', 'examiner'])
/** Who a reading came from: the system following a tool result, the judge's observation, the examining side, or the agent's own word. */
export type ReadingSource = z.infer<typeof ReadingSourceSchema>
const reading = <V extends z.ZodType>(value: V) =>
  z.strictObject({ value, source: ReadingSourceSchema, ref: z.string().nullable() })
export type Reading<V> = Readonly<{
  value: V
  source: ReadingSource
  ref: string | null
  note?: string | null | undefined
}>

export const ReadingsSchema = z.strictObject({
  criteria: z.partialRecord(
    CriterionIdSchema,
    reading(CriterionReadingSchema).extend({ note: z.string().nullable().optional() }),
  ),
  metrics: z.partialRecord(MetricIdSchema, reading(z.number().finite())),
  rules: z.partialRecord(RuleIdSchema, reading(RuleReadingSchema)),
})
/** The latest reading of each numbered entry. An entry without one was never read. */
export type Readings = z.infer<typeof ReadingsSchema>
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
  /** How a criterion is judged; null for a row that is no criterion. */
  verification: Verification | null
}>

const CRITERION_WORDS: Readonly<Record<CriterionReading, string>> = {
  holds: '成立',
  fails: '证据显示没做到',
  'no-evidence': '没有证据',
  stale: '证据过时',
  'cannot-tell': '判不了',
  gathering: '在取证',
}
const AWAITED_SHORT: Readonly<Partial<Record<CriterionReading, string>>> = {
  'no-evidence': '别的行都成立后，系统把它交给查验的一方',
  gathering: '现在写文件会让它过时',
  stale: '之后又写过文件：下一次想收工时系统会再查',
}
const STALE_CURE = '之后又写过文件：把它的命令单独再跑一次，或把它的文件再读一次'
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
    verification: null,
  }
}

function measuredRow(criterion: Criterion, measured: GapRow): GapRow {
  return {
    id: criterion.id,
    ought: criterion.statement,
    reading: measured.source === null ? UNREAD : measured.open ? '未成立' : '成立',
    source: measured.source,
    ref: measured.ref,
    open: measured.open,
    short: measured.short === null ? null : `${measured.id} ${measured.short}`,
    verification: 'system',
  }
}

function shortOf(criterion: Criterion, read: Readings['criteria'][CriterionId]): string | null {
  if (read === undefined) return null
  if (!examined(verificationOf(criterion))) return read.value === 'stale' ? STALE_CURE : null
  return AWAITED_SHORT[read.value] ?? read.note ?? null
}

function criterionRow(criterion: Criterion, read: Readings['criteria'][CriterionId]): GapRow {
  return {
    id: criterion.id,
    ought: criterion.statement,
    reading: read === undefined ? UNREAD : CRITERION_WORDS[read.value],
    source: read?.source ?? null,
    ref: read?.ref ?? null,
    open: read?.value !== 'holds',
    short: shortOf(criterion, read),
    verification: verificationOf(criterion),
  }
}

function ruleRow(rule: GoalBody['rules'][number], read: Readings['rules'][RuleId]): GapRow {
  return {
    id: rule.id,
    ought: rule.statement,
    reading: read === undefined ? UNREAD : RULE_WORDS[read.value],
    source: read?.source ?? null,
    ref: read?.ref ?? null,
    open: read?.value === 'broken',
    short: null,
    verification: null,
  }
}

function budgetRows(body: GoalBody, rounds: number): readonly GapRow[] {
  const limit = body.exits
    .find(exit => exit.kind === 'budget')
    ?.limits.find(entry => entry.unit === 'rounds')
  if (limit === undefined) return []
  return [
    {
      id: '预算',
      ought: `${String(limit.amount)} 轮`,
      reading: `用了 ${String(rounds)} 轮`,
      source: 'system',
      ref: null,
      open: false,
      short: `剩 ${String(Math.max(0, limit.amount - rounds))}`,
      verification: null,
    },
  ]
}

/** The gap table: every criterion, metric and rule by its number, then the budget. */
export function gapTable(body: GoalBody, readings: Readings, rounds: number): readonly GapRow[] {
  const metrics = body.metrics.map(metric => metricRow(metric, readings.metrics[metric.id]))
  const criteria = body.criteria.map(criterion => {
    const { evidence } = criterion
    const measured =
      evidence.kind === 'metric' ? metrics.find(row => row.id === evidence.metric) : undefined
    return measured === undefined
      ? criterionRow(criterion, readings.criteria[criterion.id])
      : measuredRow(criterion, measured)
  })
  const rules = body.rules.map(rule => ruleRow(rule, readings.rules[rule.id]))
  return [...criteria, ...metrics, ...rules, ...budgetRows(body, rounds)]
}

const SOURCE_WORDS: Readonly<Record<ReadingSource, string>> = {
  system: '系统',
  judge: '判定',
  agent: '自述',
  examiner: '查验',
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
