import { Temporal } from '@js-temporal/polyfill'
import { z } from 'zod'
import {
  ScheduleIdSchema,
  ScheduleRefSchema as ref,
  ScheduleInstantSchema,
  ScheduleCivilSchema,
  ScheduleTimezoneSchema,
  ScheduleOwnerSchema,
} from './values.ts'
import {
  ScheduleControlSchema,
  ScheduleStandingKindSchema,
  ScheduleStandingSchema,
  ScheduleViewSchema,
  ScheduleRevisionViewSchema,
} from './views.ts'
import { ScheduleDefinitionSchema } from './definition.ts'
import {
  ScheduleAdoptedBasisSchema,
  ScheduleCandidateSchema,
  ScheduleExcludedCandidateSchema,
} from './candidates.ts'
import {
  ScheduleExecutionRowSchema,
  ScheduleJobIdSchema,
  ScheduleReceiptIdSchema,
} from './history.ts'
import { ScheduleQueryResultSchema } from './results.ts'
const cursor = ref.nullable()
export const SchedulePageRequestSchema = z.strictObject({ cursor, limit: z.int().min(1).max(500) })
export const ScheduleFilterSchema = z.strictObject({
  agentRef: ref.nullable(),
  control: ScheduleControlSchema.nullable(),
  standing: ScheduleStandingKindSchema.nullable(),
  createdBy: ref.nullable(),
  targetDeviceRef: ref.nullable(),
  calendarId: ref.nullable(),
  purpose: z.enum(['execution', 'reminder']).nullable(),
})
export const ScheduleExactTotalSchema = z.strictObject({
  kind: z.literal('exact'),
  value: z.int().nonnegative(),
})
export const ScheduleTotalSchema = z.discriminatedUnion('kind', [
  ScheduleExactTotalSchema,
  z.strictObject({
    kind: z.literal('unknown'),
    reason: z.enum(['budgetExceeded', 'sourceUnavailable']),
  }),
])
export function SchedulePageSchema<T extends z.ZodType>(item: T) {
  return z.strictObject({
    items: z.array(item),
    nextCursor: cursor,
    observationRevision: ref,
    complete: z.boolean(),
    total: ScheduleTotalSchema,
  })
}
export type SchedulePage<T> = z.infer<ReturnType<typeof SchedulePageSchema<z.ZodType<T>>>>
export const ScheduleListRequestSchema = z.strictObject({
  ...ScheduleFilterSchema.shape,
  cursor,
  limit: z.int().min(1).max(200),
})
export const ScheduleListPageSchema = SchedulePageSchema(ScheduleViewSchema).extend({
  items: z.array(ScheduleViewSchema).max(200),
  total: ScheduleExactTotalSchema,
})
export const ScheduleListResultSchema = ScheduleQueryResultSchema(ScheduleListPageSchema)
export const ScheduleGetRequestSchema = z.strictObject({ scheduleId: ScheduleIdSchema })
export const ScheduleRevisionsRequestSchema = z.strictObject({
  scheduleId: ScheduleIdSchema,
  ...SchedulePageRequestSchema.shape,
})
export const ScheduleExecutionsRequestSchema = z
  .strictObject({
    scheduleId: ScheduleIdSchema,
    from: ScheduleInstantSchema.nullable(),
    to: ScheduleInstantSchema.nullable(),
    ...SchedulePageRequestSchema.shape,
  })
  .refine(
    value => value.from === null || value.to === null || value.from < value.to,
    'Execution time range must be ordered',
  )
export const ScheduleRevisionsPageSchema = SchedulePageSchema(ScheduleRevisionViewSchema).extend({
  items: z.array(ScheduleRevisionViewSchema).max(500),
})
export const ScheduleExecutionsPageSchema = SchedulePageSchema(ScheduleExecutionRowSchema).extend({
  items: z.array(ScheduleExecutionRowSchema).max(500),
})
export const SchedulePreviewRequestSchema = z.strictObject({
  source: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('schedule'), scheduleId: ScheduleIdSchema }),
    z.strictObject({ kind: z.literal('inline'), definition: ScheduleDefinitionSchema }),
  ]),
  after: ScheduleInstantSchema,
  count: z.int().min(1).max(100),
})
export const SchedulePreviewViewSchema = z
  .strictObject({
    candidates: z.array(ScheduleCandidateSchema).max(100),
    excluded: z.array(ScheduleExcludedCandidateSchema),
    basis: ScheduleAdoptedBasisSchema,
    complete: z.boolean(),
    observedThrough: ScheduleInstantSchema,
    reason: z.enum(['search_limit', 'deadline_exceeded', 'explanation_limit']).nullable(),
    remainingEligible: z.int().nonnegative().nullable(),
    remainingJobs: z.int().nonnegative().nullable(),
  })
  .refine(
    value => value.complete === (value.reason === null),
    'Incomplete previews require a reason',
  )
