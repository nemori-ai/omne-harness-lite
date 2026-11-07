import { GovernanceDefinitionBundleSchema } from '@omne-harness/governance-contract'
import type { ParticipantModule, ReadPort } from '@omne-harness/sql-contract/worker'
import {
  GOVERNANCE_TARGET_PROJECTION,
  GovernanceTargetBindingSchema,
  governanceTargetProjectionFact,
  type GovernanceTargetBinding,
  type GovernanceTargetProjection,
} from './target-projection.ts'
import { canonical, definitionKey, equal, json, scopeKey } from './encoding.ts'
import { readScope } from './scope.ts'

export const currentTargetDefinitionSql =
  "SELECT length(CAST(d.body_json AS BLOB)) FROM gc_contribution c JOIN gc_definition d ON d.definition_key=c.definition_key WHERE c.scope_key=? AND c.epoch=? AND c.state='active' AND c.definition_key=? LIMIT 1"
export const selectedTargetSql =
  'SELECT target_json FROM gc_selected_target WHERE scope_key=? AND definition_key=? AND target_key=? AND epoch=? LIMIT 1'
const unavailable = (reason: 'scope' | 'definition' | 'selection' | 'limit') => ({
  kind: 'unavailable' as const,
  reason,
})

function declaration(port: ReadPort, binding: GovernanceTargetBinding) {
  const key = definitionKey(binding.definition)
  const size = port.execute(currentTargetDefinitionSql, [
    scopeKey(binding.scope),
    binding.epoch,
    key,
  ]).rows[0]
  if (size === undefined) return unavailable('definition')
  if (Number(size[0]) > 2 * 1024 * 1024) return unavailable('limit')
  const row = port.execute('SELECT body_json FROM gc_definition WHERE definition_key=? LIMIT 1', [
    key,
  ]).rows[0]
  if (row === undefined) throw new Error('Missing current Governance definition')
  const body = GovernanceDefinitionBundleSchema.parse(JSON.parse(String(row[0])))
  if (canonical(body) !== row[0]) throw new Error('Corrupt Governance definition bytes')
  return equal(body.reference, binding.definition)
    ? { kind: 'definition' as const, body }
    : unavailable('definition')
}

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
  const scope = readScope(port, binding.scope)
  if (scope === null || scope.state !== 'open' || scope.epoch !== binding.epoch)
    return unavailable('scope')
  const current = declaration(port, binding)
  if (current.kind !== 'definition') return current
  if (binding.mode === 'runtime' && !selected(port, binding)) return unavailable('selection')
  return {
    kind: 'available',
    declaration: current.body,
    declarationRevision: scope.declarationRevision,
    adoptionRevision: scope.adoptionRevision,
    declarationSetDigest: scope.collectionDigest,
  }
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
