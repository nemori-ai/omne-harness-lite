import type {
  GovernanceContributionCommand,
  GovernanceWithdrawalCommand,
  GovernanceContributionRef,
} from '@omne-harness/governance-contract'
import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import { definitionKey, digest, scopeKey } from './encoding.ts'
import { saveDefinition, validateBundle } from './definition.ts'
import type { OperationBinding } from './operation-schema.ts'
import { readScope } from './scope.ts'
import { CONTRIBUTION_LIMIT, REVISION_LIMIT } from './revision-budget.ts'
export function collectionDigest(port: ParticipantPort, scope: string, epoch: string) {
  const rows = port.execute(
    "SELECT c.registration_id,c.contributor_id,c.generation,d.owner_id,d.definition_id,d.version,d.digest FROM gc_contribution c JOIN gc_definition d ON d.definition_key=c.definition_key WHERE c.scope_key=? AND c.epoch=? AND c.state='active' ORDER BY c.definition_key,c.registration_id LIMIT 129",
    [scope, epoch],
  ).rows
  if (rows.length > 128) throw new Error('Governance scope lease budget violated')
  return digest(rows)
}
export function registerContribution(
  port: ParticipantPort,
  binding: OperationBinding,
  epoch: string,
  command: GovernanceContributionCommand,
) {
  const checked = validateBundle(command.declaration)
  if (checked.kind !== 'valid') return checked
  const key = scopeKey(command.scope)
  const count = port.execute(
    "SELECT registration_id FROM gc_contribution WHERE scope_key=? AND epoch=? AND state='active' LIMIT 129",
    [key, epoch],
  ).rows.length
  if (count >= CONTRIBUTION_LIMIT) return { kind: 'limited' as const, resource: 'contributions' }
  const active = port.execute(
    "SELECT DISTINCT c.definition_key,d.item_count FROM gc_contribution c JOIN gc_definition d ON d.definition_key=c.definition_key WHERE c.scope_key=? AND c.epoch=? AND c.state='active' LIMIT 129",
    [key, epoch],
  ).rows
  const alreadyActive = active.some(row => row[0] === definitionKey(command.declaration.reference))
  const items =
    active.reduce((sum, row) => sum + Number(row[1]), 0) + (alreadyActive ? 0 : checked.itemCount)
  if (items > 1024) return { kind: 'limited' as const, resource: 'active-items' }
  const saved = saveDefinition(port, command.declaration, checked.itemCount)
  if (saved.kind !== 'stored') return saved
  const registrationId = 'lease/' + digest(binding.ref)
  port.execute("INSERT INTO gc_contribution VALUES (?,?,?,?,?,?,?,'active',?)", [
    key,
    registrationId,
    command.contributorId,
    command.generation,
    epoch,
    binding.ref.principalRef,
    saved.key,
    command.operationId,
  ])
  port.execute(
    'UPDATE gc_scope SET declaration_revision=declaration_revision+1,collection_digest=? WHERE scope_key=?',
    [collectionDigest(port, key, epoch), key],
  )
  const current = readScope(port, command.scope)
  if (!current) throw new Error('Missing governance scope after contribution')
  const contribution: GovernanceContributionRef = {
    scope: command.scope,
    contributorId: command.contributorId,
    generation: command.generation,
    registrationId,
  }
  return {
    kind: 'registered' as const,
    contribution,
    declarationRevision: current.declarationRevision,
    state: 'active' as const,
  }
}
function removeSupport(
  port: ParticipantPort,
  key: string,
  registrationId: string,
  definition: string,
  epoch: string,
) {
  port.execute('DELETE FROM gc_member_target WHERE scope_key=? AND registration_id=?', [
    key,
    registrationId,
  ])
  port.execute('DELETE FROM gc_member WHERE scope_key=? AND registration_id=?', [
    key,
    registrationId,
  ])
  port.execute(
    `DELETE FROM gc_selected_target WHERE scope_key=? AND definition_key=? AND epoch=? AND NOT EXISTS (
    SELECT 1 FROM gc_member_target s WHERE s.scope_key=gc_selected_target.scope_key AND s.epoch=gc_selected_target.epoch AND s.definition_key=gc_selected_target.definition_key AND s.target_key=gc_selected_target.target_key LIMIT 1)`,
    [key, definition, epoch],
  )
  port.execute(
    `DELETE FROM gc_selected_definition WHERE scope_key=? AND definition_key=? AND epoch=? AND NOT EXISTS (
    SELECT 1 FROM gc_member m WHERE m.scope_key=gc_selected_definition.scope_key AND m.epoch=gc_selected_definition.epoch AND m.definition_key=gc_selected_definition.definition_key LIMIT 1)`,
    [key, definition, epoch],
  )
}
export function adoptionDigest(port: ParticipantPort, key: string, epoch: string) {
  const members = port.execute(
    'SELECT registration_id,definition_key FROM gc_member WHERE scope_key=? AND epoch=? ORDER BY definition_key,registration_id LIMIT 129',
    [key, epoch],
  ).rows
  const targets = port.execute(
    'SELECT registration_id,definition_key,target_key FROM gc_member_target WHERE scope_key=? AND epoch=? ORDER BY definition_key,target_key,registration_id LIMIT 129',
    [key, epoch],
  ).rows
  if (members.length > 128 || targets.length > 128)
    throw new Error('Governance adoption budget violated')
  return digest({ members, targets })
}
export function releaseContribution(
  port: ParticipantPort,
  binding: OperationBinding,
  epoch: string,
  command: GovernanceWithdrawalCommand,
) {
  const ref = command.contribution,
    key = scopeKey(ref.scope)
  const row = port.execute(
    'SELECT contributor_id,generation,registrar_ref,definition_key,epoch,state FROM gc_contribution WHERE scope_key=? AND registration_id=? LIMIT 1',
    [key, ref.registrationId],
  ).rows[0]
  if (
    !row ||
    row[0] !== ref.contributorId ||
    row[1] !== ref.generation ||
    row[2] !== binding.ref.principalRef
  )
    return { kind: 'denied' as const }
  const current = readScope(port, ref.scope)
  if (!current) throw new Error('Missing governance scope')
  if (row[5] === 'released' || row[4] !== epoch)
    return {
      kind: 'already-released' as const,
      contribution: ref,
      adoptionRevision: current.adoptionRevision,
    }
  if (current.declarationRevision >= REVISION_LIMIT || current.adoptionRevision >= REVISION_LIMIT)
    return { kind: 'limited' as const, resource: 'revision' }
  removeSupport(port, key, ref.registrationId, String(row[3]), epoch)
  port.execute(
    "UPDATE gc_contribution SET state='released' WHERE scope_key=? AND registration_id=?",
    [key, ref.registrationId],
  )
  port.execute(
    'UPDATE gc_scope SET declaration_revision=declaration_revision+1,adoption_revision=adoption_revision+1,collection_digest=?,adoption_digest=? WHERE scope_key=?',
    [collectionDigest(port, key, epoch), adoptionDigest(port, key, epoch), key],
  )
  return {
    kind: 'released' as const,
    contribution: ref,
    adoptionRevision: current.adoptionRevision + 1,
  }
}
