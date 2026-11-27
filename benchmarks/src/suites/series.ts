import {
  GROWTH,
  judgeSeries,
  median,
  type Acceptance,
  type Control,
  type Gate,
  type Measured,
  type Reading,
} from '@omne-harness/perf-harness'
import type { RoundEnd } from '../trajectory.ts'

type Series = Readonly<{
  name: string
  unit: string
  kind: Reading['kind']
  of: (rounds: readonly RoundEnd[]) => number[] | null
}>

const gainedState = (rounds: readonly RoundEnd[]): number[] =>
  rounds.map((round, index) => round.stateBytes - (rounds[index - 1]?.stateBytes ?? 0))

export const SERIES: readonly Series[] = [
  {
    name: 'resident memory of the server at the end of a round',
    unit: 'bytes',
    kind: 'clocked',
    of: rounds =>
      rounds.every(round => round.residentBytes !== null)
        ? rounds.map(round => round.residentBytes ?? 0)
        : null,
  },
  { name: 'state bytes gained in a round', unit: 'bytes', kind: 'clocked', of: gainedState },
  {
    name: 'wall time of a round',
    unit: 'ms',
    kind: 'time',
    of: rounds => rounds.map(r => r.wallMs),
  },
]

export const SERIES_ROUNDS = GROWTH.lastRound

const CONTROL_SHARE = 0.005

type State = Gate['state']

function judged(values: readonly number[]): Readonly<{ state: State; detail: string }> {
  const { median: late, growth } = judgeSeries(values)
  const states = [late.state, growth.state]
  const state: State = states.includes('fail')
    ? 'fail'
    : states.includes('blocked')
      ? 'blocked'
      : 'pass'
  const window =
    late.state === 'blocked'
      ? `late window blocked: ${late.reason}`
      : `late window ${late.ratio.toFixed(3)} times the early one (limit ${String(late.threshold)})`
  const slope =
    growth.state === 'blocked'
      ? `growth blocked: ${growth.reason}`
      : `${growth.predictedGrowth.toFixed(1)} over ${String(GROWTH.span)} rounds, fit ${growth.r2.toFixed(3)}, scatter ${growth.residualMAD.toFixed(1)}`
  return { state, detail: `${window}; ${slope}` }
}

export function seriesGatesOf(
  rounds: readonly RoundEnd[],
  known: Readonly<Record<string, Acceptance>>,
): Pick<Measured, 'gates' | 'controls'> {
  const gates: Gate[] = []
  const controls: Control[] = []
  for (const series of SERIES) {
    const values = series.of(rounds)
    const name = `${series.name} over the rounds`
    const accepted = known[name]
    if (values === null) {
      gates.push({
        name,
        from: 'long session: it does not keep rising with the rounds',
        state: 'blocked',
        detail: 'the machine does not tell it',
      })
      continue
    }
    gates.push({
      name,
      from: 'long session: it does not keep rising with the rounds',
      ...judged(values),
      ...(accepted === undefined ? {} : { known: accepted }),
    })
    const middle = median(values)
    const rising = judged(values.map((_, index) => middle + (index + 1) * middle * CONTROL_SHARE))
    const level = judged(values.map(() => middle))
    controls.push(
      {
        gate: name,
        expected: 'fail',
        state: rising.state,
        detail: `a series that rises by ${String(CONTROL_SHARE * 100)}% of the median every round: ${rising.detail}`,
      },
      { gate: name, expected: 'pass', state: level.state, detail: 'a level series at the median' },
    )
  }
  return { gates, controls }
}

export function seriesReadingsOf(rounds: readonly RoundEnd[]): Reading[] {
  const last = rounds.at(-1)
  if (last === undefined) return []
  return SERIES.flatMap(series => {
    const values = series.of(rounds)
    if (values === null) return []
    return [
      {
        name: `${series.name}, median`,
        kind: series.kind,
        unit: series.unit,
        value: median(values),
      },
      {
        name: `${series.name}, last round`,
        kind: series.kind,
        unit: series.unit,
        value: values.at(-1) ?? Number.NaN,
      },
    ]
  })
}
