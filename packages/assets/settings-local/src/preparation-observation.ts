import { z } from 'zod'
import {
  SettingsCurrentBasisSchema,
  SettingsIdSchema,
  type SettingsPreparedOperationResult,
} from '@omne-harness/settings'
import {
  intentIdentitySchema,
  intentCommandSchema,
  intentPurposeSchema,
  intentStatusSchema,
  attemptStatusSchema,
} from './intent-schema.ts'
import { readySettingsIntentSchema } from './ready-schema.ts'
import { domainSchema } from './schema.ts'
import { intentCommandDigest } from './intent-records.ts'
export const preparationPlanSchema = readySettingsIntentSchema
  .pick({ basis: true, standing: true, sources: true })
  .extend({
    kind: z.literal('planned'),
    purpose: intentPurposeSchema,
    /** The secret items of the current definition; see `secretItemsOf`. Not stored with an attempt. */
    secretItems: z.array(SettingsIdSchema).max(128),
  })
const attemptSchema = z.strictObject({
  sequence: z.number().int().min(1).max(64),
  attemptId: SettingsIdSchema,
  plan: SettingsCurrentBasisSchema,
  status: attemptStatusSchema,
  sqlIdentity: domainSchema.extend({
    operation: z.string(),
    protocolVersion: z.literal('2'),
    operationKey: z.string(),
  }),
})
export const intentObservationSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('not_found') }),
  z.strictObject({
    kind: z.literal('found'),
    identity: intentIdentitySchema,
    intent: intentCommandSchema,
    purpose: intentPurposeSchema,
    status: intentStatusSchema,
    nextAttempt: z.number().int().min(1).max(65),
    attempt: attemptSchema.nullable(),
  }),
])
export type IntentObservation = z.infer<typeof intentObservationSchema>
export type ObservedIntent = Extract<IntentObservation, { kind: 'found' }>
export function preparationReference(root: ObservedIntent, attemptId: string) {
  return {
    protocol: 'settings-preparation/1' as const,
    operation: root.identity.operation,
    attemptId,
    commandDigest: intentCommandDigest(root.intent),
  }
}
export function attemptBinding(root: ObservedIntent, attemptId: string) {
  return {
    identity: root.identity,
    attemptId,
    commandKind: root.intent.kind,
    commandDigest: intentCommandDigest(root.intent),
  }
}
export function operationObservation(root: IntentObservation): SettingsPreparedOperationResult {
  if (root.kind === 'not_found') return root
  const operation = root.identity.operation
  if (root.status.state === 'committed') {
    const { operationId: _, ...result } = root.status.result
    return { ...result, operation }
  }
  if (root.status.state === 'aborted')
    return { kind: 'aborted', operation, reason: root.status.reason }
  const attempt = root.attempt
  if (attempt === null) return { kind: 'pending', operation, attempt: null }
  if (attempt.status.state === 'preparing')
    return {
      kind: 'pending',
      operation,
      attempt: { state: 'preparing', attemptId: attempt.attemptId },
    }
  if (attempt.status.state !== 'prepared' && attempt.status.state !== 'submitted')
    throw new Error('Terminal attempt cannot be current')
  return {
    kind: 'pending',
    operation,
    attempt: {
      state: attempt.status.state,
      preparation: preparationReference(root, attempt.attemptId),
    },
  }
}