export const ScheduleAgendaRequestSchema = z
  .strictObject({
    from: ScheduleCivilSchema,
    to: ScheduleCivilSchema,
    timezone: ScheduleTimezoneSchema,
    filter: ScheduleFilterSchema,
    cursor,
    limit: z.int().min(1).max(5_000),
  })
  .refine(
    value =>
      value.from < value.to &&
      Temporal.PlainDateTime.compare(
        Temporal.PlainDateTime.from(value.from).add({ days: 92 }),
        Temporal.PlainDateTime.from(value.to),
      ) >= 0,
    'Agenda range must be positive and no longer than 92 civil days',
  )
const agendaRow = {
  scheduleId: ScheduleIdSchema,
  owner: ScheduleOwnerSchema,
  purpose: z.enum(['execution', 'reminder']),
  scheduledAt: ScheduleInstantSchema,
  displayLocal: ScheduleCivilSchema,
  basis: ScheduleAdoptedBasisSchema,
  control: ScheduleControlSchema,
  standing: ScheduleStandingSchema,
  explanation: z.array(ref),
}
export const ScheduleAgendaRowSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...agendaRow,
    kind: z.literal('history'),
    receiptRef: ScheduleReceiptIdSchema.nullable(),
    jobRef: ScheduleJobIdSchema.nullable(),
  }),
  z.strictObject({
    ...agendaRow,
    kind: z.literal('prediction'),
    receiptRef: z.null(),
    jobRef: z.null(),
  }),
])
export const ScheduleAgendaViewSchema = SchedulePageSchema(ScheduleAgendaRowSchema)
  .extend({
    items: z.array(ScheduleAgendaRowSchema).max(5_000),
    range: z.strictObject({ from: ScheduleCivilSchema, to: ScheduleCivilSchema }),
    timezone: ScheduleTimezoneSchema,
    scannedScheduleCount: z.int().min(0).max(10_000),
    incompleteReason: ref.nullable(),
  })
  .refine(
    value => value.complete === (value.incompleteReason === null),
    'Incomplete agendas require a reason',
  )
export type SchedulePageRequest = z.infer<typeof SchedulePageRequestSchema>
export type ScheduleFilter = z.infer<typeof ScheduleFilterSchema>
export type ScheduleListRequest = z.infer<typeof ScheduleListRequestSchema>
export type ScheduleListPage = z.infer<typeof ScheduleListPageSchema>
export type ScheduleGetRequest = z.infer<typeof ScheduleGetRequestSchema>
export type ScheduleRevisionsRequest = z.infer<typeof ScheduleRevisionsRequestSchema>
export type ScheduleExecutionsRequest = z.infer<typeof ScheduleExecutionsRequestSchema>
export type SchedulePreviewRequest = z.infer<typeof SchedulePreviewRequestSchema>
export type SchedulePreviewView = z.infer<typeof SchedulePreviewViewSchema>
export type ScheduleAgendaRequest = z.infer<typeof ScheduleAgendaRequestSchema>
export type ScheduleAgendaView = z.infer<typeof ScheduleAgendaViewSchema>
export type ScheduleAgendaRow = z.infer<typeof ScheduleAgendaRowSchema>
export const ScheduleGetResultSchema = ScheduleQueryResultSchema(ScheduleViewSchema)
export const ScheduleRevisionsResultSchema = ScheduleQueryResultSchema(ScheduleRevisionsPageSchema)
export const ScheduleExecutionsResultSchema = ScheduleQueryResultSchema(
  ScheduleExecutionsPageSchema,
)
export const SchedulePreviewResultSchema = ScheduleQueryResultSchema(SchedulePreviewViewSchema)
export const ScheduleAgendaResultSchema = ScheduleQueryResultSchema(ScheduleAgendaViewSchema)
export type ScheduleListResult = z.infer<typeof ScheduleListResultSchema>
export type ScheduleGetResult = z.infer<typeof ScheduleGetResultSchema>
export type ScheduleRevisionsResult = z.infer<typeof ScheduleRevisionsResultSchema>
export type ScheduleExecutionsResult = z.infer<typeof ScheduleExecutionsResultSchema>
export type SchedulePreviewResult = z.infer<typeof SchedulePreviewResultSchema>
export type ScheduleAgendaResult = z.infer<typeof ScheduleAgendaResultSchema>
