import { quantile, wilson, type Interval } from '../score.ts'
import type { StepKind, Truth } from './product.ts'
import type { CaseResult } from './run.ts'

/** One criterion of one batch: what it is, and what the goal held of it after the examiner handed in. */
export type Examined = Readonly<{
  case: string
  step: number
  kind: StepKind
  criterion: string
  truth: Truth
  said: string
  before: string | null
}>
export type Share = Readonly<{ errors: number; n: number; rate: number; interval: Interval }>
export type Spread = Readonly<{
  n: number
  mean: number
  interval: Interval
  median: number
  max: number
}>
export type ExamScore = Readonly<{
  cases: number
  failed: readonly string[]
  cutShort: readonly string[]
  batches: number
  falseHolds: Share
  timid: Share
  timidFails: number
  timidCannotTell: number
  parroted: Share
  usd: Spread
  seconds: Spread
  totalUsd: number
  changedWork: readonly string[]
  addedToWork: readonly string[]
  wrong: readonly Examined[]
}>

/** The gate of the judge's false holds, which the examiner's share of unmet criteria read as held must pass too. */
export const GATE = Object.freeze({ point: 0.01, upper: 0.03 })

const share = (errors: number, n: number): Share => ({
  errors,
  n,
  rate: n === 0 ? 0 : errors / n,
  interval: wilson(errors, n),
})

function spread(values: readonly number[]): Spread {
  const n = values.length
  if (n === 0) return { n, mean: 0, interval: { low: 0, high: 0 }, median: 0, max: 0 }
  const mean = values.reduce((sum, value) => sum + value, 0) / n
  const deviation = Math.sqrt(
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, n - 1),
  )
  const half = (1.959964 * deviation) / Math.sqrt(n)
  return {
    n,
    mean,
    interval: { low: Math.max(0, mean - half), high: mean + half },
    median: quantile(values, 0.5),
    max: Math.max(...values),
  }
}

export function examinedOf(results: readonly CaseResult[]): readonly Examined[] {
  return results.flatMap(result =>
    result.batches.flatMap(batch =>
      Object.entries(batch.readings).map(([criterion, reading]) => ({
        case: result.id,
        step: batch.step,
        kind: batch.kind,
        criterion,
        truth: reading.truth,
        said: reading.said,
        before:
          batch.step === 0
            ? null
            : (result.batches[batch.step - 1]?.readings[criterion]?.said ?? null),
      })),
    ),
  )
}

const turned = (entry: Examined, first: readonly Examined[]): boolean =>
  first.some(
    was =>
      was.case === entry.case && was.criterion === entry.criterion && was.truth !== entry.truth,
  )

/** The three numbers of the examiner's bench. A case that did not run to its end counts for nothing and is named. */
export function examScore(results: readonly CaseResult[]): ExamScore {
  const ran = results.filter(result => result.error === null)
  const rows = examinedOf(ran)
  const unmet = rows.filter(row => row.truth === 'fails')
  const met = rows.filter(row => row.truth === 'holds')
  const first = rows.filter(row => row.step === 0)
  const again = rows.filter(row => row.step > 0 && turned(row, first))
  const batches = ran.flatMap(result => result.batches.map(batch => ({ of: result.id, ...batch })))
  const usd = batches.map(batch => batch.usd)
  return {
    cases: ran.length,
    failed: results
      .filter(result => result.error !== null)
      .map(result => `${result.id}: ${String(result.error)}`),
    cutShort: ran.filter(result => (result.unreached ?? 0) > 0).map(result => result.id),
    batches: batches.length,
    falseHolds: share(unmet.filter(row => row.said === 'holds').length, unmet.length),
    timid: share(met.filter(row => row.said !== 'holds').length, met.length),
    timidFails: met.filter(row => row.said === 'fails').length,
    timidCannotTell: met.filter(row => row.said !== 'holds' && row.said !== 'fails').length,
    parroted: share(
      again.filter(row => row.said === row.before && row.said !== row.truth).length,
      again.length,
    ),
    usd: spread(usd),
    seconds: spread(batches.map(batch => batch.seconds)),
    totalUsd: usd.reduce((sum, value) => sum + value, 0),
    changedWork: batches.flatMap(batch =>
      batch.changed.map(name => `${batch.of}#${String(batch.step)}: ${name}`),
    ),
    addedToWork: batches.flatMap(batch =>
      batch.added.map(name => `${batch.of}#${String(batch.step)}: ${name}`),
    ),
    wrong: rows.filter(row => row.said !== row.truth),
  }
}

/** How many unmet criteria, all read right, the upper bound needs to come under the gate. */
export function neededForGate(): number {
  let n = 1
  while (wilson(0, n).high > GATE.upper) n += 1
  return n
}

export const passesGate = (found: Share): boolean =>
  found.n > 0 && found.rate <= GATE.point && found.interval.high <= GATE.upper
