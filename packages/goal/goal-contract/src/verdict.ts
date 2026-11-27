import { z } from 'zod'
import type {
  Criterion,
  CriterionId,
  Exit,
  ExitId,
  GoalBody,
  Metric,
  MetricId,
  RuleId,
} from './body.ts'
import type { Gap } from './state.ts'
import { awaited, examined, verificationOf } from './verification.ts'

export const CriterionReadingSchema = z.enum([
  'holds',
  'fails',
  'no-evidence',
  'stale',
  'cannot-tell',
  'gathering',
])
export type CriterionReading = z.infer<typeof CriterionReadingSchema>
export const RuleReadingSchema = z.enum(['kept', 'broken', 'unclear'])
export type RuleReading = z.infer<typeof RuleReadingSchema>

/** What one observation found, after the line was applied. `exits`: the condition and person exits seen to have come about. `pending`: the criteria of the batch that is out. */
export type Findings = Readonly<{
  pending?: readonly CriterionId[]
  judge: 'answered' | 'unavailable'
  criteria: Readonly<Partial<Record<CriterionId, CriterionReading>>>
  metrics: Readonly<Partial<Record<MetricId, number>>>
  rules: Readonly<Partial<Record<RuleId, RuleReading>>>
  exits: readonly ExitId[]
  unattainable: boolean
}>

export type Verdict =
  | Readonly<{ row: 1 }>
  | Readonly<{ row: 2; hand: readonly CriterionId[] }>
  | Readonly<{ row: 3 | 4 | 5 | 6; exit: ExitId; counts: 'success' | 'failure' }>
  | Readonly<{ row: 7 | 9 }>
  | Readonly<{ row: 8 | 10; stalled: number; gap: Gap }>
export type Progressed = Readonly<{
  rounds: number
  stalled: number
  gap: Gap | null
  examinations: number
}>

export const STALL_LIMIT = 3

const reached = (metric: Metric, reading: number | undefined, mark: number): boolean =>
  reading !== undefined && (metric.direction === 'lower' ? reading <= mark : reading >= mark)

function holds(body: GoalBody, findings: Findings, criterion: Criterion): boolean {
  const { evidence } = criterion
  if (evidence.kind !== 'metric') return findings.criteria[criterion.id] === 'holds'
  const metric = body.metrics.find(entry => entry.id === evidence.metric)
  return metric !== undefined && reached(metric, findings.metrics[metric.id], metric.target)
}

export function gapOf(body: GoalBody, findings: Findings): Gap {
  const remaining: Record<MetricId, number> = {}
  let open = 0
  for (const metric of body.metrics) {
    const reading = findings.metrics[metric.id]
    if (reached(metric, reading, metric.target)) continue
    open += 1
    if (reading !== undefined) remaining[metric.id] = Math.abs(reading - metric.target)
  }
  open += body.criteria.filter(criterion => !holds(body, findings, criterion)).length
  open += body.rules.filter(rule => findings.rules[rule.id] === 'broken').length
  return { open, remaining }
}

/** Closer means fewer entries open, or as many open and some metric nearer with none farther. A first reading compares with nothing. */
export function closer(before: Gap | null, now: Gap): boolean {
  if (before === null || now.open < before.open) return true
  if (now.open > before.open) return false
  let nearer = false
  for (const [id, left] of Object.entries(now.remaining) as [MetricId, number][]) {
    const was = before.remaining[id]
    if (was === undefined) continue
    if (left > was) return false
    if (left < was) nearer = true
  }
  return nearer
}

const NOT_READ_YET: ReadonlySet<CriterionReading | undefined> = new Set([
  undefined,
  'no-evidence',
  'stale',
])

