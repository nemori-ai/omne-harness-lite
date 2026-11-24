import type { CategoryView } from '@omne-harness/assets'
import type { AssetsLocal } from '@omne-harness/assets-local'
import type { GovernanceDefinitionSource } from '@omne-harness/governance-contract'
import type { GovernanceAdmissionGrant } from '@omne-harness/governance-local'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import { organizationCodec } from '@omne-harness/legal-identity'
import type { SettingDefinitions } from '@omne-harness/settings'
import { createStandaloneSettingsOwner } from '@omne-harness/settings-local'
import type { ReadUnavailableReason } from '@omne-harness/sql-contract'
import type { CategoryGateTemplate } from '../../entry/category-gates.ts'
import type { PermissionDeclaration } from '../../entry/permission-declarations.ts'
import type { ToolRelease } from '../../entry/tool-release.ts'
import { createCategoryCapabilities } from './category-capabilities.ts'
import { governedCapture } from './governed-capture.ts'
import { independentTargetsOf } from './independent-settings.ts'
import { governanceStorageCombinations } from './storage-combinations.ts'
import { GOVERNANCE_PROJECTION_READ } from './storage-materials.ts'
import { installToolGovernance, toolInstallationGrants } from './tool-installation.ts'
import { installReleaseProviders } from './release-provider-installation.ts'
import type { ReleaseProvider } from '../../assets/model-providers.ts'
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
  categoryGates?: readonly CategoryGateTemplate[]
  declarePermission?(declaration: PermissionDeclaration): () => void
  assetsChanged?(listener: () => void): () => void
  installationPrincipal: ActingForTenantPrincipal
  release: Extract<ToolRelease, { kind: 'trusted' }>
  installationConcurrency: number
  organizationTargets: ReturnType<typeof createStandaloneSettingsOwner>
  categories: Pick<CategoryView, 'list' | 'lookup'>
  tenantAssets(): Promise<AssetsLocal | undefined>
  independentSettings(): readonly SettingDefinitions[]
  /** The model providers the release brings; each is installed into the tenant after its tools. */
  releaseProviders?(): readonly ReleaseProvider[]
  warn(message: string): void
}

// A catalog that could not be read names the closed reason the store gave, never its diagnostic.
const faultOf = (phase: string, refusal: ReadUnavailableReason | null): string =>
  `tool installation ${phase}${phase === 'catalog' && refusal !== null ? ` (${refusal})` : ''}`

function eitherSource(
  first: GovernanceDefinitionSource,
  second: GovernanceDefinitionSource,
): GovernanceDefinitionSource {
  return {
    async resolve(identity) {
      const found = await first.resolve(identity)
      return found.kind === 'unavailable' ? second.resolve(identity) : found
    },
  }
}

export function prepareInstalledTenantGovernance(input: InstalledTenantOptions) {
  const options = {
    ...input,
    scope: structuredClone(input.scope),
    domain: structuredClone(input.domain),
  }
  const given = input.grants
  const grants: () => readonly GovernanceAdmissionGrant[] =
    typeof given === 'function' ? given : () => given
  const organization = organizationCodec.encode(options.installationPrincipal.tenant.organization)
  if (!organization.ok) throw new Error('governance organization unavailable')
  const capture = governedCapture(options.categories)
  const capabilities = createCategoryCapabilities({
    templates: options.categoryGates ?? [],
    scope: options.scope,
    domain: options.domain,
    storage: options.storage,
    read: options.materials.readHandlers.find(item => item.handler === GOVERNANCE_PROJECTION_READ),
    capture,
    principal: options.installationPrincipal,
    organizationId: organization.value,
    organizationTargets: options.organizationTargets,
    declare: options.declarePermission ?? (() => () => {}),
    warn: options.warn,
  })
  const { releaseSettings, ...assembly } = prepareTenantGovernanceWithSettings({
    ...options,
    capture,
    permissionRelease: () => options.release,
    definitions: eitherSource(options.definitions, capabilities.definitions),
    grants: () => [
      ...grants(),
      ...toolInstallationGrants({
        principal: options.installationPrincipal,
        scope: options.scope,
        release: options.release,
        owners: capabilities.owners(),
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
    const unsubscribe = options.assetsChanged?.(() => capabilities.changed()) ?? (() => {})
    const closeRuntime = runtime.close
    async function close() {
      unsubscribe()
      capabilities.close()
      await capabilities.settled()
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
        concurrency: options.installationConcurrency,
        service: runtime.service,
        assets,
        organizationTargets: options.organizationTargets,
        releaseSettings,
        warn: options.warn,
        adoptCollection: tools =>
          capabilities.open({ epoch: runtime.epoch, service: runtime.service, tools }),
      })
      fault =
        installed.kind === 'installed' ? undefined : faultOf(installed.phase, runtime.readRefusal())
      if (fault === undefined && options.releaseProviders !== undefined)
        await installReleaseProviders({
          owner: assets,
          tenantRef: options.scope.tenantRef,
          providers: options.releaseProviders(),
          warn: options.warn,
        })
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
  const readSettings: TenantSettingsAccess['read'] = async request => {
    await independentTargets.ensure(options.independentSettings())
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
