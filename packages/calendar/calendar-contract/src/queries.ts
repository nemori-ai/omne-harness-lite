import { z } from 'zod'
import {
  calendarIdSchema,
  calendarVersionIdSchema,
  localDateSchema,
  instantSchema,
  timezoneSchema,
  contentHashSchema,
  provenanceRefsSchema,
  classifyDayResultSchema,
  countWorkingDaysResultSchema,
  shiftWorkingDaysResultSchema,
  listWorkingDaysResultSchema,
  selectNthWorkingDayResultSchema,
} from './calculation.ts'

export const CALENDAR_PROTOCOL = 'omne.calendar-schedule/1'
const ref = z.string().min(1)
const calendarId = calendarIdSchema
const versionId = calendarVersionIdSchema
const date = localDateSchema
const instant = instantSchema
const timezone = timezoneSchema
const limit = z.int().min(1).max(100)
const cursor = z.string().min(1).nullable()

export const calendarOwnerSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('tenant'), tenantId: ref, ownerId: ref }).readonly(),
  z.strictObject({ kind: z.literal('system'), systemScopeRef: ref }).readonly(),
])
export type CalendarOwner = z.infer<typeof calendarOwnerSchema>
export const calendarCallContextSchema = z
  .strictObject({
    principalRef: ref,
    owner: calendarOwnerSchema,
    actor: z.strictObject({ kind: z.enum(['human', 'agent', 'system']), actorRef: ref }).readonly(),
    authContextRef: ref,
    requestId: ref,
    originatingSessionRef: ref.nullable(),
  })
  .readonly()
export type CalendarCallContext = z.infer<typeof calendarCallContextSchema>

export const calendarErrorCodeSchema = z.enum([
  'unauthenticated',
  'not_found',
  'forbidden',
  'invalid_input',
  'invalid_timezone',
  'missing_environment',
  'environment_incoherent',
  'unknown_calendar_version',
  'coverage_insufficient',
  'authority_unavailable',
  'search_limit',
  'capacity_exceeded',
  'provider_failure',
])
export const calendarDomainErrorSchema = z
  .strictObject({
    code: calendarErrorCodeSchema,
    message: z.string(),
    retryable: z.boolean(),
    requestId: z.string(),
    details: z
      .record(z.string(), z.union([z.string(), z.number().finite(), z.boolean(), z.null()]))
      .readonly(),
  })
  .readonly()
export type CalendarDomainError = z.infer<typeof calendarDomainErrorSchema>
export function calendarQueryResultSchema<T extends z.ZodType>(value: T) {
  return z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('ok'), value }).readonly(),
    z.strictObject({ kind: z.literal('error'), error: calendarDomainErrorSchema }).readonly(),
  ])
}
export type CalendarQueryResult<T> = z.infer<
  ReturnType<typeof calendarQueryResultSchema<z.ZodType<T>>>
>
export function calendarPageSchema<T extends z.ZodType>(item: T) {
  return z.strictObject({ items: z.array(item).max(100).readonly(), nextCursor: cursor }).readonly()
}
export const calendarListInputSchema = z
  .strictObject({ after: cursor.optional(), limit: limit.optional() })
  .readonly()
export type CalendarListInput = z.infer<typeof calendarListInputSchema>
export const calendarGetInputSchema = z
  .strictObject({
    calendarId,
    versionsAfter: cursor.optional(),
    versionsLimit: limit.optional(),
  })
  .readonly()
export type CalendarGetInput = z.infer<typeof calendarGetInputSchema>
export const calendarVersionInfoSchema = z
  .strictObject({
    versionId,
    coverageStart: date,
    coverageEnd: date,
    knowledgeAsOf: instant,
    synthesizedAt: instant,
    contentHash: contentHashSchema,
    provenanceRefs: provenanceRefsSchema,
    isPublished: z.boolean(),
  })
  .readonly()
export type CalendarVersionInfo = z.infer<typeof calendarVersionInfoSchema>
export const calendarInfoSchema = z
  .strictObject({
    calendarId,
    timezone,
    semanticBoundary: z.string().min(1),
    publishedVersionId: versionId.nullable(),
    publicationGeneration: z.int().nonnegative(),
    versions: calendarPageSchema(calendarVersionInfoSchema),
    supplyStanding: z.null(),
  })
  .readonly()
