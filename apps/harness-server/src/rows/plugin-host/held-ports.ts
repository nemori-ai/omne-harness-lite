import type { HeldPluginPorts } from '@omne-harness/plugin-host-local'
import type { TenantAssetsService } from '../tenant-assets/service.ts'

/** What a tenant holds as plugins, read through its assets: the layers, and the body of a version. */
export const heldPluginPorts = (
  assets: Pick<TenantAssetsService, 'open' | 'layerSources'>,
): HeldPluginPorts => ({
  sources: tenant => assets.layerSources(tenant),
  async body(tenant, { asset, version }) {
    const read = await (await assets.open(tenant))?.readVersion({ assetRef: asset, version })
    return read?.kind === 'version' ? read.version.body : undefined
  },
})
