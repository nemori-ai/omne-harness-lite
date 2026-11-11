import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { SqlMaterialCatalog, SqlStorage } from '@omne-harness/sql-contract'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
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
import { equal } from '../src/encoding.ts'
import {
  SETTINGS_VALUE_PROJECTION,
  SettingsValueProjectionSchema,
  settingsValueProjectionCommand,
} from '../src/value-projection.ts'
import { settingsValueProjectionMaterials } from '../src/value-projection-materials.ts'
import { createIdentityQualifiedSettingsPreparation } from '../src/preparation.ts'
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
  const values = settingsValueProjectionMaterials()
  const s = await openPreparedTargetWorld({
    actions: ['set', 'clear', 'lock', 'unlock'],
    bound: {
      scopeRef: identity.scopeRef,
      principalRef: identity.principalRef,
    },
    extraMaterials: {
      participants: [...projections.participants, ...catalogMaterials.participants, ...values],
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
      ...values.map(item => item.participant),
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
  /** The stored revision of one target; 0 when nothing is stored for it. */
  function storedRevision(target: SettingsChange['target']): number {
    const database = new DatabaseSync(
      join(s.root, 'domains', `${Buffer.from(s.domain.transactionDomain).toString('hex')}.sqlite`),
      { readOnly: true },
    )
    try {
      for (const row of database.prepare('SELECT record FROM st_states').all()) {
        const record = JSON.parse(String(row['record'])) as {
          target: unknown
          state: { revision: number }
        }
        if (equal(record.target, target)) return record.state.revision
      }
      return 0
    } finally {
      database.close()
    }
  }
  /**
   * The current facts of the test follow the real owner of the target: its projection as the real
   * projection participants give it (a standalone or an asset target), and the stored revision.
   */
  async function follow(target: SettingsChange['target']) {
    const binding: SettingsProjectionBinding = {
      domain: s.domain,
      principalRef: s.context.principalRef,
      captureId: randomUUID(),
      request: { deploymentRef: 'test', mode: 'management', targets: [target], selectionRef: null },
    }
    const result = await s.storage.commit({
      identity: {
        ...s.domain,
        operation: 'fixture.catalog-current',
        protocolVersion: '2',
        operationKey: randomUUID(),
      },
      ...registered,
      commands: [...project(binding), settingsValueProjectionCommand(binding)],
    })
    // A target without a current projection (retired, unknown) gets no new facts: the access of
    // the catalog refuses the call.
    if (result.kind !== 'committed') return
    const [view] = SettingsValueProjectionSchema.parse(
      result.responses.find(reply => reply.participant === SETTINGS_VALUE_PROJECTION.participant)
        ?.reply.response,
    ).views
    if (view === undefined) return
    const projection = view.view
    s.updateDefinition(projection.definition)
    s.updateGrants(projection.grants)
    s.updateCurrent(current => ({
      ...current,
      basis: {
        ...current.basis,
        target,
        definitionRef: projection.definitionRef,
        ownerRevision: projection.ownerRevision,
        sources: projection.sources,
        valueRevision: storedRevision(target),
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
      await follow(command.target)
      return commit(
        principal,
        command.requestId,
        prepared.service.prepareChange(principal, command),
      )
    },
    /** One explicit rebase, prepared and committed the same way. */
    async rebase(command: SettingsRebase, principal = identity.principal) {
      await follow(command.target)
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
