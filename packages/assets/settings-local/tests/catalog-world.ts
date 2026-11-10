import type { SqlMaterialCatalog, SqlStorage } from '@omne-harness/sql-contract'
import { standingPrincipalRef, type ActingForTenantPrincipal } from '@omne-harness/identity'
import {
  createSettingsQueries,
  createSettingsRegistry,
  type SettingsChange,
  type SettingsRebase,
} from '@omne-harness/settings'
import {
  createSettingsSelections,
  settingsStandaloneMaterials,
  standaloneSettingsProjectionCommand,
  settingsWithoutAssetsMaterials,
  settingsWithoutAssetsProjectionCommand,
  settingsCatalogMaterials,
  createSettingsCatalog,
  type SettingsProjectionBinding,
} from '../src/index.ts'
import { createSettingsCatalogDestination } from '../src/identity.ts'
import { createIdentityQualifiedSettingsPreparation } from '../src/preparation.ts'
import { stored } from './business-world.ts'
import { openIdentityWorld } from './identity-world.ts'
import { openPreparedTargetWorld } from './prepared-target-world.ts'
import { definition } from './world.ts'

/**
 * The real catalog over a real independent target and a real Identity. Reads go through the
 * catalog. Writes and rebases go through the preparation service, whose access source is the
 * catalog and whose current facts follow the real owner record and the stored revision.
 */
