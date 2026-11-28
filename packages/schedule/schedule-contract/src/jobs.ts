import { z } from 'zod'
import { ScheduleCandidateSchema } from './candidates.ts'
import { ScheduleJobIdSchema, ScheduleJobRunSchema, ScheduleJobSummarySchema } from './history.ts'
import type { ScheduleQueryResult } from './results.ts'
import {
  ScheduleIdSchema,
  ScheduleInstantSchema,
  ScheduleRefSchema as ref,
  type ScheduleCallContext,
} from './values.ts'
import { SchedulePurposeSchema, ScheduleWorkSchema } from './work.ts'

/** One Job read in full: what it was fixed to do, where it runs, how it went and each step it took. */
export const ScheduleJobDetailSchema = z.strictObject({
  job: ScheduleJobSummarySchema,
  run: ScheduleJobRunSchema,
  scheduleId: ScheduleIdSchema.nullable(),
  slot: ScheduleCandidateSchema.nullable(),
  purpose: SchedulePurposeSchema,
  definitionRevision: z.int().nonnegative(),
  reason: ref.nullable(),
  executionWhere: z
    .discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('program'), programRef: ref, executionRef: ref }),
      z.strictObject({
        kind: z.literal('session'),
        sessionRef: ref,
        account: z
          .strictObject({
            adopted: z.strictObject({ name: ref, version: ref }).nullable(),
            outcome: ref.nullable(),
            deliverables: z.array(z.string()).readonly(),
            since: ref.nullable(),
            run: ref.nullable(),
          })
          .nullable(),
      }),
    ])
    .nullable(),
  events: z.array(
    z.strictObject({ seq: z.int().positive(), kind: ref, at: ScheduleInstantSchema }),
  ),
})
export const ScheduleJobRequestSchema = z.strictObject({ jobId: ScheduleJobIdSchema })
export const ScheduleJobsOfExecutionRequestSchema = z.strictObject({
  executionRef: ref,
  limit: z.int().min(1).max(50),
})
export const ScheduleJobCancelRequestSchema = z.strictObject({
  jobId: ScheduleJobIdSchema,
  operationKey: ref,
})
export const ScheduleJobStartRequestSchema = z.strictObject({
  work: ScheduleWorkSchema,
  operationKey: ref,
})
export type ScheduleJobDetail = z.infer<typeof ScheduleJobDetailSchema>
export type ScheduleJobRequest = z.infer<typeof ScheduleJobRequestSchema>
export type ScheduleJobsOfExecutionRequest = z.infer<typeof ScheduleJobsOfExecutionRequestSchema>
export type ScheduleJobCancelRequest = z.infer<typeof ScheduleJobCancelRequestSchema>
export type ScheduleJobStartRequest = z.infer<typeof ScheduleJobStartRequestSchema>
export type ScheduleJobWrite = Readonly<{
  outcome: 'committed' | 'noChange' | 'unknown'
  detail: ScheduleJobDetail | null
}>
export type ScheduleJobRecall = Readonly<{ committed: boolean; detail: ScheduleJobDetail | null }>

/** Reading one Job, cancelling one, and starting one outside any schedule, each write with its recall. */
export interface ScheduleJobs {
  get(
    ctx: ScheduleCallContext,
    input: ScheduleJobRequest,
  ): Promise<ScheduleQueryResult<ScheduleJobDetail>>
  /** The Jobs whose execution is this one (the session they run or ran in), newest first; only those the caller may see. */
  ofExecution(
    ctx: ScheduleCallContext,
    input: ScheduleJobsOfExecutionRequest,
  ): Promise<ScheduleQueryResult<readonly ScheduleJobDetail[]>>
  cancel(
    ctx: ScheduleCallContext,
    input: ScheduleJobCancelRequest,
  ): Promise<ScheduleQueryResult<ScheduleJobWrite>>
  queryCancel(
    ctx: ScheduleCallContext,
    input: ScheduleJobCancelRequest,
  ): Promise<ScheduleQueryResult<ScheduleJobRecall>>
  start(
    ctx: ScheduleCallContext,
    input: ScheduleJobStartRequest,
  ): Promise<ScheduleQueryResult<ScheduleJobWrite>>
  queryStart(
    ctx: ScheduleCallContext,
    input: ScheduleJobStartRequest,
  ): Promise<ScheduleQueryResult<ScheduleJobRecall>>
}
