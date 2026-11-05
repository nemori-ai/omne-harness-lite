import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import type { DomainRef } from '@omne-harness/sql-contract'
import { canonical, equal, scopeRef, withinBudget } from './encoding.ts'
import {
  assetKey,
  readAsset,
  readDomain,
  readHolding,
  readVersion,
  selectedVersion,
  validateDeclaration,
} from './records.ts'
import {
  holdingSchema,
  type Holding,
  type Mutation,
  type MutationBinding,
  type Failure,
} from './schema.ts'

function rejected(reason: Failure['reason']): Failure {
  return { kind: 'rejected', reason }
}
function nextRevision(port: ParticipantPort, domain: DomainRef): number {
  const current = readDomain(port)
  const revision = (current?.revision ?? 0) + 1
  if (revision >= Number.MAX_SAFE_INTEGER) throw new RangeError('Assets revision exhausted')
  port.execute(
    'INSERT INTO al_domain (id, record) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET record=excluded.record',
    [canonical({ domain, revision })],
  )
  return revision
}
function publish(
  port: ParticipantPort,
  domain: DomainRef,
  command: Extract<Mutation, { kind: 'publish' }>,
) {
  const current = readAsset(port, domain, command.assetRef)
  const old = readVersion(port, domain, command.assetRef, command.version)
  const value = {
    domain,
    assetRef: command.assetRef,
    category: command.category,
    name: command.name,
    version: command.version,
    source: command.source,
    body: command.body,
    declaration: command.declaration,
  }
  validateDeclaration(value)
  if (old && !equal({ ...old, ownerRevision: 0 }, { ...value, ownerRevision: 0 }))
    return rejected('version_conflict')
  if (current && (current.category !== command.category || current.name !== command.name))
    return rejected('identity_conflict')
  if ((current?.revision ?? 0) !== command.expectedRevision) return rejected('revision_conflict')
  if (old) return { revision: current?.revision ?? 0, changed: false }
  if (current?.revision === Number.MAX_SAFE_INTEGER - 1) return rejected('limit_exceeded')
  if (!withinBudget({ ...value, ownerRevision: Number.MAX_SAFE_INTEGER }))
    return rejected('limit_exceeded')
  const ownerRevision = nextRevision(port, domain)
  port.execute('INSERT INTO al_versions (version_key, record) VALUES (?, ?)', [
    canonical([domain, command.assetRef, command.version]),
    canonical({ ...value, ownerRevision }),
  ])
  const asset = {
    domain,
    assetRef: command.assetRef,
    category: command.category,
    name: command.name,
    latestVersion: command.version,
    revision: (current?.revision ?? 0) + 1,
    ownerRevision,
  }
  port.execute(
    'INSERT INTO al_assets (asset_key, record) VALUES (?, ?) ON CONFLICT(asset_key) DO UPDATE SET record=excluded.record',
    [assetKey(domain, command.assetRef), canonical(asset)],
  )
  return { revision: asset.revision, changed: true }
}
function writeHolding(port: ParticipantPort, holding: Holding) {
  port.execute(
    'INSERT INTO al_holdings (scope_key, holding_ref, asset_ref, capability_key, state, record) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(scope_key, holding_ref) DO UPDATE SET state=excluded.state, record=excluded.record',
    [
      canonical(holding.domain),
      holding.holdingRef,
      holding.assetRef,
      canonical([holding.category, holding.name]),
      holding.state,
      canonical(holding),
    ],
  )
}
function hold(
  port: ParticipantPort,
  domain: DomainRef,
  command: Extract<Mutation, { kind: 'hold' }>,
) {
  if (command.scopeRef !== scopeRef(domain)) return rejected('forbidden')
  const current = readHolding(port, domain, command.holdingRef)
  if (current) return rejected(current.state === 'removed' ? 'holding_removed' : 'holding_exists')
  const asset = readAsset(port, domain, command.assetRef)
  if (!asset) return rejected('missing_definition')
  const occupied = port.execute(
    "SELECT holding_ref FROM al_holdings WHERE scope_key = ? AND capability_key = ? AND state = 'held' LIMIT 1",
    [canonical(domain), canonical([asset.category, asset.name])],
  ).rows[0]
  if (occupied) return rejected('holding_exists')
  const holding = holdingSchema.parse({
    domain,
    holdingRef: command.holdingRef,
    scopeRef: command.scopeRef,
    assetRef: command.assetRef,
    category: asset.category,
    name: asset.name,
    revision: 1,
    ownerRevision: 0,
    state: 'held',
    selection: command.selection,
    sourceIds: command.sourceIds,
    grants: command.grants,
  })
  if (!selectedVersion(port, holding)) return rejected('invalid_selection')
  holding.ownerRevision = nextRevision(port, domain)
  writeHolding(port, holding)
  return { revision: 1, changed: true }
}
function changedHolding(
  holding: Holding,
  change: Extract<Mutation, { kind: 'changeHolding' }>['change'],
): Holding {
  switch (change.kind) {
    case 'remove':
      return { ...holding, state: 'removed' }
    case 'selectVersion':
      return { ...holding, selection: change.selection }
    case 'updateSources':
      return { ...holding, sourceIds: change.sourceIds, grants: change.grants }
    case 'updateGrants':
      return { ...holding, grants: change.grants }
  }
}
function changeHolding(
  port: ParticipantPort,
  domain: DomainRef,
  command: Extract<Mutation, { kind: 'changeHolding' }>,
) {
  if (command.scopeRef !== scopeRef(domain)) return rejected('forbidden')
  const current = readHolding(port, domain, command.holdingRef)
  if (!current) return rejected('missing_definition')
  if (current.revision !== command.expectedRevision) return rejected('revision_conflict')
  if (current.state === 'removed')
    return command.change.kind === 'remove'
      ? { revision: current.revision, changed: false }
      : rejected('holding_removed')
  const next = holdingSchema.safeParse(changedHolding(current, command.change))
  if (!next.success) return rejected('invalid_input')
  if (!selectedVersion(port, next.data)) return rejected('invalid_selection')
  if (equal(current, next.data)) return { revision: current.revision, changed: false }
  if (current.revision === Number.MAX_SAFE_INTEGER - 1) return rejected('limit_exceeded')
  const holding = {
    ...next.data,
    revision: current.revision + 1,
    ownerRevision: nextRevision(port, domain),
  }
  writeHolding(port, holding)
  return { revision: holding.revision, changed: true }
}
export function mutate(port: ParticipantPort, binding: MutationBinding) {
  const { domain, command } = binding
  const current = readDomain(port)
  if (scopeRef(domain) === null || (current && !equal(current.domain, domain)))
    return rejected('forbidden')
  if (current?.revision === Number.MAX_SAFE_INTEGER - 1) return rejected('limit_exceeded')
  const result =
    command.kind === 'publish'
      ? publish(port, domain, command)
      : command.kind === 'hold'
        ? hold(port, domain, command)
        : changeHolding(port, domain, command)
  return 'kind' in result
    ? result
    : { kind: 'committed' as const, operationId: command.operationId, ...result }
}
