import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { GovernanceDefinitionBindingSchema } from './definition-projection.ts'
import {
  GOVERNANCE_SELECTED_DEFINITION,
  governanceSelectedDefinitionFact,
} from './selected-definition-projection.ts'
import { readCurrentDefinition } from './current-definition.ts'
import { definitionKey, scopeKey, json } from './encoding.ts'

export default {
  ...GOVERNANCE_SELECTED_DEFINITION,
  execute(facts, port) {
    const binding = GovernanceDefinitionBindingSchema.parse(facts['binding'])
    const selected = port.execute(
      'SELECT epoch FROM gc_selected_definition WHERE scope_key=? AND definition_key=? LIMIT 1',
      [scopeKey(binding.scope), definitionKey(binding.definition)],
    ).rows[0]
    const observation =
      selected?.[0] === binding.epoch
        ? readCurrentDefinition(port, binding)
        : { kind: 'unavailable' as const, reason: 'definition' as const }
    const result = json({ binding, observation })
    port.provideFact(governanceSelectedDefinitionFact, result)
    return { kind: 'participated', response: result }
  },
} satisfies ParticipantModule