export async function openCatalogWorld(
  options: {
    assets?: {
      materials: Pick<SqlMaterialCatalog, 'participants' | 'migrations' | 'readHandlers'>
      command: (
        binding: SettingsProjectionBinding,
      ) => import('@omne-harness/sql-contract').FactCommandV2
    }
    wrapCatalog?: (storage: SqlStorage) => SqlStorage
  } = {},
) {
  const identity = await openIdentityWorld()
  const projections = options.assets?.materials ?? settingsWithoutAssetsMaterials()
  const catalogMaterials = settingsCatalogMaterials()
  const s = await openPreparedTargetWorld({
    actions: ['set', 'clear', 'lock', 'unlock'],
    bound: {
      scopeRef: identity.change.target.scopeRef,
      principalRef: standingPrincipalRef(identity.principal),
    },
    extraMaterials: {
      participants: [...projections.participants, ...catalogMaterials.participants],
      migrations: [...projections.migrations, ...catalogMaterials.migrations],
      readHandlers: [...projections.readHandlers, ...catalogMaterials.readHandlers],
    },
  })
  const project = (binding: Parameters<typeof standaloneSettingsProjectionCommand>[0]) => [
    standaloneSettingsProjectionCommand(binding),
    (options.assets?.command ?? settingsWithoutAssetsProjectionCommand)(binding),
  ]
  const registered = await s.register('catalog', [
    ...new Set([
      ...s.ownerParticipants,
      ...settingsStandaloneMaterials().participants.map(item => item.participant),
      ...projections.participants.map(item => item.participant),
      // `settings.target-guard` gives the guard fact of the direct path; the standalone
      // projection of this world gives the same fact, and the prepared path reads neither.
      ...catalogMaterials.participants
        .map(item => item.participant)
        .filter(name => name !== 'settings.target-guard'),
    ]),
  ])
  const terminalOptions = { storage: s.storage, domain: s.domain, ...registered }
  const catalogDestination = 'settings.preferences.catalog'
  const readDestination = createSettingsCatalogDestination({
    ...terminalOptions,
    destination: catalogDestination,
  })
  const registry = createSettingsRegistry({ capacity: 16 })
  const registration = registry.registerContribution(definition)
  if (registration.kind !== 'registered') throw new Error('declaration fixture')
  let now = 1000
  const selections = createSettingsSelections({
    deploymentRef: 'test',
    verifier: identity.authority.verifier,
    capacity: 16,
    lifetimeMs: 60000,
    clock: { now: () => now },
  })
  const selected = await selections.select(identity.principal, [s.target])
  if (selected.kind !== 'selected') throw new Error(JSON.stringify(selected))
  const catalog = createSettingsCatalog({
    ...terminalOptions,
    storage: options.wrapCatalog?.(s.storage) ?? s.storage,
    deploymentRef: 'test',
    destination: catalogDestination,
    verifier: identity.authority.verifier,
    reservations: identity.identity.reservations,
    required: [],
    registry,
    project,
    clock: { now: () => now },
    cursorLifetimeMs: 60000,
    selection: selections,
  })
  const { standing: _, ...base } = s.options
  const prepared = createIdentityQualifiedSettingsPreparation({
    required: [],
    identity: {
      verifier: identity.authority.verifier,
      standing: identity.identity.standing,
      reservations: identity.identity.reservations,
    },
    backend: {
      ...base,
      access: catalog.access,
      plan: (_principal, input) => base.plan(s.context, input),
      currentCommands: (_principal, input) => base.currentCommands(s.context, input),
      sources: {
        reserve: (_principal, request) => base.sources.reserve(s.context, request),
        settle: base.sources.settle,
      },
    },
  })
  identity.setResolver({
    seal: reservation =>
      reservation.binding.destination === catalogDestination
        ? readDestination.seal(reservation)
        : prepared.control.destination.seal(reservation),
  })
  const provision = await s.provision()
  if (provision.kind !== 'committed') throw new Error(JSON.stringify(provision))
  /** The current facts of the test follow the real owner record and the stored revision. */
  async function followOwner() {
    const found = await s.owner.readTarget(s.target)
    if (found.kind !== 'found') return
    const { projection } = found
    s.updateDefinition(projection.definition)
    s.updateGrants(projection.grants)
    s.updateCurrent(current => ({
      ...current,
      basis: {
        ...current.basis,
        target: s.target,
        definitionRef: projection.definitionRef,
        ownerRevision: projection.ownerRevision,
        sources: projection.sources,
        valueRevision: stored(s.root).state?.state.revision ?? 0,
      },
    }))
  }
  type Prepare = ReturnType<typeof prepared.service.prepareChange>
  async function commit(principal: ActingForTenantPrincipal, requestId: string, prepare: Prepare) {
    const ready = await prepare
    if (ready.kind !== 'prepared') return ready
    return prepared.service.commitChange(principal, {
      requestId: `commit-${requestId}`,
      preparation: ready.preparation,
    })
  }
  return {
    principal: identity.principal,
    authority: identity.authority,
    identity: identity.identity,
    remove: identity.remove,
    change: s.command,
    /** The storage of the settings, its catalog combination and its row counts. */
    world: {
      storage: s.storage,
      domain: s.domain,
      root: s.root,
      combination: registered,
      counts: s.counts,
    },
    /** The service without Identity and its current facts, for a write outside the catalog. */
    fixture: { service: s.service, context: s.context, updateCurrent: s.updateCurrent },
    terminalOptions,
    catalog,
    selections,
    selectionRef: selected.selectionRef,
    registry,
    registration,
    owner: s.owner,
    record: s.record,
    prepared: prepared.service,
    /** One change, prepared and committed on the current owner record and stored revision. */
    async write(principal: ActingForTenantPrincipal, command: SettingsChange) {
      await followOwner()
      return commit(
        principal,
        command.requestId,
        prepared.service.prepareChange(principal, command),
      )
    },
    /** One explicit rebase, prepared and committed the same way. */
    async rebase(command: SettingsRebase, principal = identity.principal) {
      await followOwner()
      return commit(
        principal,
        command.requestId,
        prepared.service.prepareRebase(principal, command),
      )
    },
    service: { queries: createSettingsQueries(catalog) },
    view: { deploymentRef: 'test', mode: 'management' as const, targets: [], selectionRef: null },
    setNow(value: number) {
      now = value
    },
    async close() {
      await prepared.control.close()
      await catalog.close()
      registry.close()
      selections.close()
      await s.close()
      await identity.close()
    },
  }
}
