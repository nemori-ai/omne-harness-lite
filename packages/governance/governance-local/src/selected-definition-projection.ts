import type { FactCommandV2 } from '@omne-harness/sql-contract'
import {
  GovernanceDefinitionBindingSchema,
  type GovernanceDefinitionBinding,
} from './definition-projection.ts'
import { json } from './encoding.ts'

export const GOVERNANCE_SELECTED_DEFINITION = {
  participant: 'governance.selected-definition-projection',
  protocol: 'governance-selected-definition/1',
}
export const governanceSelectedDefinitionFact = {
  key: 'governance.selected-definition',
  protocol: 'governance-selected-definition/1',
}
export function governanceSelectedDefinitionCommand(
  binding: GovernanceDefinitionBinding,
): FactCommandV2 {
  return {
    participant: GOVERNANCE_SELECTED_DEFINITION.participant,
    facts: { binding: json(GovernanceDefinitionBindingSchema.parse(binding)) },
  }
}
