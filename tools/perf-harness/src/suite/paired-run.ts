import { judgeEquivalence, type Equivalence } from '../judgment/equivalence.ts'
import {
  judgePaired,
  MAX_ROUNDS,
  MINIMUM_CHANGE,
  orderOf,
  wantsMore,
  type PairedVerdict,
  type Side,
} from '../judgment/paired.ts'

export type Sample = Readonly<{
  digests: readonly string[]
  measures: Readonly<Record<string, number>>
}>

export type PairedRun = Readonly<{
  equivalence: Equivalence
  verdicts: Readonly<Record<string, PairedVerdict>> | null
  rounds: number
}>

export type PairedOptions = Readonly<{
  minimumChange?: Readonly<Record<string, number>>
  limit?: number
  order?: (round: number) => readonly Side[]
}>

const SIDES = ['base', 'self', 'candidate'] as const

export async function runPaired(
  sample: (side: Side, round: number) => Promise<Sample>,
  options: PairedOptions = {},
): Promise<PairedRun> {
  const { minimumChange = {}, limit = MAX_ROUNDS, order = orderOf } = options
  const taken: Record<Side, Sample>[] = []
  const judge = (measure: string): PairedVerdict =>
    judgePaired(
      taken.map(round => ({
        base: round.base.measures[measure] ?? Number.NaN,
        self: round.self.measures[measure] ?? Number.NaN,
        candidate: round.candidate.measures[measure] ?? Number.NaN,
      })),
      minimumChange[measure] ?? MINIMUM_CHANGE,
    )
  for (let round = 0; ; round += 1) {
    const sides = new Map<Side, Sample>()
    for (const side of order(round)) sides.set(side, await sample(side, round))
    const [base, self, candidate] = SIDES.map(side => {
      const one = sides.get(side)
      if (one === undefined) throw new Error(`the order of round ${String(round)} left out ${side}`)
      return one
    }) as [Sample, Sample, Sample]
    const equivalence = judgeEquivalence(base.digests, self.digests, candidate.digests)
    if (equivalence.state !== 'equivalent')
      return { equivalence, verdicts: null, rounds: round + 1 }
    taken.push({ base, self, candidate })
    const measures = Object.keys(base.measures)
    const first = measures[0]
    if (first === undefined) throw new Error('a sample carries no measure')
    if (!wantsMore(judge(first), limit))
      return {
        equivalence,
        verdicts: Object.fromEntries(measures.map(measure => [measure, judge(measure)])),
        rounds: round + 1,
      }
  }
}
