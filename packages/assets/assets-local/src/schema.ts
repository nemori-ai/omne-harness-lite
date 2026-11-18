import { z } from 'zod'
import { MAX_ASSET_PAGE } from '@omne-harness/assets'
import { bodySchema } from './body.ts'
import {
  SettingDefinitionsSchema,
  SettingsDefinitionRefSchema,
  SettingsIdSchema,
  SettingsReferenceSchema,
  SettingsSourceIdentitiesSchema,
} from '@omne-harness/settings'
import {
  SettingsProjectionBindingSchema,
  SettingsTargetProjectionSchema,
} from '@omne-harness/settings-local'

export const PARTICIPANT = 'assets.settings'
export const PROTOCOL = 'assets-local/1'
export const HANDLER = 'assets.read'
export const LIST_HANDLER = 'assets.list'
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
    enabled: z.boolean(),
    selection: selectionSchema,
    sourceLayout: SettingsSourceIdentitiesSchema,
    grants: grantsSchema,
  })
  .refine(holding =>
    holding.grants.every(grant =>
      holding.sourceLayout.some(source => source.sourceId === grant.sourceId),
    ),
  )
export const publishMetadataSchema = z.strictObject({
  operationId: SettingsIdSchema,
  assetRef: SettingsReferenceSchema,
  expectedRevision: revisionSchema,
})
const publishedFields = {
  category: SettingsIdSchema,
  name: SettingsIdSchema,
  version: SettingsIdSchema,
  source: SettingsReferenceSchema,
  body: bodySchema,
  declaration: declarationSchema,
}
export const publishSchema = publishMetadataSchema.extend({
  kind: z.literal('publish'),
  ...publishedFields,
})
export const publishedHoldingSchema = z
  .strictObject({
    holdingRef: SettingsReferenceSchema,
    scopeRef: SettingsReferenceSchema,
    sources: SettingsSourceIdentitiesSchema,
    grants: grantsSchema,
  })
  .refine(holding =>
    holding.grants.every(grant =>
      holding.sources.some(source => source.sourceId === grant.sourceId),
    ),
  )
export const publishAndHoldSchema = publishMetadataSchema.extend({
  kind: z.literal('publishAndHold'),
  ...publishedFields,
  holding: publishedHoldingSchema,
})
export const holdSchema = z
  .strictObject({
    operationId: SettingsIdSchema,
    holdingRef: SettingsReferenceSchema,
    scopeRef: SettingsReferenceSchema,
    assetRef: SettingsReferenceSchema,
    selection: selectionSchema,
    sources: SettingsSourceIdentitiesSchema,
    grants: grantsSchema,
  })
  .refine(holding =>
    holding.grants.every(grant =>
      holding.sources.some(source => source.sourceId === grant.sourceId),
    ),
  )
export const changeHoldingSchema = z.strictObject({
  operationId: SettingsIdSchema,
  holdingRef: SettingsReferenceSchema,
  scopeRef: SettingsReferenceSchema,
  expectedRevision: revisionSchema,
  change: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('remove') }),
    z.strictObject({ kind: z.literal('setEnabled'), enabled: z.boolean() }),
    z.strictObject({ kind: z.literal('selectVersion'), selection: selectionSchema }),
    z.strictObject({
      kind: z.literal('updateSources'),
      sources: SettingsSourceIdentitiesSchema,
      grants: grantsSchema,
    }),
    z.strictObject({ kind: z.literal('updateGrants'), grants: grantsSchema }),
  ]),
})
export const mutationSchema = z.discriminatedUnion('kind', [
  publishSchema,
  publishAndHoldSchema,
  holdSchema.safeExtend({ kind: z.literal('hold') }),
  changeHoldingSchema.extend({ kind: z.literal('changeHolding') }),
])
export const mutationBindingSchema = z.strictObject({
  domain: domainSchema,
  command: mutationSchema,
})
export const captureExcludedSchema = z.array(z.string().min(1).max(64)).max(16)
export const workerCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('mutate'), binding: mutationBindingSchema }),
  z.strictObject({
    kind: z.literal('capture'),
    binding: SettingsProjectionBindingSchema,
    excluded: captureExcludedSchema,
  }),
  z.strictObject({
    kind: z.literal('capturePublication'),
    binding: SettingsProjectionBindingSchema,
    excluded: captureExcludedSchema,
  }),
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
    'unknown_category',
  ]),
})
export const committedSchema = z.strictObject({
  kind: z.literal('committed'),
  operationId: SettingsIdSchema,
  revision: revisionSchema,
  changed: z.boolean(),
  domainRevision: revisionSchema,
})
export const receiptSchema = z.strictObject({
  binding: mutationBindingSchema,
  result: z.union([committedSchema, failureSchema]),
})
export const holdingLookupSchema = z.strictObject({
  holdingRef: SettingsReferenceSchema,
  scopeRef: SettingsReferenceSchema,
})
export const assetLookupSchema = z.strictObject({ assetRef: SettingsReferenceSchema })
export const assetResultSchema = z.union([
  z.strictObject({ kind: z.literal('asset'), asset: assetSchema }),
  z.strictObject({ kind: z.literal('absent') }),
  failureSchema,
])
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
export const heldCapabilityLookupSchema = z.strictObject({
  category: SettingsIdSchema,
  name: SettingsIdSchema,
})
export const listLookupSchema = z.strictObject({
  category: SettingsIdSchema,
  after: SettingsIdSchema.nullable(),
  limit: z.number().int().min(1).max(MAX_ASSET_PAGE),
})
export const listRequestSchema = z.strictObject({
  kind: z.literal('list'),
  domain: domainSchema,
  lookup: listLookupSchema,
})
export const listedSchema = z.strictObject({
  category: SettingsIdSchema,
  name: SettingsIdSchema,
  assetRef: SettingsReferenceSchema,
  version: SettingsIdSchema,
  selection: z.enum(['follow', 'pinned']),
  enabled: z.boolean(),
})
export const listResultSchema = z.union([
  z.strictObject({
    kind: z.literal('page'),
    items: z.array(listedSchema),
    next: SettingsIdSchema.nullable(),
  }),
  failureSchema,
])
export const readRequestSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('domain'), domain: domainSchema, lookup: z.null() }),
  z.strictObject({ kind: z.literal('asset'), domain: domainSchema, lookup: assetLookupSchema }),
  z.strictObject({ kind: z.literal('holding'), domain: domainSchema, lookup: holdingLookupSchema }),
  z.strictObject({ kind: z.literal('version'), domain: domainSchema, lookup: versionLookupSchema }),
  z.strictObject({
    kind: z.literal('heldCapability'),
    domain: domainSchema,
    lookup: heldCapabilityLookupSchema,
  }),
])
export type Mutation = z.infer<typeof mutationSchema>
export type MutationBinding = z.infer<typeof mutationBindingSchema>
export type Holding = z.infer<typeof holdingSchema>
export type Version = z.infer<typeof versionSchema>
export type Asset = z.infer<typeof assetSchema>
export type Failure = z.infer<typeof failureSchema>
