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

export type Rung = Readonly<{ scale: number; steps: readonly Step[] }>

export const rungsOf = (
  steps: readonly Step[],
  scales: readonly number[],
  placeOf: (step: Step) => number,
): Rung[] =>
  scales.map(scale => ({
    scale,
    steps: steps.filter(step => placeOf(step) > scale / 2 && placeOf(step) <= scale),
  }))

type Quantity = Readonly<{
  name: string
  kind: Reading['kind']
  unit: string
  allowance: number
  of: (step: Step) => number
}>

export const COMMITS: Quantity = {
  name: 'commits of a step',
  kind: 'count',
  unit: 'commits',
  allowance: 0,
  of: step => step.commits,
}
export const COMMIT_BYTES: Quantity = {
  name: 'commit bytes of a step',
  kind: 'count',
  unit: 'bytes',
  allowance: 0,
  of: step => step.commitBytes,
}
export const READS: Quantity = {
  name: 'reads of a step',
  kind: 'clocked',
  unit: 'reads',
  allowance: READ_ALLOWANCE,
  of: step => step.reads,
}
export const QUANTITIES = [COMMITS, COMMIT_BYTES, READS] as const

const REQUEST_BYTES: Quantity = {
  name: 'request bytes',
  kind: 'count',
  unit: 'bytes',
  allowance: 0,
  of: step => step.requestBytes,
}

const valueOf = (rung: Rung, of: (step: Step) => number): number =>
  rung.steps.length === 0 ? Number.NaN : median(rung.steps.map(of))

const points = (rungs: readonly Rung[], of: (step: Step) => number) =>
  rungs.map(rung => ({ scale: rung.scale, value: valueOf(rung, of) }))

const shown = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(3)

function detailOf(
  verdict: ScaleVerdict,
  rungs: readonly Rung[],
  of: (step: Step) => number,
): string {
  if (verdict.state === 'blocked') return verdict.reason
  const values = rungs.map(rung => shown(valueOf(rung, of))).join(', ')
  const ratios = verdict.ratios.map(ratio => ratio.toFixed(4)).join(', ')
  return `values ${values}; ratios ${ratios}; allowance ${String(verdict.allowance)}; ${verdict.perDoubling.toFixed(1)} more for each doubling`
}

export type Axis = Readonly<{
  name: string
  from: string
  scales: readonly number[]
  placeOf: (step: Step) => number
  known: Readonly<Record<string, Acceptance>>
}>

export function gatesOf(steps: readonly Step[], axis: Axis): Pick<Measured, 'gates' | 'controls'> {
  const rungs = rungsOf(steps, axis.scales, axis.placeOf)
  const gates: Gate[] = []
  const controls: Control[] = []
  for (const quantity of QUANTITIES) {
    const verdict = judgeScale(points(rungs, quantity.of), quantity.allowance)
    const known = axis.known[quantity.name]
    gates.push({
      name: quantity.name,
      from: axis.from,
      state: verdict.state,
      detail: detailOf(verdict, rungs, quantity.of),
      ...(known === undefined ? {} : { known }),
    })
    const grows = judgeScale(points(rungs, REQUEST_BYTES.of), quantity.allowance)
    const still = judgeScale(
      points(rungs, () => 1),
      quantity.allowance,
    )
    controls.push(
      {
        gate: quantity.name,
        expected: 'fail',
        state: grows.state,
        detail: `the bytes of the request, which grow with the history: ${detailOf(grows, rungs, REQUEST_BYTES.of)}`,
      },
      {
        gate: quantity.name,
        expected: 'pass',
        state: still.state,
        detail: 'the model requests of a step, one at any scale',
      },
    )
  }
  return { gates, controls }
}

export function readingsOf(steps: readonly Step[], axis: Axis): Reading[] {
  const rungs = rungsOf(steps, axis.scales, axis.placeOf)
  const at = (rung: Rung): string => `at ${axis.name} ${String(rung.scale)}`
  const readings: Reading[] = []
  for (const quantity of [...QUANTITIES, REQUEST_BYTES])
    for (const rung of rungs)
      readings.push({
        name: `${quantity.name} ${at(rung)}`,
        kind: quantity.kind,
        unit: quantity.unit,
        value: valueOf(rung, quantity.of),
      })
  const top = rungs.at(-1)
  if (top === undefined) return readings
  const names = (pick: (step: Step) => Readonly<Record<string, number>>): string[] =>
    [...new Set(top.steps.flatMap(step => Object.keys(pick(step))))].sort()
  for (const participant of names(step => step.byParticipant))
    readings.push({
      name: `commits of a step by ${participant} ${at(top)}`,
      kind: 'count',
      unit: 'commits',
      value: valueOf(top, step => step.byParticipant[participant] ?? 0),
    })
  for (const handler of names(step => step.byHandler))
    readings.push({
      name: `reads of a step by ${handler} ${at(top)}`,
      kind: 'clocked',
      unit: 'reads',
      value: valueOf(top, step => step.byHandler[handler] ?? 0),
    })
  return readings
}

export function floorOf(steps: readonly Step[]): Reading[] {
  const first = steps[0]
  if (first === undefined) return []
  return QUANTITIES.map(quantity => ({
    name: `${quantity.name} on an empty session`,
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
  },
})
