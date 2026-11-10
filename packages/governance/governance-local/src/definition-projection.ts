import { z } from 'zod'
import {
  GovernanceDefinitionBundleSchema,
  GovernanceDefinitionRefSchema,
  GovernanceIdSchema,
  GovernanceRevisionSchema,
  GovernanceDigestSchema,
  GovernanceScopeSchema,
} from '@omne-harness/governance-contract'
import type { FactCommandV2 } from '@omne-harness/sql-contract'
import { json } from './encoding.ts'

export const GOVERNANCE_DEFINITION_PROJECTION = {
  participant: 'governance.definition-projection',
  protocol: 'governance-definition-projection/1',
}
export const governanceDefinitionProjectionFact = {
  key: 'governance.definition-projection',
  protocol: 'governance-definition-projection/1',
}
export const GovernanceDefinitionBindingSchema = z.strictObject({
  scope: GovernanceScopeSchema,
  epoch: GovernanceIdSchema,
  principalRef: GovernanceIdSchema,
  captureId: GovernanceIdSchema,
  transactionDomain: GovernanceIdSchema,
  definition: GovernanceDefinitionRefSchema,
})
export const GovernanceDefinitionProjectionSchema = z.strictObject({
  binding: GovernanceDefinitionBindingSchema,
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
      reason: z.enum(['scope', 'definition', 'limit']),
    }),
  ]),
})
export type GovernanceDefinitionBinding = z.infer<typeof GovernanceDefinitionBindingSchema>
export type GovernanceDefinitionProjection = z.infer<typeof GovernanceDefinitionProjectionSchema>

export function governanceDefinitionProjectionCommand(
  binding: GovernanceDefinitionBinding,
): FactCommandV2 {
  return {
    participant: GOVERNANCE_DEFINITION_PROJECTION.participant,
    facts: { binding: json(GovernanceDefinitionBindingSchema.parse(binding)) },
  }
}
