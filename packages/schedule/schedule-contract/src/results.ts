import { z } from 'zod'
import { ScheduleRefSchema, ScheduleOperationRefSchema, ScheduleInstantSchema } from './values.ts'
import { ScheduleViewSchema } from './views.ts'
export const ScheduleErrorCodeSchema = z.enum([
  'unauthenticated',
  'not_found',
  'forbidden',
  'consent_required',
  'invalid_input',
  'unsupported_rule',
  'invalid_timezone',
  'missing_environment',
  'environment_incoherent',
  'unknown_calendar_version',
  'coverage_insufficient',
  'invalid_transition',
  'no_future_slot',
  'revision_conflict',
  'stale_basis',
  'stale_cursor',
  'operation_key_conflict',
  'preparation_conflict',
  'dependency_blocked',
  'authority_unavailable',
  'search_limit',
  'capacity_exceeded',
  'provider_failure',
])
export const ScheduleDomainErrorSchema = z.strictObject({
  code: ScheduleErrorCodeSchema,
  message: z.string(),
  retryable: z.boolean(),
  requestId: ScheduleRefSchema,
  details: z.record(
    z.string(),
    z.union([
      z.string(),
      z
        .number()
        .finite()
        .refine(value => !Number.isInteger(value) || Number.isSafeInteger(value)),
      z.boolean(),
      z.null(),
    ]),
  ),
})
export function ScheduleQueryResultSchema<T extends z.ZodType>(value: T) {
  return z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('ok'), value }),
    z.strictObject({ kind: z.literal('error'), error: ScheduleDomainErrorSchema }),
  ])
}
export type ScheduleQueryResult<T> = z.infer<
  ReturnType<typeof ScheduleQueryResultSchema<z.ZodType<T>>>
>
export function ScheduleCommandResultSchema<T extends z.ZodType>(value: T) {
  return z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.enum(['committed', 'noChange']),
      operationRef: ScheduleOperationRefSchema,
      value,
      replayed: z.boolean(),
    }),
    z.strictObject({
      kind: z.literal('unknown'),
      operationRef: ScheduleOperationRefSchema,
      retryAfterMs: z.int().nonnegative(),
    }),
    z.strictObject({ kind: z.literal('rejected'), error: ScheduleDomainErrorSchema }),
  ])
}
export type ScheduleCommandResult<T> = z.infer<
  ReturnType<typeof ScheduleCommandResultSchema<z.ZodType<T>>>
>
export type ScheduleDomainError = z.infer<typeof ScheduleDomainErrorSchema>
export const ScheduleNotCommittedProofsSchema = z.strictObject({
  writerGenerationExcluded: z.literal(true),
  oldTransactionTerminated: z.literal(true),
  databaseRecoveryFinished: z.literal(true),
  authoritativeReadSucceeded: z.literal(true),
  operationNotQueued: z.literal(true),
})
const operation = { operationRef: ScheduleOperationRefSchema, observedAt: ScheduleInstantSchema }
export const ScheduleOperationViewSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...operation,
    kind: z.enum(['committed', 'noChange']),
    result: ScheduleViewSchema,
    error: z.null(),
    notCommittedProofs: z.null(),
  }),
  z.strictObject({
    ...operation,
    kind: z.literal('rejected'),
    result: z.null(),
    error: ScheduleDomainErrorSchema,
    notCommittedProofs: z.null(),
  }),
  z.strictObject({
    ...operation,
    kind: z.enum(['pending', 'unknown']),
    result: z.null(),
    error: z.null(),
    notCommittedProofs: z.null(),
  }),
  z.strictObject({
    ...operation,
    kind: z.literal('notCommitted'),
    result: z.null(),
    error: z.null(),
    notCommittedProofs: ScheduleNotCommittedProofsSchema,
  }),
])
export type ScheduleOperationView = z.infer<typeof ScheduleOperationViewSchema>
export const ScheduleManagementResultSchema = ScheduleCommandResultSchema(ScheduleViewSchema)
export const ScheduleOperationResultSchema = ScheduleQueryResultSchema(ScheduleOperationViewSchema)
export type ScheduleManagementResult = z.infer<typeof ScheduleManagementResultSchema>
export type ScheduleOperationResult = z.infer<typeof ScheduleOperationResultSchema>
