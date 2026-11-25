import type { ExitId, MetricId } from './body.ts'
import type { Attendance } from './validate.ts'

/** How far a goal is from done, as much of it as the stall count compares between two observations. */
export type Gap = Readonly<{ open: number; remaining: Readonly<Record<MetricId, number>> }>

/** Why a goal is paused: the person paused it, or a row of the verdict table handed it to the person. */
export type Pause =
  | Readonly<{ by: 'person' }>
  | Readonly<{ by: 'verdict'; row: 5 | 6 | 7 | 8; exit: ExitId | null }>

export type GoalOutcome =
  | Readonly<{ kind: 'achieved' }>
  | Readonly<{ kind: 'exit'; exit: ExitId; counts: 'success' | 'failure' }>
  | Readonly<{ kind: 'unattainable' | 'stalled' | 'judge-unavailable' | 'aborted' | 'cancelled' }>

/** Where a goal stands for the round that carries it: the n-th goal of the session, its revision, the rounds used. */
type Standing = Readonly<{
  attendance: Attendance
  generation: number
  revision: number
  rounds: number
}>
type Progress = Readonly<{ stalled: number; gap: Gap | null }>

export type GoalState =
  | Readonly<{ status: 'none'; generation: number }>
  | (Readonly<{ status: 'active' }> & Standing & Progress)
  | (Readonly<{ status: 'paused'; pause: Pause }> & Standing & Progress)
  | (Readonly<{ status: 'settled'; outcome: GoalOutcome }> & Standing)
export type GoalStatus = GoalState['status']

/** A session before its first goal. */
export const NO_GOAL: GoalState = Object.freeze({ status: 'none', generation: 0 })

/** What an outcome counts as to whoever asked: only achieving, or an exit written as success, is success. */
export function countsAs(outcome: GoalOutcome): 'success' | 'failure' | 'neither' {
  if (outcome.kind === 'achieved') return 'success'
  if (outcome.kind === 'exit') return outcome.counts
  return outcome.kind === 'cancelled' ? 'neither' : 'failure'
}
