import { createHash } from 'node:crypto'
import canonicalize from 'canonicalize'
import { z } from 'zod'
import {
  SCHEDULE_PROTOCOL,
  ScheduleOwnerSchema,
  ScheduleIdSchema,
  ScheduleOperationRefSchema,
  ScheduleOperationKeySchema,
  ScheduleFingerprintSchema,
  ScheduleJsonValueSchema,
  type ScheduleFingerprint,
} from './values.ts'
import { ScheduleCreateRequestSchema, ScheduleCommandSchema } from './commands.ts'
export const ScheduleOperationNameSchema = z.enum([
  'schedule.create',
  'schedule.update',
  'schedule.reviseDraft',
  'schedule.reconfirmConsent',
  'schedule.pause',
  'schedule.resume',
  'schedule.stop',
  'schedule.promote',
  'schedule.discard',
  'schedule.replace',
])
const entityOperation = ScheduleOperationNameSchema.exclude(['schedule.create'])
const addressBase = {
  protocol: z.literal(SCHEDULE_PROTOCOL),
  operationKey: ScheduleOperationKeySchema,
}
export const ScheduleOperationAddressSchema = z.union([
  z.strictObject({
    ...addressBase,
    operation: z.literal('schedule.create'),
    aggregate: z.strictObject({ kind: z.literal('create') }),
  }),
  z.strictObject({
    ...addressBase,
    operation: entityOperation,
    aggregate: z.strictObject({ kind: z.literal('entity'), id: ScheduleIdSchema }),
  }),
])
export type ScheduleOperationAddress = z.infer<typeof ScheduleOperationAddressSchema>
export const ScheduleOperationLocatorSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ref'), operationRef: ScheduleOperationRefSchema }),
  z.strictObject({
    kind: z.literal('identity'),
    identity: ScheduleOperationAddressSchema,
    expectedFingerprint: ScheduleFingerprintSchema,
  }),
])
export type ScheduleOperationLocator = z.infer<typeof ScheduleOperationLocatorSchema>
export const ScheduleOperationIntentInputSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('create'),
    owner: ScheduleOwnerSchema,
    input: ScheduleCreateRequestSchema,
  }),
  z.strictObject({
    kind: z.literal('execute'),
    owner: ScheduleOwnerSchema,
    input: ScheduleCommandSchema,
  }),
])
export type ScheduleOperationIntentInput = z.infer<typeof ScheduleOperationIntentInputSchema>
export function createScheduleOperationIntent(input: ScheduleOperationIntentInput) {
  ScheduleJsonValueSchema.parse(input)
  const parsed = ScheduleOperationIntentInputSchema.parse(input)
  const { owner } = parsed
  const { meta } = parsed.input
  if (parsed.kind === 'create') {
    const intent = {
      protocol: SCHEDULE_PROTOCOL,
      operation: 'schedule.create',
      owner,
      aggregateRef: null,
      payload: { definition: parsed.input.definition, initial: parsed.input.initial },
      expectedRevision: meta.expectedRevision,
      consentRef: meta.consentRef,
    }
    return {
      address: ScheduleOperationAddressSchema.parse({
        protocol: SCHEDULE_PROTOCOL,
        operation: intent.operation,
        aggregate: { kind: 'create' },
        operationKey: meta.operationKey,
      }),
      intent,
    }
  }
  const { scheduleId, meta: _meta, ...payload } = parsed.input
  const operation = entityOperation.parse(`schedule.${payload.action}`)
  const intent = {
    protocol: SCHEDULE_PROTOCOL,
    operation,
    owner,
    aggregateRef: scheduleId,
    payload,
    expectedRevision: meta.expectedRevision,
    consentRef: meta.consentRef,
  }
  return {
    address: ScheduleOperationAddressSchema.parse({
      protocol: SCHEDULE_PROTOCOL,
      operation,
      aggregate: { kind: 'entity', id: scheduleId },
      operationKey: meta.operationKey,
    }),
    intent,
  }
}
export type ScheduleOperationIntent = ReturnType<typeof createScheduleOperationIntent>['intent']
export function canonicalizeScheduleOperation(input: ScheduleOperationIntentInput): string {
  const { intent } = createScheduleOperationIntent(input)
  const encoded = canonicalize(intent)
  if (encoded === undefined) throw new TypeError('Operation intent must be JSON data')
  return encoded
}
export function fingerprintScheduleOperation(
  input: ScheduleOperationIntentInput,
): ScheduleFingerprint {
  return ScheduleFingerprintSchema.parse(
    createHash('sha256').update(canonicalizeScheduleOperation(input), 'utf8').digest('hex'),
  )
}
