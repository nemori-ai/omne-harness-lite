import type { CategoryView } from '@omne-harness/assets'
import type { AssetsLocal } from '@omne-harness/assets-local'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import type { SettingDefinitions, createSettingsRegistry } from '@omne-harness/settings'
import { createStandaloneSettingsOwner } from '@omne-harness/settings-local'
import type { ToolRelease } from '../../entry/tool-release.ts'
import { governedCapture } from './governed-capture.ts'
import { heldDefinitionsOf } from './held-definitions.ts'
import { independentTargetsOf } from './independent-settings.ts'
import { governanceStorageCombinations } from './storage-combinations.ts'
import { installToolGovernance, toolInstallationGrants } from './tool-installation.ts'
import type {
  TenantAssetsAccess,
  TenantGovernanceAssembly,
  TenantSettingsAccess,
} from './tenant-runtime.ts'
import { prepareTenantGovernanceWithSettings } from './tenant-settings.ts'

export type InstalledTenantOptions = Omit<
  Parameters<typeof prepareTenantGovernanceWithSettings>[0],
  'capture'
> & {
  installationPrincipal: ActingForTenantPrincipal
  release: Extract<ToolRelease, { kind: 'trusted' }>
  organizationTargets: ReturnType<typeof createStandaloneSettingsOwner>
  categories: Pick<CategoryView, 'list' | 'lookup'>
  tenantAssets(): Promise<AssetsLocal | undefined>
  independentSettings(): readonly SettingDefinitions[]
  /** The registry the catalog reads: the definitions of held versions are registered in it before a read. */
  registry: ReturnType<typeof createSettingsRegistry>
}

export function prepareInstalledTenantGovernance(input: InstalledTenantOptions) {
  const options = {
    ...input,
    scope: structuredClone(input.scope),
    domain: structuredClone(input.domain),
  }
  const assembly = prepareTenantGovernanceWithSettings({
    ...options,
    capture: governedCapture(options.categories),
    permissionRelease: () => options.release,
    grants: [
      ...options.grants,
      ...toolInstallationGrants({
        principal: options.installationPrincipal,
        scope: options.scope,
        release: options.release,
      }),
    ],
  })
  const { participants: _participants, ...targetsRegistration } = governanceStorageCombinations(
    options.materials,
  ).independentTargets
  const targetsOwner = createStandaloneSettingsOwner({
    storage: options.storage,
    domain: options.domain,
    ...targetsRegistration,
  })
  const independentTargets = independentTargetsOf(targetsOwner, options.scope.tenantRef)
  async function open(): ReturnType<TenantGovernanceAssembly['open']> {
    const runtime = await assembly.open()
    if (runtime.kind !== 'created') {
      await targetsOwner.close()
      return runtime
    }
    const closeRuntime = runtime.close
    async function close() {
      const result = await closeRuntime()
      if (result.kind === 'closed') await targetsOwner.close()
      return result
    }
    let fault: string | undefined
    try {
      const assets = await options.tenantAssets()
      if (assets === undefined) throw new Error('the local assets of the tenant are unavailable')
      const installed = await installToolGovernance({
        principal: options.installationPrincipal,
        scope: options.scope,
        epoch: runtime.epoch,
        release: options.release,
        service: runtime.service,
        assets,
        organizationTargets: options.organizationTargets,
      })
      fault = installed.kind === 'installed' ? undefined : `tool installation ${installed.phase}`
    } catch {
      fault = 'tool installation threw'
    } finally {
      if (fault !== undefined) await close()
    }
    return fault === undefined
      ? { ...runtime, close }
      : {
          kind: 'unavailable',
          owner: 'harness.tenant-governance',
          phase: 'installation',
          reason: fault,
          close,
        }
  }
  let opening: ReturnType<typeof open> | undefined
  const holdings: TenantAssetsAccess = {
    async readHolding(input) {
      const assets = await options.tenantAssets()
      return assets === undefined
        ? { kind: 'rejected', reason: 'unavailable' }
        : assets.readHolding(input)
    },
  }
  const heldDefinitions = heldDefinitionsOf(options)
  const readSettings: TenantSettingsAccess['read'] = async request => {
    await independentTargets.ensure(options.independentSettings())
    await heldDefinitions.ensure(await options.tenantAssets())
    return assembly.readSettings(request)
  }
  return {
    ...assembly,
    readSettings,
    settings: { ...assembly.settings, read: readSettings },
    assets: holdings,
    open: () => (opening ??= open()),
  }
}