function waiting(body: GoalBody, findings: Findings): readonly CriterionId[] | undefined {
  const spot =
    body.metrics.every(metric => reached(metric, findings.metrics[metric.id], metric.target)) &&
    !body.rules.some(entry => findings.rules[entry.id] === 'broken')
  if (!spot) return undefined
  const pending = new Set(findings.pending)
  const hand: CriterionId[] = []
  for (const criterion of body.criteria) {
    if (holds(body, findings, criterion)) continue
    const how = verificationOf(criterion)
    if (!awaited(how)) return undefined
    if (pending.has(criterion.id)) continue
    if (!NOT_READ_YET.has(findings.criteria[criterion.id])) return undefined
    if (examined(how)) hand.push(criterion.id)
  }
  return hand
}

type Unit = Exit['limits'][number]['unit']
const usedUp = (budget: Exit, unit: Unit, used: number): boolean =>
  budget.limits.some(limit => limit.unit === unit && used >= limit.amount)
const allows = (budget: Exit, unit: Unit): boolean =>
  budget.limits.some(limit => limit.unit === unit)

function stands(body: GoalBody, findings: Findings, exit: Exit): boolean {
  return exit.by.every(standing => {
    if (standing.kind === 'criterion') {
      const criterion = body.criteria.find(entry => entry.id === standing.id)
      return criterion !== undefined && holds(body, findings, criterion)
    }
    const metric = body.metrics.find(entry => entry.id === standing.id)
    return (
      metric !== undefined &&
      metric.floor !== null &&
      reached(metric, findings.metrics[metric.id], metric.floor)
    )
  })
}

const named = (row: 3 | 4 | 5 | 6, exit: Exit): Verdict => ({
  row,
  exit: exit.id,
  counts: exit.counts,
})

const achieved = (body: GoalBody, findings: Findings): boolean =>
  body.criteria.every(criterion => holds(body, findings, criterion)) &&
  body.metrics.every(metric => reached(metric, findings.metrics[metric.id], metric.target)) &&
  !body.rules.some(entry => findings.rules[entry.id] === 'broken')

/** Rows 3 and 4: the budget is reached; a good-enough exit whose standing all holds comes first. */
function spent(budget: Exit, body: GoalBody, findings: Findings): Verdict {
  const enough = body.exits.find(
    exit => exit.kind === 'good-enough' && stands(body, findings, exit),
  )
  return enough === undefined ? named(4, budget) : named(3, enough)
}

/** Rows 5 to 7: what the judge saw come about, a condition before a person's call before a dead end. */
function seen(body: GoalBody, findings: Findings): Verdict | undefined {
  const exit = (kind: Exit['kind']) =>
    body.exits.find(entry => entry.kind === kind && findings.exits.includes(entry.id))
  const condition = exit('condition')
  if (condition !== undefined) return named(5, condition)
  const person = exit('person')
  if (person !== undefined) return named(6, person)
  return findings.unattainable ? { row: 7 } : undefined
}

function waitsOrSpent(body: GoalBody, progress: Progressed, findings: Findings) {
  const hand = waiting(body, findings)
  const budget = body.exits.find(exit => exit.kind === 'budget')
  if (budget === undefined) return hand?.length === 0 ? ({ row: 2, hand } as const) : undefined
  const left =
    allows(budget, 'examinations') && !usedUp(budget, 'examinations', progress.examinations)
  if (hand !== undefined && (hand.length === 0 || left)) return { row: 2, hand } as const
  const reached = hand !== undefined || usedUp(budget, 'rounds', progress.rounds)
  return reached ? spent(budget, body, findings) : undefined
}

/** The verdict table: what a current observation of an active goal comes to. Attendance is applied by the transition. */
export function rule(body: GoalBody, progress: Progressed, findings: Findings): Verdict {
  if (achieved(body, findings)) return { row: 1 }
  const out = waitsOrSpent(body, progress, findings) ?? seen(body, findings)
  if (out !== undefined) return out
  // An observation the judge did not answer saw no gap: it neither counts toward a stall nor clears one.
  if (findings.judge === 'unavailable') return { row: 9 }
  const gap = gapOf(body, findings)
  const stalled = closer(progress.gap, gap) ? 0 : progress.stalled + 1
  return { row: stalled >= STALL_LIMIT ? 8 : 10, stalled, gap }
}
