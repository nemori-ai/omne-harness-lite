import type { Context } from '@deepseek-ai/cordis'
import type { AssetLayerSource } from '@omne-harness/assets'
import type { AssetsLocal } from '@omne-harness/assets-local'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  RUN_SETTING,
  type RunSetting,
  type TenantExtensionSources,
} from '@omne-harness/loop-extension-contract'
import { ExtensionSourcesService } from '@omne-harness/loop-extension-cordis-contract/cordis'
import { evaluateSettings } from '@omne-harness/settings'
import type { TenantSettingsAccess } from './tenant-runtime.ts'

type SettingsOf = () => Promise<TenantSettingsAccess | undefined>

const UNAVAILABLE: RunSetting = { kind: 'unavailable' }

type TenantInput = Readonly<{
  assets: AssetsLocal
  settings: SettingsOf
  tenantRef: string
  deploymentRef: string
  layers: readonly AssetLayerSource[]
  assetsChanged(listener: () => void): () => void
}>

// The settings of a tenant are asked for when the run setting of a held extension is read, not
// before: a tenant that holds none never opens them. They are watched from before the first read.
function watchedSettings(settingsOf: SettingsOf) {
  const listeners = new Set<() => void>()
  let watched: TenantSettingsAccess | undefined
  let changes = 0
  return {
    listeners,
    watched: () => watched,
    seen: () => changes,
    async now(): Promise<TenantSettingsAccess | undefined> {
      const settings = await settingsOf()
      if (settings === undefined || settings === watched) return settings
      watched = settings
      settings.changes.subscribe(() => {
        if (watched !== settings) return
        changes += 1
        for (const listener of listeners) listener()
      })
      return settings
    },
  }
}

async function runSettingOf(
  settings: TenantSettingsAccess,
  input: Pick<TenantInput, 'tenantRef' | 'deploymentRef'>,
  holdingRef: string,
): Promise<RunSetting> {
  const target = { kind: 'asset' as const, holdingRef, scopeRef: input.tenantRef }
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

type Watching = Readonly<{ settingsWatched(): TenantSettingsAccess | undefined }>

/** What the assets and the settings of one tenant say of its loop extensions. Settings have no revision of the whole tenant: the basis counts the changes this process saw. */
export function tenantExtensionSources(input: TenantInput): TenantExtensionSources & Watching {
  const { assets } = input
  const settings = watchedSettings(input.settings)
  return {
    layers: input.layers,
    settingsWatched: settings.watched,
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
      const current = await settings.now()
      return current === undefined
        ? UNAVAILABLE
        : runSettingOf(current, input, held.holding.holdingRef)
    },
    async basis() {
      const revision = await assets.domainRevision()
      return revision.kind === 'domain'
        ? { assets: String(revision.revision), settings: `seen:${settings.seen()}` }
        : undefined
    },
    changes: {
      subscribe(listener) {
        const leaveAssets = input.assetsChanged(listener)
        settings.listeners.add(listener)
        return () => {
          leaveAssets()
          settings.listeners.delete(listener)
        }
      },
    },
  }
}

type SourcesInput = Readonly<{
  assets(tenantRef: string): Promise<AssetsLocal | undefined>
  settings(tenantRef: string): Promise<TenantSettingsAccess | undefined>
  layers(tenantRef: string): readonly AssetLayerSource[]
  assetsChanged(tenantRef: string, listener: () => void): () => void
  deploymentRef: string
}>

type Kept = Readonly<{ assets: AssetsLocal; sources: TenantExtensionSources & Watching }>

/** The tenant sources of the loop extensions, from the assets of the tenant and, once a run setting was read, the settings of its governance. The same object for as long as both stay. */
export class GovernanceExtensionSources extends ExtensionSourcesService<unknown> {
  private readonly input: SourcesInput
  private readonly known = new Map<string, Kept>()
  constructor(ctx: Context, input: SourcesInput) {
    super(ctx)
    this.input = input
  }
  private async current(tenantRef: string, kept: Kept | undefined, assets: AssetsLocal) {
    if (kept?.assets !== assets) return false
    const watched = kept.sources.settingsWatched()
    return watched === undefined || (await this.input.settings(tenantRef)) === watched
  }
  async of(access: Parameters<ExtensionSourcesService<unknown>['of']>[0]) {
    const tenant = tenantCodec.encode(access.tenant)
    const assets = tenant.ok ? await this.input.assets(tenant.value) : undefined
    if (!tenant.ok || assets === undefined) return undefined
    const kept = this.known.get(tenant.value)
    if (kept !== undefined && (await this.current(tenant.value, kept, assets))) return kept.sources
    const sources = tenantExtensionSources({
      assets,
      settings: () => this.input.settings(tenant.value),
      tenantRef: tenant.value,
      deploymentRef: this.input.deploymentRef,
      layers: this.input.layers(tenant.value),
      assetsChanged: listener => this.input.assetsChanged(tenant.value, listener),
    })
    this.known.set(tenant.value, { assets, sources })
    return sources
  }
}

/** Provides the tenant sources over the assets row and the settings of the governance of each tenant. */
export function provideExtensionSources(
  ctx: Context,
  settingsOf: (tenantRef: string) => Promise<TenantSettingsAccess | undefined>,
  deploymentRef: string,
) {
  return new GovernanceExtensionSources(ctx, {
    assets: tenantRef => ctx.tenantAssets.open(tenantRef),
    settings: settingsOf,
    layers: tenantRef => ctx.tenantAssets.layerSources(tenantRef),
    assetsChanged: (tenantRef, listener) =>
      ctx.assetChanges.subscribe(tenantRef, { changed: listener, closed() {} }),
    deploymentRef,
  })
}
