import { z } from 'zod'
import {
  GovernanceCatalogRequestSchema,
  GovernanceIdSchema,
  GovernanceScopeSchema,
  GovernanceBasisSchema,
  GovernanceDefinitionBundleSchema,
  GovernanceContributionRefSchema,
} from '@omne-harness/governance-contract'
import { SettingsTargetSchema } from '@omne-harness/settings'
import { adoptionEvidenceSchema } from './adoption-schema.ts'
export const CATALOG_CURRENT = {
  key: 'governance.catalog-current',
  protocol: 'governance-catalog-current/1',
}
export const CATALOG_SNAPSHOT = {
  participant: 'governance.catalog-snapshot',
  protocol: 'governance-catalog-snapshot/1',
}
export const catalogBindingSchema = z.strictObject({
  scope: GovernanceScopeSchema,
  principalRef: GovernanceIdSchema,
  captureId: GovernanceIdSchema,
  epoch: GovernanceIdSchema,
  transactionDomain: GovernanceIdSchema,
  request: GovernanceCatalogRequestSchema,
})
export const catalogCurrentSchema = adoptionEvidenceSchema.omit({ binding: true }).extend({
  binding: catalogBindingSchema,
  unavailableOwners: z.array(GovernanceIdSchema).max(128),
})
export const catalogPageSchema = z.strictObject({
  kind: z.literal('page'),
  items: z
    .array(
      z.strictObject({
        declaration: GovernanceDefinitionBundleSchema,
        contributions: z
          .array(
            z.strictObject({
              contribution: GovernanceContributionRefSchema,
              state: z.enum(['active', 'closing', 'released']),
            }),
          )
          .max(128),
        selectedTargets: z.array(SettingsTargetSchema).max(128),
        availability: z.enum(['available', 'unavailable']),
      }),
    )
    .max(100),
  snapshot: GovernanceBasisSchema,
  completeness: z.enum(['complete', 'partial']),
  unavailableOwners: z.array(GovernanceIdSchema).max(128),
  nextCursor: z.string().max(8192).nullable(),
})
export type CatalogBinding = z.infer<typeof catalogBindingSchema>
export type CatalogCurrent = z.infer<typeof catalogCurrentSchema>
