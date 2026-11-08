import type { ParticipantModule, ReadPort } from '@omne-harness/sql-contract/worker'
import {
  GOVERNANCE_TARGET_PROJECTION,
  GovernanceTargetBindingSchema,
  governanceTargetProjectionFact,
  type GovernanceTargetBinding,
  type GovernanceTargetProjection,
} from './target-projection.ts'
import { canonical, definitionKey, json, scopeKey } from './encoding.ts'
import { readCurrentDefinition } from './current-definition.ts'

export const selectedTargetSql =
  'SELECT target_json FROM gc_selected_target WHERE scope_key=? AND definition_key=? AND target_key=? AND epoch=? LIMIT 1'
function selected(port: ReadPort, binding: GovernanceTargetBinding) {
  const row = port.execute(selectedTargetSql, [
    scopeKey(binding.scope),
    definitionKey(binding.definition),
    canonical(binding.target),
    binding.epoch,
  ]).rows[0]
  return row !== undefined && row[0] === canonical(binding.target)
}

function observe(
  port: ReadPort,
  binding: GovernanceTargetBinding,
): GovernanceTargetProjection['observation'] {
  const current = readCurrentDefinition(port, binding)
  if (current.kind !== 'available') return current
  if (binding.mode === 'runtime' && !selected(port, binding))
    return { kind: 'unavailable', reason: 'selection' }
  return current
}

export default {
  ...GOVERNANCE_TARGET_PROJECTION,
  execute(facts, port) {
    const binding = GovernanceTargetBindingSchema.parse(facts['binding'])
    const result = json({ binding, observation: observe(port, binding) })
    port.provideFact(governanceTargetProjectionFact, result)
    return { kind: 'participated', response: result }
  },
} satisfies ParticipantModule
