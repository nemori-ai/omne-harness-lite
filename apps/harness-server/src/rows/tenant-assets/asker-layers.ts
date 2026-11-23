import type { Context } from '@deepseek-ai/cordis'
import { assetCategoriesKey } from '@omne-harness/assets-cordis-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { workspaceSourcesKey } from '@omne-harness/workspace-cordis-contract/cordis'
import { tenantLayers, turnLayers, type AssetLayers, type WorkspaceLayerPorts } from './layers.ts'
import { tenantAssetsKey } from './service.ts'
import type { Turn } from './turn.ts'

/** Who reads a category: a tenant, and with a turn the workspace as that turn adopted it. */
export type LayerAsker = Readonly<{ tenant: TenantId; turn?: Turn }>

/** The layers of a tenant that has no assets yet: it holds nothing, which is read, not unknown. */
const NOTHING_HELD: AssetLayers = Object.freeze({
  sources: Object.freeze([]),
  body: async () => undefined,
  readerOf: () => {
    throw new Error('a tenant without assets has no package to read')
  },
})

/** The layers an asker reads one category from; undefined while they cannot be read. One place for every category. */
export function askerLayersOf(
  ctx: Context,
  category: string,
): (asker: LayerAsker) => Promise<AssetLayers | undefined> {
  const workspace: WorkspaceLayerPorts = {
    sources: () => ctx.get(workspaceSourcesKey),
    contractOf: name => ctx.get(assetCategoriesKey)?.view.lookup(name),
  }
  return async ({ tenant, turn }) => {
    const encoded = tenantCodec.encode(tenant)
    const service = ctx.get(tenantAssetsKey)
    if (!encoded.ok || service === undefined) return undefined
    const assets = await service.open(encoded.value)
    if (assets === undefined)
      return (await service.standing(encoded.value)) === 'unregistered' ? NOTHING_HELD : undefined
    const held = tenantLayers(assets, service.layerSources(encoded.value), () =>
      workspace.contractOf(category),
    )
    return turn === undefined ? held : turnLayers(held, workspace, turn.access, turn.key)
  }
}
