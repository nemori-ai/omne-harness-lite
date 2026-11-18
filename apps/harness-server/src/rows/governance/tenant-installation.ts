import type { CategoryView } from '@omne-harness/assets'
import { createAssetsLocal } from '@omne-harness/assets-local'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import { createStandaloneSettingsOwner } from '@omne-harness/settings-local'
import type { ToolRelease } from '../../entry/tool-release.ts'
import { governedCapture } from './governed-capture.ts'
import { installPreferenceTargets } from './preference-settings.ts'
import { governanceStorageCombinations } from './storage-combinations.ts'
import { installToolGovernance, toolInstallationGrants } from './tool-installation.ts'
import type { TenantAssetsAccess, TenantGovernanceAssembly } from './tenant-runtime.ts'
import { prepareTenantGovernanceWithSettings } from './tenant-settings.ts'

export type InstalledTenantOptions = Omit<
  Parameters<typeof prepareTenantGovernanceWithSettings>[0],
  'capture'
> & {
  installationPrincipal: ActingForTenantPrincipal
  release: Extract<ToolRelease, { kind: 'trusted' }>
  organizationTargets: ReturnType<typeof createStandaloneSettingsOwner>
  categories: Pick<CategoryView, 'list' | 'lookup'>
}

export function prepareInstalledTenantGovernance(input: InstalledTenantOptions) {
  const options = {
    ...input,
    scope: structuredClone(input.scope),
    domain: structuredClone(input.domain),
  }
  const assets = createAssetsLocal({
    ...governanceStorageCombinations(options.materials).assets,
    domain: options.domain,
    storage: options.storage,
    categories: options.categories,
  })
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
  ).preferenceTargets
  const preferenceTargets = createStandaloneSettingsOwner({
    storage: options.storage,
    domain: options.domain,
    ...targetsRegistration,
  })
  async function open(): ReturnType<TenantGovernanceAssembly['open']> {
    const runtime = await assembly.open()
    if (runtime.kind !== 'created') {
      await assets.close()
      await preferenceTargets.close()
      return runtime
    }
    const closeRuntime = runtime.close
    async function close() {
      const result = await closeRuntime()
      if (result.kind === 'closed') {
        await assets.close()
        await preferenceTargets.close()
      }
      return result
    }
    let fault: string | undefined
    try {
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
      if (
        fault === undefined &&
        (await installPreferenceTargets(preferenceTargets, options.scope.tenantRef)) !== 'ready'
      )
        fault = 'preference settings installation unavailable'
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
  const holdings: TenantAssetsAccess = { readHolding: input => assets.readHolding(input) }
  return { ...assembly, assets: holdings, open: () => (opening ??= open()) }
}
