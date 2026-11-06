import { z } from 'zod'
import {
  SettingsAbortedOperationSchema,
  SettingsChangeSchema,
  SettingsCurrentBasisSchema,
  SettingsIdSchema,
  SettingsOperationRefSchema,
  SettingsRebaseSchema,
  SettingsReferenceSchema,
} from '@omne-harness/settings'
import { domainSchema, operationSchema } from './schema.ts'

export const intentIdentitySchema = z.strictObject({
  domain: domainSchema,
  principalRef: SettingsReferenceSchema,
  operation: SettingsOperationRefSchema,
})
export const intentCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('change'), command: SettingsChangeSchema }),
  z.strictObject({ kind: z.literal('rebase'), command: SettingsRebaseSchema }),
])
export const intentPurposeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('target-change') }),
  z.strictObject({ kind: z.literal('source-update'), sourceKey: SettingsReferenceSchema }),
])
export const intentStatusSchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('open') }),
  z.strictObject({ state: z.literal('committed'), result: operationSchema }),
  z.strictObject({
    state: z.literal('aborted'),
    reason: SettingsAbortedOperationSchema.shape.reason,
  }),
])
export const attemptStatusSchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('preparing'), basis: z.null() }),
  z.strictObject({ state: z.literal('prepared'), basis: SettingsCurrentBasisSchema }),
  z.strictObject({ state: z.literal('submitted'), basis: SettingsCurrentBasisSchema }),
  z.strictObject({ state: z.literal('committed'), basis: SettingsCurrentBasisSchema }),
  z.strictObject({ state: z.literal('aborted'), basis: SettingsCurrentBasisSchema.nullable() }),
])
export const intentAllocationSchema = z.strictObject({
  identity: intentIdentitySchema,
  intent: intentCommandSchema,
  purpose: intentPurposeSchema,
  attemptId: SettingsIdSchema,
  plan: SettingsCurrentBasisSchema,
})
export type IntentIdentity = z.infer<typeof intentIdentitySchema>
export type IntentCommand = z.infer<typeof intentCommandSchema>
export type IntentPurpose = z.infer<typeof intentPurposeSchema>
export type IntentStatus = z.infer<typeof intentStatusSchema>
export type AttemptStatus = z.infer<typeof attemptStatusSchema>
export type IntentAllocation = z.infer<typeof intentAllocationSchema>
