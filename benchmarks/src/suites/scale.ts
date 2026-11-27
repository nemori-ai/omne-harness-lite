import {
  judgeScale,
  median,
  type Acceptance,
  type Control,
  type Gate,
  type Measured,
  type Reading,
  type ScaleVerdict,
} from '@omne-harness/perf-harness'
import type { Step, Trajectory } from '../trajectory.ts'

export const READ_ALLOWANCE = 0.02
export const BYTE_ALLOWANCE = 0.001

export type Span = Readonly<{
  reads: number
  commits: number
  commitBytes: number
  requestBytes: number
  byHandler?: Readonly<Record<string, number>>
  byParticipant?: Readonly<Record<string, number>>
}>

export type Rung<T extends Span = Step> = Readonly<{ scale: number; steps: readonly T[] }>

export const rungsOf = <T extends Span>(
  spans: readonly T[],
  scales: readonly number[],
  placeOf: (span: T) => number,
): Rung<T>[] =>
  scales.map(scale => ({
    scale,
    steps: spans.filter(span => placeOf(span) > scale / 2 && placeOf(span) <= scale),
  }))

type Quantity = Readonly<{
  what: string
  kind: Reading['kind']
  unit: string
  allowance: number
  of: (span: Span) => number
}>

export const COMMITS: Quantity = {
  what: 'commits',
  kind: 'count',
  unit: 'commits',
  allowance: 0,
  of: span => span.commits,
}
export const COMMIT_BYTES: Quantity = {
  what: 'commit bytes',
  kind: 'clocked',
  unit: 'bytes',
  allowance: BYTE_ALLOWANCE,
  of: span => span.commitBytes,
}
export const READS: Quantity = {
  what: 'reads',
  kind: 'clocked',
  unit: 'reads',
  allowance: READ_ALLOWANCE,
  of: span => span.reads,
}
export const QUANTITIES = [COMMITS, COMMIT_BYTES, READS] as const

export const clocked = (quantity: Quantity): Quantity => ({
  ...quantity,
  kind: 'clocked',
  allowance: READ_ALLOWANCE,
})

const valueOf = <T extends Span>(rung: Rung<T>, of: (span: T) => number): number =>
  rung.steps.length === 0 ? Number.NaN : median(rung.steps.map(of))

const points = <T extends Span>(rungs: readonly Rung<T>[], of: (span: T) => number) =>
  rungs.map(rung => ({ scale: rung.scale, value: valueOf(rung, of) }))

const shown = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(3)

function detailOf<T extends Span>(
  verdict: ScaleVerdict,
  rungs: readonly Rung<T>[],
  of: (span: T) => number,
): string {
  if (verdict.state === 'blocked') return verdict.reason
  const values = rungs.map(rung => shown(valueOf(rung, of))).join(', ')
  const ratios = verdict.ratios.map(ratio => ratio.toFixed(4)).join(', ')
  return `values ${values}; ratios ${ratios}; allowance ${String(verdict.allowance)}; ${verdict.perDoubling.toFixed(1)} more for each doubling`
}

export type Axis<T extends Span = Step> = Readonly<{
  name: string
  from: string
  scales: readonly number[]
  placeOf: (span: T) => number
  known: Readonly<Record<string, Acceptance>>
  span?: string
  gated?: readonly Quantity[]
  read?: readonly Quantity[]
  mustFail?: Readonly<{ what: string; of: (span: T) => number }>
}>

const spanOf = (axis: Readonly<{ span?: string }>): string => axis.span ?? 'a step'

export const nameOf = (quantity: Quantity, axis: Readonly<{ span?: string }>): string =>
  `${quantity.what} of ${spanOf(axis)}`

const GROWING = {
  what: 'the bytes of the request, which grow with the history',
  of: (span: Span) => span.requestBytes,
}

