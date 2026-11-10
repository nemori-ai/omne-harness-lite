import { z } from 'zod'
import {
  SettingsDefinitionRefSchema,
  SettingsIdSchema,
  SettingsReferenceSchema,
  SettingsStateSchema,
  SettingsTargetSchema,
} from '@omne-harness/settings'

import { StoredSettingsSourceLayoutSchema } from './source-layout.ts'

export const PARTICIPANT = 'settings.persistence'
export const PROTOCOL = 'settings-sql/1'
export const HANDLER = 'settings.read'
export const RESULT_FACT = { key: 'settings.result', protocol: PROTOCOL }
export const TABLES = ['st_states', 'st_operations', 'st_changes']
export const MIGRATION = { owner: PARTICIPANT, id: 'settings-1' }
export const SOURCE_LAYOUT_MIGRATION = { owner: PARTICIPANT, id: 'settings-source-layout-1' }
export const scopeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('system') }),
  z.strictObject({ kind: z.literal('tenant'), tenant: SettingsReferenceSchema }),
])
export const domainSchema = z.strictObject({
  scope: scopeSchema,
  transactionDomain: SettingsIdSchema,
})
export const operationBindingSchema = z.strictObject({
  domain: domainSchema,
  principalRef: SettingsReferenceSchema,
  target: SettingsTargetSchema,
  operationId: SettingsIdSchema,
  commandDigest: z.string().regex(/^[a-f0-9]{64}$/),
})
/** The actions that each source of a target may take, as the owner of the target grants them. */
export const grantsSchema = z
  .array(
    z.strictObject({
      sourceId: SettingsIdSchema,
      actions: z.array(z.enum(['set', 'clear', 'lock', 'unlock'])).max(4),
    }),
  )
  .max(32)
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
export const stateRecordSchema = z
  .strictObject({
    scope: scopeSchema,
    target: SettingsTargetSchema,
    definitionRef: SettingsDefinitionRefSchema,
    state: SettingsStateSchema,
    sourceLayout: StoredSettingsSourceLayoutSchema,
  })
  .refine(record => {
    const ids =
      record.sourceLayout.kind === 'bound'
        ? record.sourceLayout.sources.map(source => source.sourceId)
        : record.sourceLayout.sourceIds
    return JSON.stringify(ids) === JSON.stringify(record.state.sources.map(source => source.id))
  })
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
export const readRequestSchema = readBaseSchema.extend({
  kind: z.literal('changes'),
  afterRevision: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER - 1),
  limit: z.number().int().min(1).max(100),
})
export type OperationBinding = z.infer<typeof operationBindingSchema>
export type ReadRequest = z.infer<typeof readRequestSchema>
