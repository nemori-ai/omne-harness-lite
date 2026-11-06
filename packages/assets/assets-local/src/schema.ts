import { z } from 'zod'
import { bodySchema } from './body.ts'
import {
  SettingDefinitionsSchema,
  SettingsDefinitionRefSchema,
  SettingsIdSchema,
  SettingsReferenceSchema,
} from '@omne-harness/settings'
import {
  SettingsProjectionBindingSchema,
  SettingsSqlGuardBindingSchema,
  SettingsTargetProjectionSchema,
} from '@omne-harness/settings-local'

export const PARTICIPANT = 'assets.settings'
export const PROTOCOL = 'assets-local/1'
export const HANDLER = 'assets.read'
export const MIGRATION = { owner: PARTICIPANT, id: 'assets-local-1' }
export const TABLES = ['al_domain', 'al_assets', 'al_versions', 'al_holdings']
export const domainSchema = SettingsProjectionBindingSchema.shape.domain
export const revisionSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER - 1)
export const selectionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('follow') }),
  z.strictObject({ kind: z.literal('pinned'), version: SettingsIdSchema }),
])
export const sourceIdsSchema = SettingsTargetProjectionSchema.shape.sourceIds
export const grantsSchema = SettingsTargetProjectionSchema.shape.grants.refine(
  grants =>
    new Set(grants.map(grant => grant.sourceId)).size === grants.length &&
    grants.every(grant => new Set(grant.actions).size === grant.actions.length),
)
export const declarationSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({
    kind: z.literal('declared'),
    definition: SettingDefinitionsSchema,
    definitionRef: SettingsDefinitionRefSchema,
  }),
])
export const versionSchema = z.strictObject({
  domain: domainSchema,
  assetRef: SettingsReferenceSchema,
  category: SettingsIdSchema,
  name: SettingsIdSchema,
  version: SettingsIdSchema,
  source: SettingsReferenceSchema,
  body: bodySchema,
  declaration: declarationSchema,
  ownerRevision: revisionSchema,
})
export const assetSchema = z.strictObject({
  domain: domainSchema,
  assetRef: SettingsReferenceSchema,
  category: SettingsIdSchema,
  name: SettingsIdSchema,
  latestVersion: SettingsIdSchema,
  revision: revisionSchema,
  ownerRevision: revisionSchema,
})
export const holdingSchema = z
  .strictObject({
    domain: domainSchema,
    holdingRef: SettingsReferenceSchema,
    scopeRef: SettingsReferenceSchema,
    assetRef: SettingsReferenceSchema,
    category: SettingsIdSchema,
    name: SettingsIdSchema,
    revision: revisionSchema,
    ownerRevision: revisionSchema,
    state: z.enum(['held', 'removed']),
    selection: selectionSchema,
    sourceIds: sourceIdsSchema,
    grants: grantsSchema,
  })
  .refine(holding => holding.grants.every(grant => holding.sourceIds.includes(grant.sourceId)))
export const publishMetadataSchema = z.strictObject({
  operationId: SettingsIdSchema,
  assetRef: SettingsReferenceSchema,
  expectedRevision: revisionSchema,
})
export const publishSchema = publishMetadataSchema.extend({
  kind: z.literal('publish'),
  category: SettingsIdSchema,
  name: SettingsIdSchema,
  version: SettingsIdSchema,
  source: SettingsReferenceSchema,
  body: bodySchema,
  declaration: declarationSchema,
})
export const holdSchema = z
  .strictObject({
    operationId: SettingsIdSchema,
    holdingRef: SettingsReferenceSchema,
    scopeRef: SettingsReferenceSchema,
    assetRef: SettingsReferenceSchema,
    selection: selectionSchema,
    sourceIds: sourceIdsSchema,
    grants: grantsSchema,
  })
  .refine(holding => holding.grants.every(grant => holding.sourceIds.includes(grant.sourceId)))
export const changeHoldingSchema = z.strictObject({
  operationId: SettingsIdSchema,
  holdingRef: SettingsReferenceSchema,
  scopeRef: SettingsReferenceSchema,
  expectedRevision: revisionSchema,
  change: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('remove') }),
    z.strictObject({ kind: z.literal('selectVersion'), selection: selectionSchema }),
    z.strictObject({
      kind: z.literal('updateSources'),
      sourceIds: sourceIdsSchema,
      grants: grantsSchema,
    }),
    z.strictObject({ kind: z.literal('updateGrants'), grants: grantsSchema }),
  ]),
})
export const mutationSchema = z.discriminatedUnion('kind', [
  publishSchema,
  holdSchema.safeExtend({ kind: z.literal('hold') }),
  changeHoldingSchema.extend({ kind: z.literal('changeHolding') }),
])
export const mutationBindingSchema = z.strictObject({
  domain: domainSchema,
  command: mutationSchema,
})
export const workerCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('mutate'), binding: mutationBindingSchema }),
  z.strictObject({ kind: z.literal('guard'), binding: SettingsSqlGuardBindingSchema }),
  z.strictObject({ kind: z.literal('capture'), binding: SettingsProjectionBindingSchema }),
])
export const failureSchema = z.strictObject({
  kind: z.literal('rejected'),
  reason: z.enum([
    'invalid_input',
    'limit_exceeded',
    'forbidden',
    'unavailable',
    'revision_conflict',
    'version_conflict',
    'identity_conflict',
    'holding_exists',
    'holding_removed',
    'missing_definition',
    'invalid_selection',
    'operation_conflict',
    'closing',
    'unsupported',
  ]),
})
export const committedSchema = z.strictObject({
  kind: z.literal('committed'),
  operationId: SettingsIdSchema,
  revision: revisionSchema,
  changed: z.boolean(),
})
export const receiptSchema = z.strictObject({
  binding: mutationBindingSchema,
  result: z.union([committedSchema, failureSchema]),
})
export const holdingLookupSchema = z.strictObject({
  holdingRef: SettingsReferenceSchema,
  scopeRef: SettingsReferenceSchema,
})
export const versionLookupSchema = z.strictObject({
  assetRef: SettingsReferenceSchema,
  version: SettingsIdSchema,
})
export const selectedSchema = z.strictObject({
  version: SettingsIdSchema,
  definitionRef: SettingsDefinitionRefSchema.nullable(),
  definition: SettingDefinitionsSchema.nullable(),
  body: bodySchema,
  source: SettingsReferenceSchema,
  ownerRevision: revisionSchema,
})
export const holdingResultSchema = z.union([
  z.strictObject({
    kind: z.literal('holding'),
    holding: holdingSchema,
    selected: selectedSchema.nullable(),
  }),
  z.strictObject({ kind: z.literal('absent') }),
  failureSchema,
])
export const versionResultSchema = z.union([
  z.strictObject({ kind: z.literal('version'), version: versionSchema }),
  z.strictObject({ kind: z.literal('absent') }),
  failureSchema,
])
export const readRequestSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('holding'), domain: domainSchema, lookup: holdingLookupSchema }),
  z.strictObject({ kind: z.literal('version'), domain: domainSchema, lookup: versionLookupSchema }),
])
export type Mutation = z.infer<typeof mutationSchema>
export type MutationBinding = z.infer<typeof mutationBindingSchema>
export type Holding = z.infer<typeof holdingSchema>
export type Version = z.infer<typeof versionSchema>
export type Asset = z.infer<typeof assetSchema>
export type Failure = z.infer<typeof failureSchema>
