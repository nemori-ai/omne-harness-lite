import { z } from 'zod'
import { ExitIdSchema, MetricIdSchema } from './body.ts'

export const AttendanceSchema = z.enum(['attended', 'unattended'])
/** Whether a person is in the session: it decides who owns the goal and what the evidence may be. */
export type Attendance = z.infer<typeof AttendanceSchema>

const count = z.int().nonnegative()
export const GapSchema = z.strictObject({
  open: count,
  remaining: z.record(MetricIdSchema, z.number().nonnegative()),
})
/** How far a goal is from done, as much of it as the stall count compares between two observations. */
export type Gap = z.infer<typeof GapSchema>

export const PauseSchema = z.discriminatedUnion('by', [
  z.strictObject({ by: z.literal('person') }),
  z.strictObject({
    by: z.literal('verdict'),
    row: z.union([z.literal(5), z.literal(6), z.literal(7), z.literal(8)]),
    exit: ExitIdSchema.nullable(),
  }),
])
/** Why a goal is paused: the person paused it, or a row of the verdict table handed it to the person. */
export type Pause = z.infer<typeof PauseSchema>

export const GoalOutcomeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('achieved') }),
  z.strictObject({
    kind: z.literal('exit'),
    exit: ExitIdSchema,
    counts: z.enum(['success', 'failure']),
  }),
  z.strictObject({
    kind: z.enum(['unattainable', 'stalled', 'judge-unavailable', 'aborted', 'cancelled']),
  }),
])
export type GoalOutcome = z.infer<typeof GoalOutcomeSchema>

/** Where a goal stands for the round that carries it: the n-th goal of the session, its revision, the rounds used. */
const standing = {
  attendance: AttendanceSchema,
  generation: z.int().positive(),
  revision: z.int().positive(),
  rounds: count,
}
const progress = { stalled: count, gap: GapSchema.nullable() }

export const GoalStateSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('none'), generation: count }),
  z.strictObject({ status: z.literal('active'), ...standing, ...progress }),
  z.strictObject({ status: z.literal('paused'), ...standing, ...progress, pause: PauseSchema }),
  z.strictObject({ status: z.literal('settled'), ...standing, outcome: GoalOutcomeSchema }),
])
export type GoalState = z.infer<typeof GoalStateSchema>
export type GoalStatus = GoalState['status']

/** A session before its first goal. */
export const NO_GOAL: GoalState = Object.freeze({ status: 'none', generation: 0 })

/** What an outcome counts as to whoever asked: only achieving, or an exit written as success, is success. */
export function countsAs(outcome: GoalOutcome): 'success' | 'failure' | 'neither' {
  if (outcome.kind === 'achieved') return 'success'
  if (outcome.kind === 'exit') return outcome.counts
  return outcome.kind === 'cancelled' ? 'neither' : 'failure'
}
