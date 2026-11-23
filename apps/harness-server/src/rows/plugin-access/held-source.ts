import type { AssetChanges } from '@omne-harness/assets-cordis-contract/cordis'
import type { PluginSource } from '@omne-harness/plugin-access'
import { heldPlugins, readHeldPart, type HeldPluginPorts } from '@omne-harness/plugin-host-local'
import type { TenantAssetsService } from '../tenant-assets/service.ts'

export type HeldSourcePorts = Readonly<{
  /** The assets of the tenants, taken at each call; nothing when they are not there now. */
  assets(): Pick<TenantAssetsService, 'standing' | 'open' | 'layerSources'> | undefined
  changes(): AssetChanges | undefined
}>

const UNAVAILABLE = Object.freeze({ kind: 'unavailable' as const })
const NOTHING = Object.freeze({ kind: 'read' as const, plugins: [] })

/** The plugins a tenant holds as assets, as a source of plugin/v1. A tenant never registered holds nothing. */
export function createHeldSource(ports: HeldSourcePorts): PluginSource {
  async function held(tenant: string) {
    const assets = ports.assets()
    if (assets === undefined) return UNAVAILABLE
    const standing = await assets.standing(tenant)
    if (standing === 'unregistered') return NOTHING
    if (standing === 'unknown') return UNAVAILABLE
    const reading: HeldPluginPorts = {
      sources: of => assets.layerSources(of),
      async body(of, { asset, version }) {
        const read = await (await assets.open(of))?.readVersion({ assetRef: asset, version })
        return read?.kind === 'version' ? read.version.body : undefined
      },
    }
    const read = await heldPlugins(reading, tenant)
    return read.kind === 'read' ? { ...read, assets } : UNAVAILABLE
  }
  return {
    async list({ tenant }) {
      const now = await held(tenant)
      if (now.kind !== 'read') return UNAVAILABLE
      const offered = now.plugins.map(({ version, manifest, manifestText, files }) => ({
        version,
        manifest,
        manifestText,
        files,
      }))
      return { kind: 'read', offered }
    },
    async read({ tenant }, at) {
      const now = await held(tenant)
      if (now.kind !== 'read') return UNAVAILABLE
      const plugin = now.plugins.find(each => each.name === at.name && each.version === at.version)
      if (plugin === undefined || !('assets' in now)) return { kind: 'absent', what: 'plugin' }
      const file = plugin.files.find(each => each.path === at.path)
      if (file === undefined) return { kind: 'absent', what: 'file' }
      const local = await now.assets.open(tenant)
      if (local === undefined) return UNAVAILABLE
      const { asset: assetRef, version } = plugin.held
      return readHeldPart(local.packages.reader({ assetRef, version }), file, at.offset, at.limit)
    },
    subscribe(tenant, listener) {
      const stop = ports
        .changes()
        ?.subscribe(tenant, { changed: listener, closed: () => undefined })
      return stop ?? (() => undefined)
    },
  }
}
