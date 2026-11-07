import { ACTIVATION_PLAN } from './activation-schema.ts'
import { businessOriginal } from './business-plan.ts'
import { boundOperation } from './operation.ts'
import type { ParticipantModule, ParticipantPort } from '@omne-harness/sql-contract/worker'
import { SettingsTargetSchema } from '@omne-harness/settings'
import type {
  GovernanceCatalogItem,
  GovernanceDefinitionBundle,
} from '@omne-harness/governance-contract'
import {
  CATALOG_CURRENT,
  CATALOG_SNAPSHOT,
  catalogCurrentSchema,
  type CatalogBinding,
  type CatalogCurrent,
} from './catalog-schema.ts'
import { readScope } from './scope.ts'
import { readCandidates, type Candidate } from './candidates.ts'
import { canonical, equal, json, scopeKey } from './encoding.ts'
import { targetMatches, targetHasDefinition } from './adoption-plan.ts'
import { catalogPage } from './catalog-page.ts'
const unavailable = () => ({ kind: 'unavailable' as const, owner: 'governance-catalog' })
function selection(port: ParticipantPort, binding: CatalogBinding) {
  const params = [scopeKey(binding.scope), binding.epoch]
  const definitions = port.execute(
    'SELECT registration_id,definition_key FROM gc_member WHERE scope_key=? AND epoch=? ORDER BY definition_key,registration_id LIMIT 129',
    params,
  ).rows
  const targets = port.execute(
    'SELECT definition_key,target_json FROM gc_selected_target WHERE scope_key=? AND epoch=? ORDER BY definition_key,target_key LIMIT 129',
    params,
  ).rows
  if (definitions.length > 128 || targets.length > 128)
    throw new Error('Governance selection budget')
  return {
    definitions: new Set(definitions.map(row => String(row[1]))),
    members: new Set(definitions.map(row => String(row[0]))),
    targets: targets.map(row => ({
      definition: String(row[0]),
      target: SettingsTargetSchema.parse(JSON.parse(String(row[1]))),
    })),
  }
}
function availability(current: CatalogCurrent) {
  const targets = new Map(current.targets.map(target => [canonical(target.target), target]))
  const enforcement = new Map(
    current.enforcementBindings.map(binding => [
      canonical([binding.capabilityId, binding.enforcementKey]),
      canonical(binding),
    ]),
  )
  if (
    targets.size !== current.targets.length ||
    enforcement.size !== current.enforcementBindings.length
  )
    throw new Error('Duplicate governance current fact')
  return (
    declaration: GovernanceDefinitionBundle,
    selected: GovernanceCatalogItem['selectedTargets'],
  ) =>
    !current.unavailableOwners.includes(declaration.reference.ownerId) &&
    selected.every(target => targetMatches(declaration, target, targets)) &&
    declaration.enforcementBindings.every(
      binding =>
        enforcement.get(canonical([binding.capabilityId, binding.enforcementKey])) ===
        canonical(binding),
    )
}
function candidateItem(
  binding: CatalogBinding,
  current: CatalogCurrent,
  candidate: Candidate,
  selected: ReturnType<typeof selection>,
  available: ReturnType<typeof availability>,
): GovernanceCatalogItem | undefined {
  const targets = selected.targets
    .filter(target => target.definition === candidate.definitionKey)
    .map(target => target.target)
  const requested = new Set(binding.request.targets.map(canonical))
  const selectedTargets = requested.size
    ? targets.filter(target => requested.has(canonical(target)))
    : targets
  const relevant =
    binding.request.mode === 'runtime'
      ? selectedTargets
      : current.targets.filter(
          fact =>
            requested.has(canonical(fact.target)) &&
            targetHasDefinition(candidate.declaration, fact),
        )
  if (requested.size && relevant.length === 0) return undefined
  const checkedTargets =
    binding.request.mode === 'runtime'
      ? targets
      : current.targets
          .filter(fact => targetHasDefinition(candidate.declaration, fact))
          .map(fact => fact.target)
  const ready = available(candidate.declaration, checkedTargets)
  if (binding.request.mode === 'runtime' && !ready) return undefined
  return {
    declaration: candidate.declaration,
    contributions: [{ contribution: candidate.contribution, state: 'active' }],
    selectedTargets,
    availability: ready ? 'available' : 'unavailable',
  }
}
function entriesFor(
  binding: CatalogBinding,
  current: CatalogCurrent,
  candidates: readonly Candidate[],
  selected: ReturnType<typeof selection>,
) {
  const available = availability(current)
  const entries = new Map<string, GovernanceCatalogItem>()
  for (const candidate of candidates) {
    if (
      binding.request.mode === 'runtime' &&
      !selected.members.has(candidate.contribution.registrationId)
    )
      continue
    const existing = entries.get(candidate.definitionKey)
    if (existing) {
      entries.set(candidate.definitionKey, {
        ...existing,
        contributions: [
          ...existing.contributions,
          { contribution: candidate.contribution, state: 'active' },
        ],
      })
      continue
    }
    const item = candidateItem(binding, current, candidate, selected, available)
    if (item) entries.set(candidate.definitionKey, item)
  }
  return [...entries]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]) => ({ key, item }))
}
function capture(port: ParticipantPort, binding: CatalogBinding, current: CatalogCurrent) {
  if (
    !equal(binding.scope, binding.request.scope) ||
    !equal(binding, current.binding) ||
    current.epoch !== binding.epoch ||
    current.transactionDomain !== binding.transactionDomain
  )
    return unavailable()
  const scope = readScope(port, binding.scope)
  if (!scope || scope.state !== 'open' || scope.epoch !== binding.epoch) return unavailable()
  const candidates = readCandidates(port, binding.scope, binding.epoch)
  if (candidates.kind !== 'candidates') return candidates
  const selected = selection(port, binding)
  const definitions = new Map(
    candidates.entries
      .filter(candidate => selected.definitions.has(candidate.definitionKey))
      .map(candidate => [candidate.definitionKey, candidate.declaration.reference]),
  )
  const basis = {
    scope: binding.scope,
    epoch: binding.epoch,
    declarationRevision: scope.declarationRevision,
    adoptionRevision: scope.adoptionRevision,
    declarationSetDigest: scope.collectionDigest,
    selectedDefinitions: [...definitions.values()],
  }
  return catalogPage(
    binding,
    current,
    basis,
    entriesFor(binding, current, candidates.entries, selected),
  )
}
export default {
  ...CATALOG_SNAPSHOT,
  execute(facts, port) {
    const original = businessOriginal(port, facts['request'], 'capture')
    if (original.kind === 'observation') {
      port.provideFact(ACTIVATION_PLAN, json(original))
      return { kind: 'participated', response: null }
    }
    const found = boundOperation(port, original.request.binding)
    if (found.kind !== 'found' || !isCatalogCapture(found.record.request))
      throw new Error('Missing capture operation')
    const binding: CatalogBinding = {
      scope: original.request.binding.ref.scope,
      principalRef: original.request.binding.ref.principalRef,
      captureId: original.request.binding.ref.operationId,
      epoch: original.epoch,
      transactionDomain: original.transactionDomain,
      request: found.record.request.command.request,
    }
    const raw = port.requireFact(CATALOG_CURRENT)
    if (Buffer.byteLength(canonical(raw)) > 2 * 1024 * 1024)
      throw new Error('Governance current fact budget')
    const current = catalogCurrentSchema.parse(raw)
    if (!equal(raw, current)) throw new Error('Non-canonical governance current fact')
    port.provideFact(
      ACTIVATION_PLAN,
      json({ ...original, kind: 'capture', result: capture(port, binding, current) }),
    )
    return { kind: 'participated', response: null }
  },
} satisfies ParticipantModule
import { isCatalogCapture } from './operation-schema.ts'
