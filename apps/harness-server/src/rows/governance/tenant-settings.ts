import { assetsSettingsProjectionCommand } from '@omne-harness/assets-local'
import {
  createSettingsCatalog,
  standaloneSettingsProjectionCommand,
  type SettingsCatalogOptions,
} from '@omne-harness/settings-local'
import { createSettingsCatalogDestination } from '@omne-harness/settings-local/identity'
import { organizationSettingsSource } from './organization-settings.ts'
import { createSessionPermissionSettingsResolver } from './session-permission-settings.ts'
import { governanceStorageCombinations } from './storage-combinations.ts'
import { prepareTenantGovernance, type TenantGovernanceOptions } from './tenant-runtime.ts'

const destination = 'harness.governance.settings-catalog'

/** Application composition; each original owner retains its own state and terminal protocol. */
export function prepareTenantGovernanceWithSettings(
  options: Omit<TenantGovernanceOptions, 'settings'> &
    Pick<SettingsCatalogOptions, 'registry' | 'clock' | 'cursorLifetimeMs'>,
) {
  const { combinationVersion, manifestDigest } = governanceStorageCombinations(
    options.materials,
  ).settingsCatalog
  const coordination = {
    storage: options.storage,
    domain: options.domain,
    combinationVersion,
    manifestDigest,
    destination,
  }
  const catalog = createSettingsCatalog({
    ...coordination,
    deploymentRef: options.scope.deploymentId,
    verifier: options.identity.verifier,
    reservations: options.identity.reservations,
    required: [],
    registry: options.registry,
    clock: options.clock,
    cursorLifetimeMs: options.cursorLifetimeMs,
    project: binding => [
      assetsSettingsProjectionCommand(binding),
      standaloneSettingsProjectionCommand(binding),
    ],
  })
  const settingsDestination = createSettingsCatalogDestination(coordination)
  const readSettings = (request: Parameters<typeof catalog.read>[1]) =>
    catalog.read(options.catalogPrincipal, request)
  const governance = prepareTenantGovernance({
    ...options,
    settings: createSessionPermissionSettingsResolver({
      read: readSettings,
      async organizationSource(input) {
        return organizationSettingsSource(input)
      },
    }),
  })
  async function open() {
    const runtime = await governance.open()
    if (runtime.kind !== 'created') {
      await catalog.close()
      return runtime
    }
    return {
      ...runtime,
      async close() {
        const result = await runtime.close()
        if (result.kind === 'closed') await catalog.close()
        return result
      },
    }
  }
  let opening: ReturnType<typeof open> | undefined
  return {
    readSettings,
    destination: {
      seal: (reservation: Parameters<typeof settingsDestination.seal>[0]) =>
        reservation.binding.owner === 'settings' && reservation.binding.destination === destination
          ? settingsDestination.seal(reservation)
          : governance.destination.seal(reservation),
    },
    sourceDestination: governance.sourceDestination,
    open: () => (opening ??= open()),
  }
}
