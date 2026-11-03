import { z } from 'zod'
import {
  calendarIdSchema,
  calendarVersionIdSchema,
  calendarSnapshotSchema,
  contentHashSchema,
  instantSchema,
  localDateSchema,
} from './calculation.ts'
import {
  CALENDAR_PROTOCOL,
  calendarQueryResultSchema,
  type CalendarCallContext,
} from './queries.ts'

const ref = z.string().min(1)
export const calendarRefreshInputSchema = z
  .strictObject({ calendarId: calendarIdSchema, policyVersion: ref, operationKey: ref })
  .readonly()
export type CalendarRefreshInput = z.infer<typeof calendarRefreshInputSchema>
export const calendarProbeInputSchema = calendarRefreshInputSchema
  .unwrap()
  .extend({ sourceId: ref })
  .readonly()
export type CalendarProbeInput = z.infer<typeof calendarProbeInputSchema>
export const calendarImportSeedInputSchema = z
  .strictObject({ packRef: ref, packHash: contentHashSchema, releaseRef: ref, operationKey: ref })
  .readonly()
export type CalendarImportSeedInput = z.infer<typeof calendarImportSeedInputSchema>
export const calendarOperationAddressSchema = z
  .strictObject({
    protocol: z.literal(CALENDAR_PROTOCOL),
    systemScopeRef: ref,
    operation: z.enum(['refresh', 'importSeed']),
    calendarId: calendarIdSchema,
    operationKey: ref,
  })
  .readonly()
export const calendarPublicationQuerySchema = z
  .strictObject({ address: calendarOperationAddressSchema, expectedFingerprint: contentHashSchema })
  .readonly()
export type CalendarPublicationQuery = z.infer<typeof calendarPublicationQuerySchema>
export const calendarPublishedReferenceSchema = z
  .strictObject({
    versionId: calendarVersionIdSchema,
    publicationGeneration: z.int().nonnegative(),
  })
  .readonly()
export const calendarPublicationReceiptSchema = z
  .strictObject({
    operationRef: ref,
    address: calendarOperationAddressSchema,
    fingerprint: contentHashSchema,
    candidateRef: ref,
    disposition: z.enum(['published', 'noChange', 'withheld', 'rejected']),
    current: calendarPublishedReferenceSchema.nullable(),
    outboxId: ref.nullable(),
  })
  .readonly()
export const calendarSupplyOutcomeSchema = z.discriminatedUnion('kind', [
  z
    .strictObject({
      kind: z.literal('recorded'),
      receipt: calendarPublicationReceiptSchema,
      replayed: z.boolean(),
    })
    .readonly(),
  z.strictObject({ kind: z.literal('unknown'), operationRef: ref }).readonly(),
  z.strictObject({ kind: z.literal('notCommitted'), operationRef: ref }).readonly(),
  z.strictObject({ kind: z.literal('cancelled'), phase: z.literal('beforeCommit') }).readonly(),
  z.strictObject({ kind: z.literal('rejected'), reason: ref, message: z.string() }).readonly(),
])
export type CalendarSupplyOutcome = z.infer<typeof calendarSupplyOutcomeSchema>
export const calendarSupplyResultSchema = calendarQueryResultSchema(calendarSupplyOutcomeSchema)
export type CalendarSupplyResult = z.infer<typeof calendarSupplyResultSchema>
export const calendarProbeObservationSchema = z
  .strictObject({
    sourceId: ref,
    observedAt: instantSchema,
    kind: z.enum(['changed', 'unchanged', 'failed']),
    marker: ref.nullable(),
    authorityCoverageEnd: localDateSchema.nullable(),
    reason: z.string().nullable(),
  })
  .readonly()
export type CalendarProbeObservation = z.infer<typeof calendarProbeObservationSchema>
export const calendarSourceStandingSchema = z
  .strictObject({
    sourceId: ref,
    observation: calendarProbeObservationSchema,
    nextDue: instantSchema,
    consecutiveFailures: z.int().nonnegative(),
    lastSuccess: instantSchema.nullable(),
  })
  .readonly()
