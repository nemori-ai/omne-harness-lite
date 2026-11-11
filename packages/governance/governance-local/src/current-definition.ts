import { GovernanceDefinitionBundleSchema } from '@omne-harness/governance-contract'
import type { ReadPort } from '@omne-harness/sql-contract/worker'
import type {
  GovernanceDefinitionBinding,
  GovernanceDefinitionProjection,
} from './definition-projection.ts'
import { canonical, definitionKey, equal, scopeKey } from './encoding.ts'
import { readScope } from './scope.ts'

export const currentDefinitionSizeSql =
  "SELECT length(CAST(d.body_json AS BLOB)) FROM gc_contribution c JOIN gc_definition d ON d.definition_key=c.definition_key WHERE c.scope_key=? AND c.epoch=? AND c.state='active' AND c.definition_key=? LIMIT 1"
const unavailable = (reason: 'scope' | 'definition' | 'limit') => ({
  kind: 'unavailable' as const,
  reason,
})

function declaration(port: ReadPort, binding: GovernanceDefinitionBinding) {
  const key = definitionKey(binding.definition)
  const size = port.execute(currentDefinitionSizeSql, [scopeKey(binding.scope), binding.epoch, key])
    .rows[0]
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

export function readCurrentDefinition(
  port: ReadPort,
  binding: GovernanceDefinitionBinding,
): GovernanceDefinitionProjection['observation'] {
  const scope = readScope(port, binding.scope)
  if (scope === null || scope.state !== 'open' || scope.epoch !== binding.epoch)
    return unavailable('scope')
  const current = declaration(port, binding)
  if (current.kind !== 'definition') return current
  return {
    kind: 'available',
    declaration: current.body,
    declarationRevision: scope.declarationRevision,
    adoptionRevision: scope.adoptionRevision,
    declarationSetDigest: scope.collectionDigest,
  }
}
