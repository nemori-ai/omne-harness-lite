import { createGovernanceCollection } from './collection.ts'
import type {
  GovernanceAdoptionCommand,
  GovernanceSelection,
  GovernanceDefinitionBundle,
} from '@omne-harness/governance-contract'
import type { SettingsTarget } from '@omne-harness/settings'
import { canonical, equal } from './encoding.ts'
import type { Candidate } from './candidates.ts'
import type { AdoptionEvidence } from './adoption-schema.ts'

export type AdoptionMember = Readonly<{ candidate: Candidate; targets: readonly SettingsTarget[] }>
export function selectionDigest(
  command: Pick<GovernanceAdoptionCommand, 'scope' | 'expectedDeclarationRevision'>,
  members: readonly AdoptionMember[],
) {
  return createGovernanceCollection({
    scope: command.scope,
    declarationRevision: command.expectedDeclarationRevision,
    complete: members.map(({ candidate, targets }) => ({
      contribution: candidate.contribution,
      definition: candidate.declaration.reference,
      selectedTargets: targets,
    })),
  }).digest
}
function selectMembers(
  candidates: readonly Candidate[],
  selections: readonly GovernanceSelection[],
) {
  if (candidates.length !== selections.length) return undefined
  const byId = new Map(candidates.map(candidate => [canonical(candidate.contribution), candidate]))
  const seen = new Set<string>()
  const members: AdoptionMember[] = []
  for (const selection of selections) {
    const key = canonical(selection.contribution),
      candidate = byId.get(key)
    if (!candidate || seen.has(key)) return undefined
    const targets = selection.selectedTargets
    if (new Set(targets.map(canonical)).size !== targets.length) return undefined
    seen.add(key)
    members.push({ candidate, targets })
  }
  return members
}
function compatible(members: readonly AdoptionMember[]) {
  const declarations = new Map<string, string>()
  function same(key: unknown, value: unknown) {
    const encoded = canonical(key),
      body = canonical(value),
      previous = declarations.get(encoded)
    declarations.set(encoded, body)
    return previous === undefined || previous === body
  }
  const definitions = new Map(
    members.map(({ candidate }) => [candidate.definitionKey, candidate.declaration]),
  )
  return [...definitions.values()].every(
    d =>
      same(['bundle', d.reference.ownerId, d.reference.definitionId], d) &&
      d.settings.every(s =>
        same(['settings', s.providerId, s.definitionId], { origin: d.origin, definition: s }),
      ) &&
      d.permissions.every(p => same(['permission', p.reference.origin, p.reference.itemId], p)) &&
      d.enforcementBindings.every(b => same(['enforcement', b.capabilityId, b.enforcementKey], b)),
  )
}
export function targetMatches(
  declaration: GovernanceDefinitionBundle,
  target: SettingsTarget,
  facts: ReadonlyMap<string, AdoptionEvidence['targets'][number]>,
) {
  const fact = facts.get(canonical(target))
  return fact !== undefined && fact.enabled && targetHasDefinition(declaration, fact)
}
export function targetHasDefinition(
  declaration: GovernanceDefinitionBundle,
  fact: AdoptionEvidence['targets'][number],
) {
  if (!equal(fact.origin, declaration.origin)) return false
  const definition = declaration.settings.find(
    d =>
      d.providerId === fact.definitionRef.providerId &&
      d.definitionId === fact.definitionRef.definitionId &&
      d.version === fact.definitionRef.version,
  )
  return definition !== undefined && equal(definition, fact.definition)
}
function evidenceMatches(members: readonly AdoptionMember[], evidence: AdoptionEvidence) {
  const targets = new Map(evidence.targets.map(fact => [canonical(fact.target), fact]))
  const requiredTargets = new Set(members.flatMap(member => member.targets.map(canonical)))
  if (targets.size !== evidence.targets.length || targets.size !== requiredTargets.size)
    return false
  const bindings = new Map(
    evidence.enforcementBindings.map(b => [
      canonical([b.capabilityId, b.enforcementKey]),
      canonical(b),
    ]),
  )
  if (bindings.size !== evidence.enforcementBindings.length) return false
  return members.every(
    member =>
      member.targets.every(target =>
        targetMatches(member.candidate.declaration, target, targets),
      ) &&
      member.candidate.declaration.enforcementBindings.every(
        b => bindings.get(canonical([b.capabilityId, b.enforcementKey])) === canonical(b),
      ),
  )
}
export function planAdoption(
  candidates: readonly Candidate[],
  command: GovernanceAdoptionCommand,
  evidence: AdoptionEvidence,
) {
  if (command.complete.reduce((sum, entry) => sum + entry.selectedTargets.length, 0) > 128)
    return { kind: 'limited' as const, resource: 'target-supports' }
  const members = selectMembers(candidates, command.complete)
  if (!members) return { kind: 'conflict' as const, reason: 'selection' as const }
  if (!compatible(members)) return { kind: 'conflict' as const, reason: 'definition' as const }
  if (selectionDigest(command, members) !== command.collection.digest)
    return { kind: 'conflict' as const, reason: 'selection' as const }
  if (!evidenceMatches(members, evidence))
    return { kind: 'unavailable' as const, owner: 'adoption-current' }
  return { kind: 'planned' as const, members }
}
