import { z } from 'zod'
import { SettingsTargetSchema } from '@omne-harness/settings'
import type { FactCommandV2 } from '@omne-harness/sql-contract'
import { json } from './encoding.ts'
import {
  GovernanceDefinitionBindingSchema,
  GovernanceDefinitionProjectionSchema,
} from './definition-projection.ts'

export const GOVERNANCE_TARGET_PROJECTION = {
  participant: 'governance.target-projection',
  protocol: 'governance-target-projection/1',
}
export const governanceTargetProjectionFact = {
  key: 'governance.target-projection',
  protocol: 'governance-target-projection/1',
}
export const GovernanceTargetBindingSchema = GovernanceDefinitionBindingSchema.extend({
  mode: z.enum(['management', 'runtime']),
  target: SettingsTargetSchema,
})
export const GovernanceTargetProjectionSchema = z.strictObject({
  binding: GovernanceTargetBindingSchema,
  observation: z.union([
    GovernanceDefinitionProjectionSchema.shape.observation,
    z.strictObject({
      kind: z.literal('unavailable'),
      reason: z.literal('selection'),
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
