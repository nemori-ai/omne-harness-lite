import type { SqlMaterialCatalog, SqlStorage } from '@omne-harness/sql-contract'
import type { SettingsProjectionBinding } from '../src/index.ts'
import {
  createSettingsQueries,
  createSettingsCommands,
  createSettingsRegistry,
} from '@omne-harness/settings'
import {
  createSettingsSelections,
  settingsStandaloneMaterials,
  standaloneSettingsProjectionCommand,
  settingsWithoutAssetsMaterials,
  settingsWithoutAssetsProjectionCommand,
  settingsCatalogMaterials,
  createSettingsTargetGuards,
  createSettingsCatalog,
  createSettingsMaintenance,
  createStandaloneSettingsOwner,
} from '../src/index.ts'
import { createIdentityQualifiedSettings } from '../src/identity.ts'
import { openIdentityWorld } from './identity-world.ts'
import { definition } from './world.ts'
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
  const catalogMaterials = [
    settingsStandaloneMaterials({ settingsGuard: false }),
    options.assets?.materials ?? settingsWithoutAssetsMaterials(),
    settingsCatalogMaterials(),
  ]
  const project = (binding: Parameters<typeof standaloneSettingsProjectionCommand>[0]) => [
    standaloneSettingsProjectionCommand(binding),
    (options.assets?.command ?? settingsWithoutAssetsProjectionCommand)(binding),
  ]
  const guards = createSettingsTargetGuards(project)
  const w = await openIdentityWorld({
    authority: {
      guards,
      materials: {
        participants: catalogMaterials.flatMap(m => m.participants),
        migrations: catalogMaterials.flatMap(m => m.migrations),
        readHandlers: catalogMaterials.flatMap(m => m.readHandlers),
      },
    },
  })
  const registry = createSettingsRegistry({ capacity: 16 })
  const registration = registry.registerContribution(definition)
  if (registration.kind !== 'registered') throw new Error('declaration fixture')
  let now = 1000
  const selections = createSettingsSelections({
    deploymentRef: 'test',
    verifier: w.authority.verifier,
    capacity: 16,
    lifetimeMs: 60000,
    clock: { now: () => now },
  })
  const selected = await selections.select(w.principal, [w.change.target])
  if (selected.kind !== 'selected') throw new Error(JSON.stringify(selected))
  const catalog = createSettingsCatalog({
    ...w.terminalOptions,
    storage: options.wrapCatalog?.(w.world.storage) ?? w.world.storage,
    deploymentRef: 'test',
    destination: w.destination,
    verifier: w.authority.verifier,
    reservations: w.identity.reservations,
    required: [],
    registry,
    project,
    clock: { now: () => now },
    cursorLifetimeMs: 60000,
    selection: selections,
  })
  const backend = createIdentityQualifiedSettings({
    destination: w.destination,
    required: [],
    identity: {
      verifier: w.authority.verifier,
      standing: w.identity.standing,
      reservations: w.identity.reservations,
    },
    backend: { ...w.terminalOptions, guards, access: catalog.access },
  })
  const owner = createStandaloneSettingsOwner(w.terminalOptions),
    maintenance = createSettingsMaintenance({
      ...w.terminalOptions,
      project,
      ownerRef: 'deployment',
    })
  const record = {
    target: w.change.target,
    definition,
    sourceIds: ['tenant'],
    grants: [
      {
        sourceId: 'tenant',
        actions: ['set', 'clear', 'lock', 'unlock'] as ('set' | 'clear' | 'lock' | 'unlock')[],
      },
    ],
  }
  const provision = await owner.mutate({
    kind: 'provision',
    operationId: 'initial',
    expectedRevision: null,
    record,
  })
  if (provision.kind !== 'committed') throw new Error(JSON.stringify(provision))
  return {
    ...w,
    catalog,
    selections,
    selectionRef: selected.selectionRef,
    registry,
    registration,
    owner,
    record,
    maintenance,
    service: { queries: createSettingsQueries(catalog), commands: createSettingsCommands(backend) },
    view: { deploymentRef: 'test', mode: 'management' as const, targets: [], selectionRef: null },
    setNow(value: number) {
      now = value
    },
    async close() {
      await backend.close()
      await catalog.close()
      await maintenance.close()
      await owner.close()
      registry.close()
      selections.close()
      await w.close()
    },
  }
}
