import { judgeEquivalence, type Equivalence } from '../judgment/equivalence.ts'
import {
  judgePaired,
  MAX_ROUNDS,
  MINIMUM_CHANGE,
  orderOf,
  wantsMore,
  type PairedVerdict,
  type Round,
  type Side,
} from '../judgment/paired.ts'

/** What one side did in one fresh process. */
export type Sample = Readonly<{ wallMs: number; cpuMs: number; digests: readonly string[] }>

export type PairedRun = Readonly<{
  equivalence: Equivalence
  /** null when the sides did not do the same work: speed is not judged */
  wall: PairedVerdict | null
  cpu: PairedVerdict | null
  rounds: number
}>

export type PairedOptions = Readonly<{
  minimumChange?: number
  limit?: number
  /** the order the sides run in a round; replaced only to show what rotation is for */
  order?: (round: number) => readonly Side[]
}>

/**
 * Runs base, base again and candidate round after round, in rotating order, until the wall time can be
 * judged or the limit is reached. The first round that shows the sides did different work ends it.
 */
export async function runPaired(
  sample: (side: Side, round: number) => Promise<Sample>,
  options: PairedOptions = {},
): Promise<PairedRun> {
  const { minimumChange = MINIMUM_CHANGE, limit = MAX_ROUNDS, order = orderOf } = options
  const wall: Round[] = []
  const cpu: Round[] = []
  for (let round = 0; ; round += 1) {
    const taken = new Map<Side, Sample>()
    for (const side of order(round)) taken.set(side, await sample(side, round))
    const [base, self, candidate] = (['base', 'self', 'candidate'] as const).map(side => {
      const one = taken.get(side)
      if (one === undefined) throw new Error(`the order of round ${String(round)} left out ${side}`)
      return one
    }) as [Sample, Sample, Sample]
    const equivalence = judgeEquivalence(base.digests, self.digests, candidate.digests)
    if (equivalence.state !== 'equivalent')
      return { equivalence, wall: null, cpu: null, rounds: round + 1 }
    wall.push({ base: base.wallMs, self: self.wallMs, candidate: candidate.wallMs })
    cpu.push({ base: base.cpuMs, self: self.cpuMs, candidate: candidate.cpuMs })
    const verdict = judgePaired(wall, minimumChange)
    if (!wantsMore(verdict, limit))
      return { equivalence, wall: verdict, cpu: judgePaired(cpu, minimumChange), rounds: round + 1 }
  }
}