export type CalendarSourceStanding = z.infer<typeof calendarSourceStandingSchema>
export const calendarProbeResultSchema = calendarQueryResultSchema(calendarSourceStandingSchema)
export const calendarHealthInputSchema = z
  .strictObject({ calendarId: calendarIdSchema, policyVersion: ref })
  .readonly()
export type CalendarHealthInput = z.infer<typeof calendarHealthInputSchema>
export const calendarHealthSchema = z
  .strictObject({
    calendarId: calendarIdSchema,
    observedAt: instantSchema,
    queryAvailability: z.enum(['available', 'missing', 'unavailable']),
    supply: z.enum(['ok', 'failed', 'pending', 'unknown']),
    horizon: z.enum(['ok', 'warning', 'critical', 'unknown']),
    coverageStart: localDateSchema.nullable(),
    coverageEnd: localDateSchema.nullable(),
    knowledgeAsOf: instantSchema.nullable(),
    remainingCoverageDays: z.int().nullable(),
    consecutiveFailures: z.int().nonnegative(),
    lastSuccess: instantSchema.nullable(),
    pendingRuns: z.int().nonnegative(),
    sources: z.array(calendarSourceStandingSchema).readonly(),
    reasons: z.array(z.string()).readonly(),
  })
  .readonly()
export type CalendarHealth = z.infer<typeof calendarHealthSchema>
export const calendarHealthResultSchema = calendarQueryResultSchema(calendarHealthSchema)

export const calendarSeedMaterialSchema = z
  .strictObject({
    sourceId: ref,
    acquiredAt: instantSchema,
    knowledgeAsOf: instantSchema,
    lineageRef: ref,
    authorityRef: ref,
    mediaType: ref,
    rawHash: contentHashSchema,
    contentBase64: z
      .string()
      .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  })
  .readonly()
export type CalendarSeedMaterial = z.infer<typeof calendarSeedMaterialSchema>
export const calendarSeedEntrySchema = z
  .strictObject({
    policyVersion: ref,
    policyHash: contentHashSchema,
    snapshot: calendarSnapshotSchema,
    authorityCoverageEnd: localDateSchema,
    materials: z.array(calendarSeedMaterialSchema).min(1).readonly(),
  })
  .readonly()
export type CalendarSeedEntry = z.infer<typeof calendarSeedEntrySchema>
export const calendarSeedPackSchema = z
  .strictObject({
    format: z.literal('omne.calendar-seed/1'),
    releaseRef: ref,
    releaseDate: localDateSchema,
    calendars: z.array(calendarSeedEntrySchema).min(1).readonly(),
  })
  .superRefine((pack, ctx) => {
    const ids = pack.calendars.map(entry => entry.snapshot.calendarId)
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', message: 'Seed calendar identities must be unique' })
  })
  .readonly()
export type CalendarSeedPack = z.infer<typeof calendarSeedPackSchema>
export const calendarImportSeedResultSchema = calendarQueryResultSchema(
  z
    .strictObject({
      releaseRef: ref,
      results: z
        .array(
          z
            .strictObject({
              calendarId: calendarIdSchema,
              outcome: calendarSupplyOutcomeSchema,
              warnings: z.array(z.string()).readonly(),
            })
            .readonly(),
        )
        .readonly(),
    })
    .readonly(),
)

export interface CalendarSupply {
  probe(
    ctx: CalendarCallContext,
    input: CalendarProbeInput,
  ): Promise<z.infer<typeof calendarProbeResultSchema>>
  refresh(ctx: CalendarCallContext, input: CalendarRefreshInput): Promise<CalendarSupplyResult>
  importSeed(
    ctx: CalendarCallContext,
    input: CalendarImportSeedInput,
  ): Promise<z.infer<typeof calendarImportSeedResultSchema>>
  queryPublication(
    ctx: CalendarCallContext,
    input: CalendarPublicationQuery,
  ): Promise<CalendarSupplyResult>
  health(
    ctx: CalendarCallContext,
    input: CalendarHealthInput,
  ): Promise<z.infer<typeof calendarHealthResultSchema>>
}
