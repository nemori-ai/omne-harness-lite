import { isUnknown, type Field } from './field.ts'
import { assemblyIdOf, configIdOf, workloadIdOf, type Json } from './ids.ts'
import { onMemoryFilesystem, type Machine } from './machine.ts'
import type { Probe, Spread } from './probes.ts'
import type { State } from './state.ts'

/** What was measured: which code, put together how, asked what. */
export type Subject = Readonly<{
  commit: Field<string>
  dirty: Field<boolean>
  release: boolean
  assembly: Json
  workload: Json
}>

/** The four blocks every result carries. */
export type Environment = Readonly<{
  machine: Machine
  /** recorded for the reader; no part of any identifier */
  beside: Readonly<Record<string, Field>>
  subject: Subject
  state: State
  probes: Readonly<{ first: Probe; last: Probe }>
}>

export type Ids = Readonly<{ workload: string; assembly: string; config: string }>

export const idsOf = (environment: Pick<Environment, 'machine' | 'subject'>): Ids => ({
  workload: workloadIdOf(environment.subject.workload),
  assembly: assemblyIdOf(environment.subject.assembly),
  config: configIdOf(environment.machine),
})

/** The lines a state has to stay inside for its times to be trusted. Candidates until the calibration of the line. */
export const LINES = {
  /** the first and the last probe of one run may differ by this share */
  probeDrift: 0.1,
  /** a probe may differ from the baseline of this machine by this share */
  baselineDrift: 0.15,
  /** the load of the minute before the run, per usable core */
  loadPerCore: 0.25,
  /** the share of processor time the host took away */
  stolen: 0.02,
} as const

export type Fitness = Readonly<{
  /** whether the times of this result may be read at all */
  times: 'fit' | 'blocked'
  /** whether the times may become a baseline */
  baseline: 'fit' | 'blocked'
  stateQualified: boolean
  /** null when there is no baseline of this machine to hold the probes against */
  probesHold: boolean | null
  reasons: readonly string[]
}>

const drift = (a: number, b: number): number => Math.abs(a - b) / Math.min(a, b)

function pairs(first: Probe, last: Probe): [string, number, number][] {
  const medians = (name: string, a: Field<Spread>, b: Field<Spread>): [string, number, number][] =>
    isUnknown(a) || isUnknown(b) ? [] : [[name, a.medianMs, b.medianMs]]
  return [
    ['compute', first.computeMs, last.computeMs],
    ...medians('synchronous write', first.syncWrite, last.syncWrite),
    ...medians('commit', first.commit, last.commit),
  ]
}

const drifted = (first: Probe, last: Probe, line: number): string[] =>
  pairs(first, last)
    .filter(([, a, b]) => drift(a, b) > line)
    .map(([name]) => name)

/** Whether the times of a result can be trusted, decided from its own record. Counts do not depend on any of this. */
export function fitnessOf(environment: Environment, pinnedNode: string, baseline?: Probe): Fitness {
  const { machine, state, probes, subject } = environment
  const node = machine.runtime.node
  const environmentBlocks = [
    ...(onMemoryFilesystem(machine)
      ? ['the data directory is on a memory filesystem: a synchronous write costs nothing']
      : []),
    ...(node === pinnedNode ? [] : [`Node ${node} is not the pinned ${pinnedNode}`]),
  ]
  const moved = drifted(probes.first, probes.last, LINES.probeDrift)
  const stateFaults = [
    ...(moved.length > 0 ? [`the probes moved during the run: ${moved.join(', ')}`] : []),
    ...((state.loadBefore[0] ?? 0) > machine.cpu.usable * LINES.loadPerCore
      ? ['the machine was loaded before the run']
      : []),
    ...(!isUnknown(state.stolenShare) && state.stolenShare > LINES.stolen
      ? ['the host took processor time away']
      : []),
  ]
  const against =
    baseline === undefined ? null : drifted(baseline, probes.first, LINES.baselineDrift)
  const blocked = environmentBlocks.length > 0
  return {
    times: blocked ? 'blocked' : 'fit',
    baseline: blocked || subject.dirty !== false || stateFaults.length > 0 ? 'blocked' : 'fit',
    stateQualified: !blocked && stateFaults.length === 0,
    probesHold: against === null ? null : against.length === 0,
    reasons: [
      ...environmentBlocks,
      ...stateFaults,
      ...(against !== null && against.length > 0
        ? [`the probes drifted from the baseline of this machine: ${against.join(', ')}`]
        : []),
      ...(subject.dirty === false
        ? []
        : [
            subject.dirty === true
              ? 'the working tree is dirty'
              : 'the working tree is not known to be clean',
          ]),
    ],
  }
}