export type CalendarInfo = z.infer<typeof calendarInfoSchema>
export const calendarListValueSchema = calendarPageSchema(calendarInfoSchema)
  .unwrap()
  .extend({ observedAt: instant })
  .readonly()
export const calendarGetValueSchema = calendarInfoSchema
  .unwrap()
  .extend({ observedAt: instant })
  .readonly()
export const effectiveCalendarSchema = z
  .strictObject({
    owner: calendarOwnerSchema,
    environmentRevision: ref,
    activeTimezone: timezone,
    calendar: calendarInfoSchema,
  })
  .readonly()
export type EffectiveCalendar = z.infer<typeof effectiveCalendarSchema>

export const calendarSelectionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('effective') }).readonly(),
  z.strictObject({ kind: z.literal('explicit'), calendarId }).readonly(),
])
export const calendarVersionSelectionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('latest') }).readonly(),
  z.strictObject({ kind: z.literal('pinned'), versionId }).readonly(),
])
export const calendarQuerySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('day'), date }).readonly(),
  z
    .strictObject({ kind: z.literal('count'), from: date, to: date })
    .refine(value => value.from <= value.to, 'Range endpoints must be ordered')
    .readonly(),
  z.strictObject({ kind: z.literal('shift'), date, offset: z.int() }).readonly(),
  z
    .strictObject({ kind: z.literal('next'), after: date, count: z.int().min(1).max(366) })
    .readonly(),
  z
    .strictObject({
      kind: z.literal('nth'),
      periodStart: date,
      periodEnd: date,
      ordinal: z.union([z.int().positive(), z.literal('last')]),
    })
    .refine(value => value.periodStart <= value.periodEnd, 'Period endpoints must be ordered')
    .readonly(),
])
export const calendarResolveSchema = z
  .strictObject({
    selection: calendarSelectionSchema,
    version: calendarVersionSelectionSchema,
    query: calendarQuerySchema,
  })
  .readonly()
export type CalendarResolve = z.infer<typeof calendarResolveSchema>
export const calendarResolutionSchema = z
  .strictObject({
    calendarId,
    versionId,
    coverageStart: date,
    coverageEnd: date,
    result: z.discriminatedUnion('kind', [
      z
        .strictObject({
          kind: z.literal('day'),
          value: classifyDayResultSchema.options[1],
        })
        .readonly(),
      z
        .strictObject({
          kind: z.literal('count'),
          value: countWorkingDaysResultSchema.options[1],
        })
        .readonly(),
      z
        .strictObject({
          kind: z.literal('shift'),
          value: shiftWorkingDaysResultSchema.options[1],
        })
        .readonly(),
      z
        .strictObject({
          kind: z.literal('next'),
          value: listWorkingDaysResultSchema.options[1],
        })
        .readonly(),
      z
        .strictObject({
          kind: z.literal('nth'),
          value: selectNthWorkingDayResultSchema.options[1],
        })
        .readonly(),
    ]),
  })
  .readonly()
export type CalendarResolution = z.infer<typeof calendarResolutionSchema>
export const calendarListResultSchema = calendarQueryResultSchema(calendarListValueSchema)
export const calendarGetResultSchema = calendarQueryResultSchema(calendarGetValueSchema)
export const calendarEffectiveResultSchema = calendarQueryResultSchema(effectiveCalendarSchema)
export const calendarResolveResultSchema = calendarQueryResultSchema(calendarResolutionSchema)
export interface CalendarQueries {
  list(
    ctx: CalendarCallContext,
    input?: CalendarListInput,
  ): Promise<z.infer<typeof calendarListResultSchema>>
  get(
    ctx: CalendarCallContext,
    input: CalendarGetInput,
  ): Promise<z.infer<typeof calendarGetResultSchema>>
  effective(ctx: CalendarCallContext): Promise<z.infer<typeof calendarEffectiveResultSchema>>
  resolve(
    ctx: CalendarCallContext,
    input: CalendarResolve,
  ): Promise<z.infer<typeof calendarResolveResultSchema>>
}
