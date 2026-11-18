import type { Context } from '@deepseek-ai/cordis'
import { tenantLayerSource, type AssetsLocal } from '@omne-harness/assets-local'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  RUN_SETTING,
  type RunSetting,
  type TenantExtensionSources,
} from '@omne-harness/loop-extension-contract'
import { ExtensionSourcesService } from '@omne-harness/loop-extension-cordis-contract/cordis'
import { evaluateSettings } from '@omne-harness/settings'
import type { TenantSettingsAccess } from './tenant-runtime.ts'

type Holdings = Readonly<{ assets: AssetsLocal; settings: TenantSettingsAccess }>

const UNAVAILABLE: RunSetting = { kind: 'unavailable' }

/** What the assets and the settings of one tenant say of its loop extensions. Settings have no revision of the whole tenant: the basis counts the changes this process saw. */
export function tenantExtensionSources(
  input: Holdings &
    Readonly<{
      tenantRef: string
      deploymentRef: string
    }>,
): TenantExtensionSources {
  const { assets, settings, tenantRef } = input
  let settingsChanges = 0
  settings.changes.subscribe(() => {
    settingsChanges += 1
  })
  async function run(holdingRef: string): Promise<RunSetting> {
    const target = { kind: 'asset' as const, holdingRef, scopeRef: tenantRef }
    const basis = await settings.read({
      deploymentRef: input.deploymentRef,
      mode: 'management',
      targets: [target],
      selectionRef: null,
    })
    if ('kind' in basis || basis.completeness !== 'complete') return UNAVAILABLE
    const view = basis.views.find(
      item => item.target.kind === 'asset' && item.target.holdingRef === holdingRef,
    )
    if (view === undefined) return { kind: 'absent' }
    const evaluated = evaluateSettings({ definition: view.definition, sources: view.state.sources })
    if (evaluated.kind !== 'complete') return UNAVAILABLE
    const value = evaluated.entries.find(entry => entry.itemId === RUN_SETTING)?.value
    return value?.kind === 'value' && typeof value.value === 'boolean'
      ? { kind: 'value', value: value.value }
      : { kind: 'absent' }
  }
  return {
    layers: [tenantLayerSource(assets)],
    async body({ asset, version }) {
      const read = await assets.readVersion({ assetRef: asset, version })
      return read.kind === 'version' ? read.version.body : undefined
    },
    async locate({ asset, version }) {
      const found = await assets.packages.locate({ assetRef: asset, version })
      return found.kind === 'local-directory' ? { kind: 'directory', path: found.path } : found
    },
    async run({ capability }) {
      const held = await assets.readHeldCapability({ capability })
      if (held.kind === 'rejected') return UNAVAILABLE
      if (held.kind === 'absent') return { kind: 'absent' }
      return run(held.holding.holdingRef)
    },
    async basis() {
      const revision = await assets.readDomainRevision()
      return revision.kind === 'revision'
        ? { assets: String(revision.revision), settings: `seen:${settingsChanges}` }
        : undefined
    },
    changes: {
      subscribe(listener) {
        const leaveAssets = assets.changes.subscribe(listener)
        const leaveSettings = settings.changes.subscribe(listener)
        return () => {
          leaveAssets()
          leaveSettings()
        }
      },
    },
  }
}

type SourcesInput = Readonly<{
  holdings(tenantRef: string): Promise<Holdings | undefined>
  deploymentRef: string
}>

/** The tenant sources of the loop extensions, from the governance of the tenant. The same object for as long as that governance stays open. */
export class GovernanceExtensionSources extends ExtensionSourcesService<unknown> {
  private readonly input: SourcesInput
  private readonly known = new Map<
    string,
    Readonly<{ holdings: Holdings; sources: TenantExtensionSources }>
  >()
  constructor(ctx: Context, input: SourcesInput) {
    super(ctx)
    this.input = input
  }
  async of(access: Parameters<ExtensionSourcesService<unknown>['of']>[0]) {
    const tenant = tenantCodec.encode(access.tenant)
    const holdings = tenant.ok ? await this.input.holdings(tenant.value) : undefined
    if (!tenant.ok || holdings === undefined) return undefined
    const kept = this.known.get(tenant.value)
    if (kept?.holdings.assets === holdings.assets && kept.holdings.settings === holdings.settings)
      return kept.sources
    const sources = tenantExtensionSources({
      ...holdings,
      tenantRef: tenant.value,
      deploymentRef: this.input.deploymentRef,
    })
    this.known.set(tenant.value, { holdings, sources })
    return sources
  }
}