export function gatesOf<T extends Span>(
  spans: readonly T[],
  axis: Axis<T>,
): Pick<Measured, 'gates' | 'controls'> {
  const rungs = rungsOf(spans, axis.scales, axis.placeOf)
  const failing = axis.mustFail ?? GROWING
  const gates: Gate[] = []
  const controls: Control[] = []
  for (const quantity of axis.gated ?? QUANTITIES) {
    const name = nameOf(quantity, axis)
    const verdict = judgeScale(points(rungs, quantity.of), quantity.allowance)
    const known = axis.known[name]
    gates.push({
      name,
      from: axis.from,
      state: verdict.state,
      detail: detailOf(verdict, rungs, quantity.of),
      ...(known === undefined ? {} : { known }),
    })
    const grows = judgeScale(points(rungs, failing.of), quantity.allowance)
    const still = judgeScale(
      points(rungs, () => 1),
      quantity.allowance,
    )
    controls.push(
      {
        gate: name,
        expected: 'fail',
        state: grows.state,
        detail: `${failing.what}: ${detailOf(grows, rungs, failing.of)}`,
      },
      {
        gate: name,
        expected: 'pass',
        state: still.state,
        detail: 'a count that is one at any scale',
      },
    )
  }
  return { gates, controls }
}

const REQUEST_BYTES: Quantity = {
  what: 'request bytes',
  kind: 'count',
  unit: 'bytes',
  allowance: 0,
  of: span => span.requestBytes,
}

export function readingsOf<T extends Span>(spans: readonly T[], axis: Axis<T>): Reading[] {
  const rungs = rungsOf(spans, axis.scales, axis.placeOf)
  const at = (rung: Rung<T>): string => `at ${axis.name} ${String(rung.scale)}`
  const readings: Reading[] = []
  for (const quantity of axis.read ?? QUANTITIES)
    for (const rung of rungs)
      readings.push({
        name: `${nameOf(quantity, axis)} ${at(rung)}`,
        kind: quantity.kind,
        unit: quantity.unit,
        value: valueOf(rung, quantity.of),
      })
  for (const rung of rungs)
    readings.push({
      name: `request bytes after ${spanOf(axis)} ${at(rung)}`,
      kind: 'count',
      unit: 'bytes',
      value: valueOf(rung, REQUEST_BYTES.of),
    })
  const top = rungs.at(-1)
  if (top === undefined) return readings
  const shares = (pick: (span: T) => Readonly<Record<string, number>> | undefined) =>
    [...new Set(top.steps.flatMap(span => Object.keys(pick(span) ?? {})))]
      .sort()
      .map(name => ({ name, value: valueOf(top, span => pick(span)?.[name] ?? 0) }))
      .filter(share => share.value > 0)
  for (const share of shares(span => span.byParticipant))
    readings.push({
      name: `commits of ${spanOf(axis)} by ${share.name} ${at(top)}`,
      kind: 'count',
      unit: 'commits',
      value: share.value,
    })
  for (const share of shares(span => span.byHandler))
    readings.push({
      name: `reads of ${spanOf(axis)} by ${share.name} ${at(top)}`,
      kind: 'clocked',
      unit: 'reads',
      value: share.value,
    })
  return readings
}

export function floorOf(steps: readonly Step[]): Reading[] {
  const first = steps[0]
  if (first === undefined) return []
  return QUANTITIES.map(quantity => ({
    name: `${quantity.what} of a step on an empty session`,
    kind: quantity.kind,
    unit: quantity.unit,
    value: quantity.of(first),
  }))
}

export const timesOf = (trajectory: Trajectory): Reading[] => [
  {
    name: 'wall time of the trajectory',
    kind: 'time',
    unit: 'ms',
    value: Math.round(trajectory.wallMs),
  },
  ...(trajectory.processorMs === null
    ? []
    : [
        {
          name: 'processor time of the server',
          kind: 'time' as const,
          unit: 'ms',
          value: trajectory.processorMs,
        },
      ]),
]

export const sampleOf = (trajectory: Trajectory) => ({
  digests: trajectory.digests,
  measures: {
    'wall ms': trajectory.wallMs,
    ...(trajectory.processorMs === null ? {} : { 'server processor ms': trajectory.processorMs }),
    'reads of a step': median(trajectory.steps.map(step => step.reads)),
    'commit bytes of a step': median(trajectory.steps.map(step => step.commitBytes)),
  },
})

export const CHANGES: Readonly<Record<string, number>> = {
  'reads of a step': READ_ALLOWANCE,
  'commit bytes of a step': BYTE_ALLOWANCE,
}
