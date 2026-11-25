import { FAMILIES, type Family } from './case.ts'
import type { Report } from './report.ts'
import {
  lossOf,
  quantile,
  wilson,
  type Graded,
  type Interval,
  type Pair,
  type Rate,
} from './score.ts'

/** What one parent's cases came to in one run: how many entries were graded and what they cost. */
export type ParentTally = Readonly<{ entries: number; loss: number }>
export type Tallies = Readonly<Record<string, ParentTally>>

function generator(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

function meanLoss(tallies: Tallies, parents: readonly string[]): number {
  let entries = 0
  let loss = 0
  for (const parent of parents) {
    const tally = tallies[parent] as ParentTally
    entries += tally.entries
    loss += tally.loss
  }
  return entries === 0 ? 0 : loss / entries
}

type Resampling = Readonly<{ draws?: number; seed?: number }>

/** The 2.5% and 97.5% points of a number over resamples of what it was computed from, each resample as large as the original. */
function resampled<T>(
  items: readonly T[],
  value: (drawn: readonly T[]) => number,
  options: Resampling,
): Interval {
  const random = generator(options.seed ?? 1)
  const draws = Array.from({ length: options.draws ?? 2000 }, () =>
    value(items.map(() => items[Math.floor(random() * items.length)] as T)),
  )
  return { low: quantile(draws, 0.025), high: quantile(draws, 0.975) }
}

export type Paired = Readonly<{ difference: number; low: number; high: number; parents: number }>

/** The candidate's mean loss minus the base's over the same parents, with a 95% interval from resampling parents. */
export function pairedLoss(base: Tallies, candidate: Tallies, options: Resampling = {}): Paired {
  const parents = Object.keys(base).toSorted()
  if (parents.join('\n') !== Object.keys(candidate).toSorted().join('\n'))
    throw new Error('the two runs do not cover the same parents')
  const difference = (drawn: readonly string[]): number =>
    meanLoss(candidate, drawn) - meanLoss(base, drawn)
  return {
    difference: difference(parents),
    ...resampled(parents, difference, options),
    parents: parents.length,
  }
}

export type Spread = Readonly<{
  loss: Interval
  discrimination: Readonly<Partial<Record<Family, Interval>>>
}>

const shareOf = (pairs: readonly Pair[], side: 'parent' | 'child'): number =>
  pairs.filter(pair => pair[side]).length / pairs.length

/** How far one run's loss and discrimination would move: the loss over other parents, each family over other pairs of its own. */
export function spreadOf(
  tallies: Tallies,
  pairs: readonly Pair[],
  options: Resampling = {},
): Spread {
  const families = FAMILIES.filter(family => pairs.some(pair => pair.family === family))
  return {
    loss: resampled(Object.keys(tallies).toSorted(), drawn => meanLoss(tallies, drawn), options),
    discrimination: Object.fromEntries(
      families.map(family => [
        family,
        resampled(
          pairs.filter(pair => pair.family === family),
          drawn => shareOf(drawn, 'child') - shareOf(drawn, 'parent'),
          options,
        ),
      ]),
    ),
  }
}

/** What each parent's cases came to: the unit two runs are compared over. */
export function talliesOf(entries: readonly Graded[]): Tallies {
  const tallies: Record<string, ParentTally> = {}
  for (const entry of entries) {
    const parent = entry.case.split('/')[0] ?? entry.case
    const before = tallies[parent] ?? { entries: 0, loss: 0 }
    tallies[parent] = { entries: before.entries + 1, loss: before.loss + lossOf(entry) }
  }
  return tallies
}

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`
const of = (found: Rate): string => {
  const { low, high } = wilson(found.errors, found.n)
  return `${pct(found.rate)}（${String(found.errors)}/${String(found.n)}），95% 区间 ${pct(low)} 到 ${pct(high)}`
}
const between = ({ low, high }: Interval, digits: number): string =>
  `95% 区间 ${low.toFixed(digits)} 到 ${high.toFixed(digits)}`
const signed = (value: number): string => `${value < 0 ? '−' : ''}${Math.abs(value).toFixed(3)}`

/** Two runs over the same cases, side by side: each gate and each ranking number with its 95% interval, the cost, and the paired difference of their loss. */
export function renderComparison(
  base: Report,
  candidate: Report,
  paired: Paired,
  spreads: readonly [Spread, Spread],
): string {
  const sides = [base, candidate] as const
  const row = (name: string, cell: (report: Report, spread: Spread) => string): string =>
    `| ${name} | ${sides.map((report, side) => cell(report, spreads[side] as Spread)).join(' | ')} |`
  const families = FAMILIES.filter(family =>
    sides.some(report => report.gates.discrimination[family] !== undefined),
  )
  return [
    `数据：\`${candidate.split}\`，${String(candidate.parents)} 个母本，${String(candidate.cases)} 个用例。`,
    '',
    '| 指标 | 基线 | 最终 |',
    '| --- | --- | --- |',
    row('误判成立率', r => of(r.gates.falseHolds)),
    row('目标级的误收场率', r => of(r.gates.falseSettles)),
    ...families.map(family =>
      row(`成对的分辨力 · ${family}`, (r, spread) => {
        const found = r.gates.discrimination[family]
        const interval = spread.discrimination[family]
        if (found === undefined || interval === undefined) return '—'
        return `${found.value.toFixed(2)}（${String(found.n)} 对），${between(interval, 2)}`
      }),
    ),
    row('漏放率', r => of(r.ranking.missed)),
    row('过度弃权率', r => of(r.ranking.abstained)),
    row('守则漏报率', r => of(r.ranking.missedViolations)),
    row('加权损失', (r, spread) => `${r.ranking.loss.toFixed(3)}，${between(spread.loss, 3)}`),
    row('每个用例的请求数', r => r.cost.requestsPerCase.toFixed(2)),
    row('每个用例的费用（美元）', r => r.cost.costPerCase.toFixed(5)),
    '',
    `加权损失的成对差：最终减基线 ${signed(paired.difference)}，95% 区间 ${signed(paired.low)} 到 ${signed(paired.high)}（按 ${String(paired.parents)} 个母本重抽样）。`,
    '',
  ].join('\n')
}
