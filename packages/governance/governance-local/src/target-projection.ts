import { z } from 'zod'
import {
  GovernanceDefinitionBundleSchema,
  GovernanceDefinitionRefSchema,
  GovernanceIdSchema,
  GovernanceRevisionSchema,
  GovernanceDigestSchema,
  GovernanceScopeSchema,
} from '@omne-harness/governance-contract'
import { SettingsTargetSchema } from '@omne-harness/settings'
import type { FactCommandV2 } from '@omne-harness/sql-contract'
import { json } from './encoding.ts'

export const GOVERNANCE_TARGET_PROJECTION = {
  participant: 'governance.target-projection',
  protocol: 'governance-target-projection/1',
}
export const governanceTargetProjectionFact = {
  key: 'governance.target-projection',
  protocol: 'governance-target-projection/1',
}
export const GovernanceTargetBindingSchema = z.strictObject({
  scope: GovernanceScopeSchema,
  epoch: GovernanceIdSchema,
  principalRef: GovernanceIdSchema,
  captureId: GovernanceIdSchema,
  transactionDomain: GovernanceIdSchema,
  mode: z.enum(['management', 'runtime']),
  definition: GovernanceDefinitionRefSchema,
  target: SettingsTargetSchema,
})
export const GovernanceTargetProjectionSchema = z.strictObject({
  binding: GovernanceTargetBindingSchema,
  observation: z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('available'),
      declaration: GovernanceDefinitionBundleSchema,
      declarationRevision: GovernanceRevisionSchema,
      adoptionRevision: GovernanceRevisionSchema,
      declarationSetDigest: GovernanceDigestSchema,
    }),
    z.strictObject({
      kind: z.literal('unavailable'),
      reason: z.enum(['scope', 'definition', 'selection', 'limit']),
    }),
  ]),
})
export type GovernanceTargetBinding = z.infer<typeof GovernanceTargetBindingSchema>
export type GovernanceTargetProjection = z.infer<typeof GovernanceTargetProjectionSchema>

export function governanceTargetProjectionCommand(binding: GovernanceTargetBinding): FactCommandV2 {
  return {
    participant: GOVERNANCE_TARGET_PROJECTION.participant,
    facts: { binding: json(GovernanceTargetBindingSchema.parse(binding)) },
  }
}
