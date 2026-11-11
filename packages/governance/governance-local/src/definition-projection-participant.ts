import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import {
  GOVERNANCE_DEFINITION_PROJECTION,
  GovernanceDefinitionBindingSchema,
  governanceDefinitionProjectionFact,
} from './definition-projection.ts'
import { json } from './encoding.ts'
import { readCurrentDefinition } from './current-definition.ts'

export default {
  ...GOVERNANCE_DEFINITION_PROJECTION,
  execute(facts, port) {
    const binding = GovernanceDefinitionBindingSchema.parse(facts['binding'])
    const result = json({ binding, observation: readCurrentDefinition(port, binding) })
    port.provideFact(governanceDefinitionProjectionFact, result)
    return { kind: 'participated', response: result }
  },
} satisfies ParticipantModule
