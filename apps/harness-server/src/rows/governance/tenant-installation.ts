import { createCategoryRegistry } from '@omne-harness/assets'
import { createAssetsLocal } from '@omne-harness/assets-local'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import type { createStandaloneSettingsOwner } from '@omne-harness/settings-local'
import type { ToolRelease } from '../../entry/tool-release.ts'
import { createToolAssetCategory } from './tool-assets.ts'
import { governanceStorageCombinations } from './storage-combinations.ts'
import { installToolGovernance, toolInstallationGrants } from './tool-installation.ts'
import type { TenantGovernanceAssembly } from './tenant-runtime.ts'
import { prepareTenantGovernanceWithSettings } from './tenant-settings.ts'

export type InstalledTenantOptions = Parameters<typeof prepareTenantGovernanceWithSettings>[0] & {
  installationPrincipal: ActingForTenantPrincipal
  release: Extract<ToolRelease, { kind: 'trusted' }>
  organizationTargets: ReturnType<typeof createStandaloneSettingsOwner>
}

export function prepareInstalledTenantGovernance(input: InstalledTenantOptions) {
  const options = {
    ...input,
    scope: structuredClone(input.scope),
    domain: structuredClone(input.domain),
  }
  const categories = createCategoryRegistry()
  categories.register(createToolAssetCategory(options.release))
  const assets = createAssetsLocal({
    ...governanceStorageCombinations(options.materials).assets,
    domain: options.domain,
    storage: options.storage,
    categories,
  })
  const assembly = prepareTenantGovernanceWithSettings({
    ...options,
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
  async function open(): ReturnType<TenantGovernanceAssembly['open']> {
    const runtime = await assembly.open()
    if (runtime.kind !== 'created') {
      await assets.close()
      return runtime
    }
    const closeRuntime = runtime.close
    async function close() {
      const result = await closeRuntime()
      if (result.kind === 'closed') await assets.close()
      return result
    }
    let installed = false
    try {
      installed =
        (
          await installToolGovernance({
            principal: options.installationPrincipal,
            scope: options.scope,
            epoch: runtime.epoch,
            release: options.release,
            service: runtime.service,
            assets,
            organizationTargets: options.organizationTargets,
          })
        ).kind === 'installed'
    } catch {
      installed = false
    } finally {
      if (!installed) await close()
    }
    return installed
      ? { ...runtime, close }
      : {
          kind: 'unavailable',
          owner: 'harness.tenant-governance',
          phase: 'installation',
          close,
        }
  }
  let opening: ReturnType<typeof open> | undefined
  return { ...assembly, open: () => (opening ??= open()) }
}
