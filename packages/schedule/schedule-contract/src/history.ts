import { z } from 'zod'
import {
  ScheduleRefSchema as ref,
  ScheduleUuidSchema,
  ScheduleIdSchema,
  ScheduleRevisionSchema,
  ScheduleInstantSchema,
  ScheduleFingerprintSchema,
  ScheduleOperationRefSchema,
} from './values.ts'
import { ScheduleCandidateSchema } from './candidates.ts'
export const ScheduleJobIdSchema = ScheduleUuidSchema.brand<'ScheduleJobId'>()
export const ScheduleReceiptIdSchema = ScheduleUuidSchema.brand<'ScheduleReceiptId'>()
export const SchedulePreparationIdSchema = ScheduleUuidSchema.brand<'SchedulePreparationId'>()
export const SchedulePreparationSummarySchema = z.strictObject({
  preparationId: SchedulePreparationIdSchema,
  definitionRevision: ScheduleRevisionSchema,
  preparedAt: ScheduleInstantSchema,
  fingerprint: ScheduleFingerprintSchema,
  admissionDeadline: ScheduleInstantSchema.nullable(),
})
const receipt = {
  receiptId: ScheduleReceiptIdSchema,
  decidedAt: ScheduleInstantSchema,
  reasonCode: z.string(),
  operationRef: ScheduleOperationRefSchema,
}
export const ScheduleReceiptSummarySchema = z.discriminatedUnion('disposition', [
  z.strictObject({
    ...receipt,
    disposition: z.enum(['acceptedExecution', 'acceptedReminder']),
    jobId: ScheduleJobIdSchema,
  }),
  z.strictObject({
    ...receipt,
    disposition: z.enum(['rejected', 'missed', 'skipped']),
    jobId: z.null(),
  }),
])
const execution = { kind: z.literal('execution'), executionRef: ref.nullable() }
export const ScheduleExecutionSummarySchema = z.discriminatedUnion('executionState', [
  z.strictObject({
    ...execution,
    executionState: z.enum(['accepted', 'waiting', 'startPending', 'running', 'blocked']),
    terminalReceiptRef: z.null(),
    outcome: z.union([z.literal('unknown'), z.null()]),
  }),
  z.strictObject({
    ...execution,
    executionState: z.literal('concluded'),
    terminalReceiptRef: ref,
    outcome: z.enum(['succeeded', 'failed', 'cancelled']),
  }),
])
const notification = {
  kind: z.literal('notification'),
  notificationIntentId: ref,
  notificationId: ref.nullable(),
}
export const ScheduleNotificationBodySummarySchema = z.discriminatedUnion('primaryOutcome', [
  z.strictObject({
    ...notification,
    primaryOutcome: z.literal('durableAvailable'),
    durableAvailableReceiptRef: ref,
  }),
  z.strictObject({
    ...notification,
    primaryOutcome: z.enum(['pending', 'failed', 'unknown', 'cancelled']),
    durableAvailableReceiptRef: z.null(),
  }),
])
export const ScheduleJobSummarySchema = z.strictObject({
  jobId: ScheduleJobIdSchema,
  revision: ScheduleRevisionSchema,
  acceptedAt: ScheduleInstantSchema,
  body: z.union([ScheduleExecutionSummarySchema, ScheduleNotificationBodySummarySchema]),
  stopState: z.enum(['none', 'requested', 'pending', 'confirmed', 'unknown']),
  stopOperationRef: ref.nullable(),
  stopReceiptRef: ref.nullable(),
})
const notificationSummary = {
  notificationIntentId: ref,
  notificationId: ref.nullable(),
  observedAt: ScheduleInstantSchema,
}
export const ScheduleNotificationSummarySchema = z.discriminatedUnion('outcome', [
  z.strictObject({
    ...notificationSummary,
    outcome: z.literal('durableAvailable'),
    durableAvailableReceiptRef: ref,
  }),
  z.strictObject({
    ...notificationSummary,
    outcome: z.enum(['pending', 'failed', 'unknown', 'cancelled']),
    durableAvailableReceiptRef: z.null(),
  }),
])
export const ScheduleExecutionRowSchema = z.strictObject({
  rowRef: ref,
  scheduleId: ScheduleIdSchema,
  occurrenceKey: ref,
  originalScheduledAt: ScheduleInstantSchema,
  candidate: ScheduleCandidateSchema,
  preparation: SchedulePreparationSummarySchema.nullable(),
  receipt: ScheduleReceiptSummarySchema.nullable(),
  job: ScheduleJobSummarySchema.nullable(),
  notification: ScheduleNotificationSummarySchema.nullable(),
})
export type SchedulePreparationSummary = z.infer<typeof SchedulePreparationSummarySchema>
export type ScheduleReceiptSummary = z.infer<typeof ScheduleReceiptSummarySchema>
export type ScheduleJobSummary = z.infer<typeof ScheduleJobSummarySchema>
export type ScheduleNotificationSummary = z.infer<typeof ScheduleNotificationSummarySchema>
export type ScheduleExecutionRow = z.infer<typeof ScheduleExecutionRowSchema>
