import { FAMILIES } from './case.ts'
import type { Report } from './report.ts'
import { lossOf, quantile, type Graded, type Rate } from './score.ts'

/** What one parent's cases came to in one run: how many entries were graded and what they cost. */
export type ParentTally = Readonly<{
  entries: number
  loss: number
  notHolds: number
  falseHolds: number
}>
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

export type Paired = Readonly<{ difference: number; low: number; high: number; parents: number }>

/** The candidate's mean loss minus the base's over the same parents, with a 95% interval from resampling parents. */
export function pairedLoss(
  base: Tallies,
  candidate: Tallies,
  options: Readonly<{ draws?: number; seed?: number }> = {},
): Paired {
  const parents = Object.keys(base).toSorted()
  if (parents.join('\n') !== Object.keys(candidate).toSorted().join('\n'))
    throw new Error('the two runs do not cover the same parents')
  const difference = (drawn: readonly string[]): number =>
    meanLoss(candidate, drawn) - meanLoss(base, drawn)
  const random = generator(options.seed ?? 1)
  const draws = Array.from({ length: options.draws ?? 2000 }, () =>
    difference(parents.map(() => parents[Math.floor(random() * parents.length)] as string)),
  )
  return {
    difference: difference(parents),
    low: quantile(draws, 0.025),
    high: quantile(draws, 0.975),
    parents: parents.length,
  }
}

/** What each parent's cases came to: the unit two runs are compared over. */
export function talliesOf(entries: readonly Graded[]): Tallies {
  const tallies: Record<string, ParentTally> = {}
  for (const entry of entries) {
    const parent = entry.case.split('/')[0] ?? entry.case
    const before = tallies[parent] ?? { entries: 0, loss: 0, notHolds: 0, falseHolds: 0 }
    const judged = entry.kind === 'criterion' && entry.asked && entry.truth !== 'holds'
    tallies[parent] = {
      entries: before.entries + 1,
      loss: before.loss + lossOf(entry),
      notHolds: before.notHolds + (judged ? 1 : 0),
      falseHolds: before.falseHolds + (judged && entry.said === 'holds' ? 1 : 0),
    }
  }
  return tallies
}

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`
const of = (found: Rate): string =>
  `${pct(found.rate)}（${String(found.errors)}/${String(found.n)}）`
const signed = (value: number): string => `${value < 0 ? '−' : ''}${Math.abs(value).toFixed(3)}`

/** Two runs over the same cases, side by side: the gates, what ranks them, what they cost, and the paired difference of their loss. */
export function renderComparison(base: Report, candidate: Report, paired: Paired): string {
  const sides = [base, candidate] as const
  const row = (name: string, cell: (report: Report) => string): string =>
    `| ${name} | ${sides.map(cell).join(' | ')} |`
  const families = FAMILIES.filter(family =>
    sides.some(report => report.gates.discrimination[family] !== undefined),
  )
  return [
    `数据：\`${candidate.split}\`，${String(candidate.parents)} 个母本，${String(candidate.cases)} 个用例。`,
    '',
    '| 指标 | 基线 | 最终 |',
    '| --- | --- | --- |',
    row('误判成立率', r => `${of(r.gates.falseHolds)}，95% 上界 ${pct(r.gates.falseHolds.upper)}`),
    row('目标级的误收场率', r => of(r.gates.falseSettles)),
    ...families.map(family =>
      row(`成对的分辨力 · ${family}`, r => {
        const found = r.gates.discrimination[family]
        return found === undefined ? '—' : `${found.value.toFixed(2)}（${String(found.n)} 对）`
      }),
    ),
    row('漏放率', r => of(r.ranking.missed)),
    row('过度弃权率', r => of(r.ranking.abstained)),
    row('守则漏报率', r => of(r.ranking.missedViolations)),
    row('加权损失', r => r.ranking.loss.toFixed(3)),
    row('每个用例的请求数', r => r.cost.requestsPerCase.toFixed(2)),
    row('每个用例的费用（美元）', r => r.cost.costPerCase.toFixed(5)),
    '',
    `加权损失的成对差：最终减基线 ${signed(paired.difference)}，95% 区间 ${signed(paired.low)} 到 ${signed(paired.high)}（按 ${String(paired.parents)} 个母本重抽样）。`,
    '',
  ].join('\n')
}
