import {
  GovernanceDefinitionBundleSchema,
  type GovernanceContributionRef,
  type GovernanceDefinitionBundle,
  type GovernanceScope,
} from '@omne-harness/governance-contract'
import type { ReadPort } from '@omne-harness/sql-contract/worker'
import { canonical, definitionKey, scopeKey } from './encoding.ts'

export type Candidate = Readonly<{
  contribution: GovernanceContributionRef
  definitionKey: string
  declaration: GovernanceDefinitionBundle
}>
export const currentCandidatesSql =
  "SELECT c.registration_id,c.contributor_id,c.generation,c.definition_key,length(CAST(d.body_json AS BLOB)) FROM gc_contribution c JOIN gc_definition d ON d.definition_key=c.definition_key WHERE c.scope_key=? AND c.epoch=? AND c.state='active' ORDER BY c.definition_key,c.registration_id LIMIT 129"

export function readCandidates(port: ReadPort, scope: GovernanceScope, epoch: string) {
  const rows = port.execute(currentCandidatesSql, [scopeKey(scope), epoch]).rows
  if (rows.length > 128) return { kind: 'limited' as const, resource: 'contributions' }
  const sizes = new Map(rows.map(row => [String(row[3]), Number(row[4])]))
  if ([...sizes.values()].reduce((sum, size) => sum + size, 0) > 2 * 1024 * 1024)
    return { kind: 'limited' as const, resource: 'current-declarations' }
  const definitions = new Map<string, GovernanceDefinitionBundle>()
  for (const key of sizes.keys()) {
    const row = port.execute('SELECT body_json FROM gc_definition WHERE definition_key=? LIMIT 1', [
      key,
    ]).rows[0]
    if (!row) throw new Error('Missing current governance declaration')
    const declaration = GovernanceDefinitionBundleSchema.parse(JSON.parse(String(row[0])))
    if (definitionKey(declaration.reference) !== key || canonical(declaration) !== row[0])
      throw new Error('Corrupt current governance declaration')
    definitions.set(key, declaration)
  }
  const entries: Candidate[] = rows.map(row => ({
    contribution: {
      scope,
      registrationId: String(row[0]),
      contributorId: String(row[1]),
      generation: String(row[2]),
    },
    definitionKey: String(row[3]),
    declaration: definitions.get(String(row[3]))!,
  }))
  return { kind: 'candidates' as const, entries }
}
