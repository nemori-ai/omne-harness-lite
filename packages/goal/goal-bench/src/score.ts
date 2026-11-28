import type { Family } from './case.ts'

export type EntryKind = 'criterion' | 'rule' | 'exit' | 'dead-end'
/** One numbered entry of one case, as it should have been read and as it was. */
export type Graded = Readonly<{
  case: string
  family: Family
  id: string
  kind: EntryKind
  truth: string
  safe: readonly string[]
  said: string
  asked: boolean
  probability: number | null
  endsInSuccess: boolean
}>

export type Rate = Readonly<{ errors: number; n: number; rate: number }>
const rate = (errors: number, n: number): Rate => ({ errors, n, rate: n === 0 ? 0 : errors / n })
const share = <T>(items: readonly T[], hit: (item: T) => boolean): Rate =>
  rate(items.filter(hit).length, items.length)

export type Interval = Readonly<{ low: number; high: number }>

export function wilson(errors: number, n: number, z = 1.959964): Interval {
  if (n === 0) return { low: 0, high: 1 }
  const p = errors / n
  const centre = p + (z * z) / (2 * n)
  const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  const scale = 1 + (z * z) / n
  return { low: Math.max(0, (centre - spread) / scale), high: (centre + spread) / scale }
}

export const wilsonUpper = (errors: number, n: number, z = 1.959964): number =>
  wilson(errors, n, z).high

const judged = (entries: readonly Graded[]) =>
  entries.filter(entry => entry.kind === 'criterion' && entry.asked)

/** Of the judged criteria that do not hold, the share the judge let stand. */
export function falseHolds(entries: readonly Graded[]): Rate & { upper: number } {
  const found = share(
    judged(entries).filter(entry => entry.truth !== 'holds'),
    entry => entry.said === 'holds',
  )
  return { ...found, upper: wilsonUpper(found.errors, found.n) }
}

export const missed = (entries: readonly Graded[]): Rate =>
  share(
    judged(entries).filter(entry => entry.truth === 'holds'),
    entry => entry.said !== 'holds',
  )

const DECIDABLE = new Set(['holds', 'fails', 'stale'])
/** Of the judged criteria the evidence settles, the share the judge would not call. */
export const abstained = (entries: readonly Graded[]): Rate =>
  share(
    judged(entries).filter(entry => DECIDABLE.has(entry.truth)),
    entry => entry.said === 'cannot-tell',
  )

export const WEIGHTS = Object.freeze({
  falseHolds: 10,
  missedViolation: 10,
  falseSuccessExit: 10,
  missedDeadEnd: 3,
  miss: 2,
  falseAlarm: 2,
  abstain: 1,
})

function criterionLoss(entry: Graded): number {
  if (entry.truth === 'holds') return entry.said === 'cannot-tell' ? WEIGHTS.abstain : WEIGHTS.miss
  if (entry.said === 'holds') return WEIGHTS.falseHolds
  return entry.said === 'cannot-tell' && DECIDABLE.has(entry.truth) ? WEIGHTS.abstain : 0
}

/** What one wrong reading costs: letting something stand that does not is the dearest. */
export function lossOf(entry: Graded): number {
  if (entry.said === entry.truth) return 0
  switch (entry.kind) {
    case 'criterion':
      return criterionLoss(entry)
    case 'rule':
      if (entry.truth === 'broken') return WEIGHTS.missedViolation
      return entry.said === 'broken' ? WEIGHTS.falseAlarm : 0
    case 'exit':
      if (entry.truth === 'yes') return WEIGHTS.miss
      return entry.endsInSuccess ? WEIGHTS.falseSuccessExit : WEIGHTS.falseAlarm
    case 'dead-end':
      return entry.truth === 'yes' ? WEIGHTS.missedDeadEnd : WEIGHTS.falseAlarm
  }
}

export function weightedLoss(entries: readonly Graded[]): number {
  if (entries.length === 0) return 0
  return entries.reduce((sum, entry) => sum + lossOf(entry), 0) / entries.length
}

/** Whether a reading sides with what a mutation made true: not standing, broken, or come about. */
export function sidesWithChange(kind: EntryKind, said: string): boolean {
  if (kind === 'criterion') return said !== 'holds'
  return kind === 'rule' ? said === 'broken' : said === 'yes'
}

export type Pair = Readonly<{ family: Family; parent: boolean; child: boolean }>
export type Discrimination = Readonly<{ n: number; parent: number; child: number; value: number }>

export function discrimination(
  pairs: readonly Pair[],
): Readonly<Partial<Record<Family, Discrimination>>> {
  const families = [...new Set(pairs.map(pair => pair.family))]
  return Object.fromEntries(
    families.map(family => {
      const mine = pairs.filter(pair => pair.family === family)
      const parent = share(mine, pair => pair.parent).rate
      const child = share(mine, pair => pair.child).rate
      return [family, { n: mine.length, parent, child, value: child - parent }]
    }),
  )
}

export const falseSettles = (
  cases: readonly Readonly<{ expected: boolean; got: boolean }>[],
): Rate =>
  share(
    cases.filter(entry => !entry.expected),
    entry => entry.got,
  )

export type Bin = Readonly<{ from: number; n: number; mean: number; right: number }>
/** The answers `holds` by the probability they came with: how often each tenth was right, and the expected gap. */
export function calibration(
  points: readonly Readonly<{ probability: number; right: boolean }>[],
  bins = 10,
): Readonly<{ bins: readonly Bin[]; ece: number }> {
  const filled = Array.from({ length: bins }, (_unused, index): Bin => {
    const inside = points.filter(
      point => Math.min(bins - 1, Math.floor(point.probability * bins)) === index,
    )
    const n = inside.length
    const mean = n === 0 ? 0 : inside.reduce((sum, point) => sum + point.probability, 0) / n
    return { from: index / bins, n, mean, right: share(inside, point => point.right).rate }
  })
  const ece =
    points.length === 0
      ? 0
      : filled.reduce(
          (sum, bin) => sum + (bin.n / points.length) * Math.abs(bin.mean - bin.right),
          0,
        )
  return { bins: filled.filter(bin => bin.n > 0), ece }
}

export const flips = (readings: readonly (readonly string[])[]): Rate =>
  share(readings, same => new Set(same).size > 1)

export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0
  const sorted = values.toSorted((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)] as number
}
