import { z } from 'zod'
import {
  SettingDefinitionsSchema,
  SettingsChangeSchema,
  SettingsDefinitionRefSchema,
  SettingsIdSchema,
  SettingsReferenceSchema,
  SettingsStateSchema,
  SettingsTargetSchema,
} from '@omne-harness/settings'

export const PARTICIPANT = 'settings.persistence'
export const PROTOCOL = 'settings-sql/1'
export const HANDLER = 'settings.read'
export const GUARD_FACT = { key: 'settings.current', protocol: PROTOCOL }
export const RESULT_FACT = { key: 'settings.result', protocol: PROTOCOL }
export const TABLES = ['st_states', 'st_operations', 'st_changes']
export const MIGRATION = { owner: PARTICIPANT, id: 'settings-1' }
export const scopeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('system') }),
  z.strictObject({ kind: z.literal('tenant'), tenant: SettingsReferenceSchema }),
])
export const domainSchema = z.strictObject({
  scope: scopeSchema,
  transactionDomain: SettingsIdSchema,
})
export const bindingSchema = z.strictObject({
  domain: domainSchema,
  principalRef: SettingsReferenceSchema,
  command: SettingsChangeSchema,
  commandDigest: z.string().regex(/^[a-f0-9]{64}$/),
})
export const operationBindingSchema = z.strictObject({
  domain: domainSchema,
  principalRef: SettingsReferenceSchema,
  target: SettingsTargetSchema,
  operationId: SettingsIdSchema,
  commandDigest: z.string().regex(/^[a-f0-9]{64}$/),
})
export const guardFactSchema = z.strictObject({
  binding: bindingSchema,
  definition: SettingDefinitionsSchema,
  definitionRef: SettingsDefinitionRefSchema,
  grants: z
    .array(
      z.strictObject({
        sourceId: SettingsIdSchema,
        actions: z.array(z.enum(['set', 'clear', 'lock', 'unlock'])).max(4),
      }),
    )
    .max(32),
  sourceIds: z
    .array(SettingsIdSchema)
    .min(1)
    .max(32)
    .refine(ids => new Set(ids).size === ids.length),
})
export const failureSchema = z.strictObject({
  kind: z.literal('rejected'),
  reason: z.enum([
    'invalid_input',
    'limit_exceeded',
    'forbidden',
    'unavailable',
    'basis_changed',
    'revision_conflict',
    'definition_changed',
    'locked',
    'incompatible',
    'unsupported',
    'operation_conflict',
    'closing',
  ]),
})
export const operationSchema = z.strictObject({
  kind: z.literal('committed'),
  operationId: SettingsIdSchema,
  revision: z.number().int().nonnegative(),
  changed: z.boolean(),
})
export const operationRecordSchema = z.strictObject({
  binding: operationBindingSchema,
  result: operationSchema,
})
export const rejectionSchema = z.strictObject({
  binding: operationBindingSchema,
  failure: failureSchema,
})
export const stateRecordSchema = z.strictObject({
  scope: scopeSchema,
  target: SettingsTargetSchema,
  definitionRef: SettingsDefinitionRefSchema,
  state: SettingsStateSchema,
})
export const stateResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('state'),
    definitionRef: SettingsDefinitionRefSchema,
    state: SettingsStateSchema,
  }),
  z.strictObject({ kind: z.literal('absent') }),
  failureSchema,
])
export const changesSchema = z.strictObject({
  kind: z.literal('changes'),
  changes: z.array(
    z.discriminatedUnion('kind', [
      z.strictObject({
        kind: z.literal('value'),
        revision: z.number().int().positive(),
        operationId: z.string(),
        itemId: z.string(),
        sourceId: z.string(),
      }),
      z.strictObject({
        kind: z.literal('rebase'),
        revision: z.number().int().positive(),
        operationId: z.string(),
      }),
    ]),
  ),
  nextRevision: z.number().int().positive().nullable(),
})
export const accessGrantSchema = z.strictObject({
  kind: z.literal('authorized'),
  scope: scopeSchema,
  target: SettingsTargetSchema,
  principalRef: SettingsReferenceSchema,
})
export const readBaseSchema = z.strictObject({
  domain: domainSchema,
  principalRef: SettingsReferenceSchema,
  target: SettingsTargetSchema,
})
export const readRequestSchema = z.discriminatedUnion('kind', [
  readBaseSchema.extend({ kind: z.literal('state') }),
  readBaseSchema.extend({
    kind: z.literal('changes'),
    afterRevision: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER - 1),
    limit: z.number().int().min(1).max(100),
  }),
])
export type Binding = z.infer<typeof bindingSchema>
export type OperationBinding = z.infer<typeof operationBindingSchema>
export type GuardFact = z.infer<typeof guardFactSchema>
export type ReadRequest = z.infer<typeof readRequestSchema>
