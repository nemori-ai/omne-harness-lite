import { organizationCodec, tenantCodec } from '@omne-harness/legal-identity'
import { PermissionDefinitionSchema, PermissionOriginSchema } from '@omne-harness/permissions'
import { SettingDefinitionsSchema, SettingsTargetSchema } from '@omne-harness/settings'
import { z } from 'zod'

export const GovernanceIdSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,255}$/)
export const GovernanceDigestSchema = z.string().regex(/^[a-f0-9]{64}$/)
export const GovernanceRevisionSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER - 1)
export const GovernanceTenantRefSchema = z
  .string()
  .max(256)
  .refine(text => {
    const parsed = tenantCodec.parse(text)
    if (!parsed.ok) return false
    const encoded = tenantCodec.encode(parsed.value)
    return encoded.ok && encoded.value === text
  })
const organizationRef = z.string().refine(text => organizationCodec.parse(text).ok)
export const GovernanceVisibilitySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('tenant'), tenantRef: GovernanceTenantRefSchema }),
  z.strictObject({ kind: z.literal('organization'), organizationRef }),
  z.strictObject({ kind: z.literal('public'), publisherRef: GovernanceIdSchema }),
])
export const GovernanceScopeSchema = z.strictObject({
  tenantRef: GovernanceTenantRefSchema,
  deploymentId: GovernanceIdSchema,
  logicalServiceId: GovernanceIdSchema,
  visibility: GovernanceVisibilitySchema,
})
export const GovernanceDefinitionRefSchema = z.strictObject({
  ownerId: GovernanceIdSchema,
  definitionId: GovernanceIdSchema,
  version: GovernanceIdSchema,
  digest: GovernanceDigestSchema,
})
export const EnforcementBindingSchema = z.strictObject({
  capabilityId: GovernanceIdSchema,
  enforcementKey: GovernanceIdSchema,
  implementationRef: GovernanceIdSchema,
  action: GovernanceIdSchema,
  interpretationRef: GovernanceIdSchema,
})
export const GovernanceDefinitionBundleSchema = z.strictObject({
  reference: GovernanceDefinitionRefSchema,
  origin: PermissionOriginSchema,
  settings: z.array(SettingDefinitionsSchema).max(128),
  permissions: z.array(PermissionDefinitionSchema).max(128),
  enforcementBindings: z.array(EnforcementBindingSchema).max(128),
})
export const GovernanceContributionRefSchema = z.strictObject({
  scope: GovernanceScopeSchema,
  contributorId: GovernanceIdSchema,
  generation: GovernanceIdSchema,
  registrationId: GovernanceIdSchema,
})
export const GovernanceContributionCommandSchema = z.strictObject({
  scope: GovernanceScopeSchema,
  contributorId: GovernanceIdSchema,
  generation: GovernanceIdSchema,
  operationId: GovernanceIdSchema,
  declaration: GovernanceDefinitionBundleSchema,
})
export const GovernanceWithdrawalCommandSchema = z.strictObject({
  operationId: GovernanceIdSchema,
  contribution: GovernanceContributionRefSchema,
})
export const GovernanceSelectionSchema = z.strictObject({
  contribution: GovernanceContributionRefSchema,
  selectedTargets: z.array(SettingsTargetSchema).max(128),
})
export const GovernanceCollectionRefSchema = z.strictObject({
  scope: GovernanceScopeSchema,
  declarationRevision: GovernanceRevisionSchema,
  digest: GovernanceDigestSchema,
})
export const GovernanceAdoptionCommandSchema = z.strictObject({
  scope: GovernanceScopeSchema,
  operationId: GovernanceIdSchema,
  expectedAdoptionRevision: GovernanceRevisionSchema,
  expectedDeclarationRevision: GovernanceRevisionSchema,
  collection: GovernanceCollectionRefSchema,
  complete: z.array(GovernanceSelectionSchema).max(128),
})
export const GovernanceBasisSchema = z.strictObject({
  scope: GovernanceScopeSchema,
  epoch: GovernanceIdSchema,
  adoptionRevision: GovernanceRevisionSchema,
  declarationRevision: GovernanceRevisionSchema,
  declarationSetDigest: GovernanceDigestSchema,
  selectedDefinitions: z.array(GovernanceDefinitionRefSchema).max(128),
})
export const GovernanceOperationQuerySchema = z.strictObject({
  scope: GovernanceScopeSchema,
  owner: z.enum(['contribute', 'withdraw', 'adopt']),
  operationId: GovernanceIdSchema,
})
export const GovernanceOperationRefSchema = GovernanceOperationQuerySchema.extend({
  principalRef: GovernanceIdSchema,
})
export const GovernanceCatalogRequestSchema = z.strictObject({
  scope: GovernanceScopeSchema,
  mode: z.enum(['management', 'runtime']),
  targets: z.array(SettingsTargetSchema).max(128),
  limit: z.number().int().min(1).max(100),
  cursor: z.string().min(1).max(8192).nullable(),
})
export type GovernanceScope = z.infer<typeof GovernanceScopeSchema>
export type GovernanceDefinitionRef = z.infer<typeof GovernanceDefinitionRefSchema>
export type GovernanceDefinitionBundle = z.infer<typeof GovernanceDefinitionBundleSchema>
export type GovernanceContributionRef = z.infer<typeof GovernanceContributionRefSchema>
export type GovernanceContributionCommand = z.infer<typeof GovernanceContributionCommandSchema>
export type GovernanceWithdrawalCommand = z.infer<typeof GovernanceWithdrawalCommandSchema>
export type GovernanceSelection = z.infer<typeof GovernanceSelectionSchema>
export type GovernanceCollectionRef = z.infer<typeof GovernanceCollectionRefSchema>
export type GovernanceAdoptionCommand = z.infer<typeof GovernanceAdoptionCommandSchema>
export type GovernanceBasis = z.infer<typeof GovernanceBasisSchema>
export type GovernanceOperationQuery = z.infer<typeof GovernanceOperationQuerySchema>
export type GovernanceOperationRef = z.infer<typeof GovernanceOperationRefSchema>
export type GovernanceCatalogRequest = z.infer<typeof GovernanceCatalogRequestSchema>
export type EnforcementBinding = z.infer<typeof EnforcementBindingSchema>
