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

export type CriterionReading = 'holds' | 'fails' | 'no-evidence' | 'stale' | 'cannot-tell'
export type RuleReading = 'kept' | 'broken' | 'unclear'

/** What one observation found, after the line was applied. `exits`: the condition and person exits seen to have come about. */
export type Findings = Readonly<{
  judge: 'answered' | 'unavailable'
  criteria: Readonly<Partial<Record<CriterionId, CriterionReading>>>
  metrics: Readonly<Partial<Record<MetricId, number>>>
  rules: Readonly<Partial<Record<RuleId, RuleReading>>>
  exits: readonly ExitId[]
  unattainable: boolean
}>

export type Verdict =
  | Readonly<{ row: 1 }>
  | Readonly<{ row: 2 | 3 | 4 | 5; exit: ExitId; counts: 'success' | 'failure' }>
  | Readonly<{ row: 6 | 8 }>
  | Readonly<{ row: 7 | 9; stalled: number; gap: Gap }>

/** Observations in a row that did not bring the goal closer, at which it counts as stalled. */
export const STALL_LIMIT = 3

const reached = (metric: Metric, reading: number | undefined, mark: number): boolean =>
  reading !== undefined && (metric.direction === 'lower' ? reading <= mark : reading >= mark)

function holds(body: GoalBody, findings: Findings, criterion: Criterion): boolean {
  const { evidence } = criterion
  if (evidence.kind !== 'metric') return findings.criteria[criterion.id] === 'holds'
  const metric = body.metrics.find(entry => entry.id === evidence.metric)
  return metric !== undefined && reached(metric, findings.metrics[metric.id], metric.target)
}

/** How far the goal is from done now: the entries still open, and how much each metric is short of its target. */
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

/** Closer means fewer entries open, or as many open and some metric nearer with none farther. */
export function closer(before: Gap | null, now: Gap): boolean {
  if (before === null || now.open < before.open) return true
  if (now.open > before.open) return false
  let nearer = false
  for (const [id, left] of Object.entries(now.remaining) as [MetricId, number][]) {
    const was = before.remaining[id]
    if (was === undefined || left > was) return false
    if (left < was) nearer = true
  }
  return nearer
}

function budgetReached(body: GoalBody, rounds: number): Exit | undefined {
  const budget = body.exits.find(exit => exit.kind === 'budget')
  const spent = budget?.limits.some(limit => rounds >= limit.amount)
  return spent ? budget : undefined
}

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

const named = (row: 2 | 3 | 4 | 5, exit: Exit): Verdict => ({
  row,
  exit: exit.id,
  counts: exit.counts,
})

/** The verdict table: what a current observation of an active goal comes to. Attendance is applied by the transition. */
export function rule(
  body: GoalBody,
  progress: Readonly<{ rounds: number; stalled: number; gap: Gap | null }>,
  findings: Findings,
): Verdict {
  const achieved =
    body.criteria.every(criterion => holds(body, findings, criterion)) &&
    body.metrics.every(metric => reached(metric, findings.metrics[metric.id], metric.target)) &&
    !body.rules.some(entry => findings.rules[entry.id] === 'broken')
  if (achieved) return { row: 1 }
  const budget = budgetReached(body, progress.rounds)
  if (budget !== undefined) {
    const enough = body.exits.find(
      exit => exit.kind === 'good-enough' && stands(body, findings, exit),
    )
    return enough === undefined ? named(3, budget) : named(2, enough)
  }
  const seen = (kind: Exit['kind']) =>
    body.exits.find(exit => exit.kind === kind && findings.exits.includes(exit.id))
  const condition = seen('condition')
  if (condition !== undefined) return named(4, condition)
  const person = seen('person')
  if (person !== undefined) return named(5, person)
  if (findings.unattainable) return { row: 6 }
  // An observation the judge did not answer saw no gap: it neither counts toward a stall nor clears one.
  if (findings.judge === 'unavailable') return { row: 8 }
  const gap = gapOf(body, findings)
  const stalled = closer(progress.gap, gap) ? 0 : progress.stalled + 1
  return { row: stalled >= STALL_LIMIT ? 7 : 9, stalled, gap }
}
