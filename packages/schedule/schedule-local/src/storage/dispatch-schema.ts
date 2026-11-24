import { z } from 'zod'
import {
  ScheduleCandidateSchema,
  ScheduleIdSchema,
  ScheduleInstantSchema,
  ScheduleJobIdSchema,
  ScheduleOwnerSchema,
  ScheduleReceiptIdSchema,
  ScheduleRefSchema,
  ScheduleWorkSchema,
} from '@omne-harness/schedule-contract'
import { PARTICIPANT, quotaEffectSchema, quotaHoldingSchema, storageScopeSchema } from './schema.ts'

export const DISPATCH_MIGRATION = { owner: PARTICIPANT, id: 'schedule-dispatch-1' }
export const DISPATCH_TABLES = [
  'sc_watch',
  'sc_dispatch',
  'sc_receipts',
  'sc_sources',
  'sc_jobs',
  'sc_job_events',
  'sc_lapses',
]

const reasons = z.array(z.string().min(1)).readonly()
const blockSchema = z.strictObject({
  kind: z.enum(['blocked', 'terminal']),
  reasons,
  since: ScheduleInstantSchema,
})
export const dispatchStateSchema = z.strictObject({
  revision: z.int().positive(),
  watchedFrom: ScheduleInstantSchema,
  watchedCause: z.enum(['enabled', 'resumed', 'recovered', 'takeover']),
  disposedThrough: ScheduleInstantSchema.nullable(),
  next: ScheduleCandidateSchema.nullable(),
  block: blockSchema.nullable(),
  selected: z.array(ScheduleCandidateSchema).readonly().default([]),
  counting: z
    .strictObject({ through: ScheduleInstantSchema, cause: z.string().min(1) })
    .nullable()
    .default(null),
})
const written = { exhausts: z.boolean() }
export const admissionSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('retreat'),
    reason: z.enum(['disposed', 'earlier', 'inactive']),
  }),
  z.strictObject({ kind: z.literal('recompute') }),
  z.strictObject({ kind: z.literal('exhaust') }),
  z.strictObject({ kind: z.literal('invalidate'), reasons }),
  z.strictObject({ kind: z.literal('block'), reasons }),
  z.strictObject({ kind: z.literal('miss'), reason: z.literal('reminder-window'), ...written }),
  z.strictObject({ kind: z.literal('reject'), reason: z.string().min(1), ...written }),
  z.strictObject({ kind: z.literal('skip'), reason: z.literal('overlap'), ...written }),
  z.strictObject({
    kind: z.literal('accept'),
    start: z.enum(['ready', 'waiting']),
    stopPredecessors: z.boolean(),
    ...written,
  }),
])
export const preparedSchema = z.strictObject({
  hasNext: z.boolean(),
  missingCarriers: z.array(z.string().min(1)).readonly(),
  reminderClosed: z.boolean().nullable(),
  standing: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('eligible') }),
    z.strictObject({ kind: z.enum(['refused', 'terminal']), reason: z.string().min(1) }),
  ]),
})
const target = { owner: ScheduleOwnerSchema, at: ScheduleInstantSchema }
const jobFactsSchema = z.strictObject({
  state: z.enum(['accepted', 'waiting', 'startPending', 'running', 'blocked', 'concluded']),
  stopState: z.enum(['none', 'requested', 'pending', 'confirmed', 'unknown']),
  executionRef: z.string().min(1).nullable(),
  outcome: z.enum(['succeeded', 'failed', 'cancelled']).nullable(),
  reason: z.string().nullable(),
})
const jobEventSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.enum([
      'predecessorsQuiet',
      'startIntent',
      'cancel',
      'stopSent',
      'stopConfirmed',
      'stopUnknown',
    ]),
  }),
  z.strictObject({
    kind: z.literal('taken'),
    executionRef: z.string().min(1),
    running: z.boolean(),
  }),
  z.strictObject({ kind: z.literal('notStarted'), recoverable: z.boolean(), reason: z.string() }),
  z.strictObject({
    kind: z.literal('ended'),
    report: z.enum(['succeeded', 'failed', 'stopped']),
    result: z.boolean(),
    reason: z.string(),
  }),
])
export const dispatchCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('beat'), ...target, gapMs: z.int().positive() }),
  z.strictObject({
    kind: z.literal('refresh'),
    ...target,
    scheduleId: ScheduleIdSchema,
    revision: z.int().positive(),
    state: dispatchStateSchema.nullable(),
  }),
  z.strictObject({
    kind: z.literal('direct'),
    ...target,
    jobId: ScheduleJobIdSchema,
    work: ScheduleWorkSchema,
  }),
  z.strictObject({
    kind: z.literal('step'),
    ...target,
    jobId: ScheduleJobIdSchema,
    revision: z.int().positive(),
    event: jobEventSchema,
    next: jobFactsSchema,
    operation: z.string().min(1).optional(),
  }),
  z.strictObject({
    kind: z.literal('classify'),
    ...target,
    scheduleId: ScheduleIdSchema,
    revision: z.int().positive(),
    from: ScheduleInstantSchema.nullable(),
    through: ScheduleInstantSchema,
    cause: z.string().min(1),
    reason: z.string().min(1),
    counted: z.array(ScheduleCandidateSchema).readonly().nullable(),
    selected: z.array(ScheduleCandidateSchema).readonly(),
    more: z.boolean(),
    next: ScheduleCandidateSchema.nullable(),
    exhausts: z.boolean(),
    holding: quotaHoldingSchema,
  }),
  z.strictObject({
    kind: z.literal('admit'),
    ...target,
    scheduleId: ScheduleIdSchema,
    revision: z.int().positive(),
    slot: ScheduleCandidateSchema,
    next: ScheduleCandidateSchema.nullable(),
    prepared: preparedSchema,
    decision: admissionSchema,
    holding: quotaHoldingSchema,
    receiptId: ScheduleReceiptIdSchema,
    jobId: ScheduleJobIdSchema,
  }),
])
export const dispatchBindingSchema = z.strictObject({
  scope: storageScopeSchema,
  commandDigest: ScheduleRefSchema,
  command: dispatchCommandSchema,
})
/** A dispatch commit goes through the same guard as management: it stamps the decision time and keeps quota. */
export const dispatchRequirementSchema = z.strictObject({
  dispatch: dispatchBindingSchema,
  quotaEffect: quotaEffectSchema,
  resultingHolding: quotaHoldingSchema.nullable(),
})
export const dispatchFactSchema = dispatchRequirementSchema.extend({
  decisionAt: ScheduleInstantSchema,
})
export const jobRequestSchema = z.strictObject({
  kind: z.literal('dispatchJob'),
  scope: storageScopeSchema,
  owner: ScheduleOwnerSchema,
  jobId: ScheduleJobIdSchema,
})
export const pendingRequestSchema = z.strictObject({
  kind: z.literal('dispatchPending'),
  scope: storageScopeSchema,
  owner: ScheduleOwnerSchema,
  now: ScheduleInstantSchema,
  limit: z.int().min(1).max(50),
})
export type DispatchCommandInput = z.infer<typeof dispatchCommandSchema>
export type DispatchRequirement = z.infer<typeof dispatchRequirementSchema>
