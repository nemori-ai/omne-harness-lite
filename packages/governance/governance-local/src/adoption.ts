import type { GovernanceAdoptionCommand } from '@omne-harness/governance-contract'
import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import { canonical, digest, equal, scopeKey } from './encoding.ts'
import { readScope } from './scope.ts'
import { readCandidates } from './candidates.ts'
import { planAdoption, type AdoptionMember } from './adoption-plan.ts'
import { adoptionEvidenceSchema, type AdoptionEvidence } from './adoption-schema.ts'
import type { OperationBinding } from './operation-schema.ts'
import { adoptionDigest } from './contribution.ts'

function replaceSelection(
  port: ParticipantPort,
  key: string,
  epoch: string,
  members: readonly AdoptionMember[],
) {
  port.execute('DELETE FROM gc_member_target WHERE scope_key=?', [key])
  port.execute('DELETE FROM gc_member WHERE scope_key=?', [key])
  port.execute('DELETE FROM gc_selected_target WHERE scope_key=?', [key])
  port.execute('DELETE FROM gc_selected_definition WHERE scope_key=?', [key])
  for (const { candidate, targets } of members) {
    const ref = candidate.contribution
    port.execute('INSERT INTO gc_member VALUES (?,?,?,?)', [
      key,
      ref.registrationId,
      candidate.definitionKey,
      epoch,
    ])
    port.execute(
      'INSERT INTO gc_selected_definition VALUES (?,?,?) ON CONFLICT(scope_key,definition_key) DO NOTHING',
      [key, candidate.definitionKey, epoch],
    )
    for (const target of targets) {
      const targetKey = canonical(target)
      port.execute('INSERT INTO gc_member_target VALUES (?,?,?,?,?,?)', [
        key,
        ref.registrationId,
        candidate.definitionKey,
        epoch,
        targetKey,
        canonical(target),
      ])
      port.execute(
        'INSERT INTO gc_selected_target VALUES (?,?,?,?,?,?) ON CONFLICT(scope_key,definition_key,target_key) DO NOTHING',
        [
          key,
          candidate.definitionKey,
          targetKey,
          epoch,
          digest(candidate.declaration.origin),
          canonical(target),
        ],
      )
    }
  }
}
function currentEvidence(
  binding: OperationBinding,
  epoch: string,
  transactionDomain: string,
  raw: AdoptionEvidence | undefined,
) {
  if (raw === undefined) return undefined
  if (Buffer.byteLength(canonical(raw)) > 2 * 1024 * 1024) return undefined
  const parsed = adoptionEvidenceSchema.safeParse(raw)
  if (!parsed.success || !equal(parsed.data, raw)) return undefined
  const evidence = parsed.data
  if (
    !equal(evidence.binding, binding) ||
    evidence.epoch !== epoch ||
    evidence.transactionDomain !== transactionDomain
  )
    return undefined
  return evidence
}
function matchingRevision(
  current: ReturnType<typeof readScope>,
  epoch: string,
  command: GovernanceAdoptionCommand,
) {
  return (
    current !== null &&
    current.epoch === epoch &&
    current.state === 'open' &&
    current.adoptionRevision === command.expectedAdoptionRevision &&
    current.declarationRevision === command.expectedDeclarationRevision &&
    equal(command.scope, command.collection.scope) &&
    command.collection.declarationRevision === current.declarationRevision
  )
}
export function adoptContributions(
  port: ParticipantPort,
  binding: OperationBinding,
  epoch: string,
  transactionDomain: string,
  command: GovernanceAdoptionCommand,
  raw: AdoptionEvidence | undefined,
) {
  const current = readScope(port, command.scope)
  if (!current || !matchingRevision(current, epoch, command))
    return { kind: 'conflict' as const, reason: 'basis' as const }
  const evidence = currentEvidence(binding, epoch, transactionDomain, raw)
  if (!evidence) return { kind: 'unavailable' as const, owner: 'adoption-current' }
  const candidates = readCandidates(port, command.scope, epoch)
  if (candidates.kind !== 'candidates') return candidates
  const plan = planAdoption(candidates.entries, command, evidence)
  if (plan.kind !== 'planned') return plan
  const key = scopeKey(command.scope)
  replaceSelection(port, key, epoch, plan.members)
  port.execute(
    'UPDATE gc_scope SET adoption_revision=adoption_revision+1,adoption_digest=? WHERE scope_key=?',
    [adoptionDigest(port, key, epoch), key],
  )
  const definitions = new Map(
    candidates.entries.map(c => [c.definitionKey, c.declaration.reference]),
  )
  return {
    kind: 'adopted' as const,
    basis: {
      scope: command.scope,
      epoch,
      adoptionRevision: current.adoptionRevision + 1,
      declarationRevision: current.declarationRevision,
      declarationSetDigest: current.collectionDigest,
      selectedDefinitions: [...definitions.values()],
    },
  }
}
