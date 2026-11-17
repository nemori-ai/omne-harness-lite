import {
  capabilityId,
  type AssetEntry,
  type AssetLayerSource,
  type LayerInput,
} from '@omne-harness/assets'
import type { AssetsListResult, AssetsLocal } from './types.ts'

type Listed = Extract<AssetsListResult, { kind: 'page' }>['items'][number]

const UNAVAILABLE = Object.freeze({ layer: 'tenant', state: 'unavailable' } as const)

export function tenantLayerSource(
  local: Pick<AssetsLocal, 'listHeld' | 'readHeldCapability'>,
): AssetLayerSource {
  return Object.freeze({
    layer: 'tenant',
    async list(request) {
      const read = await local.listHeld(request)
      if (read.kind === 'rejected')
        return read.reason === 'invalid_input' ? { state: 'invalid' } : UNAVAILABLE
      return {
        layer: 'tenant',
        state: 'read',
        page: { items: read.items.map(entryOf), next: read.next, completeness: 'complete' },
      }
    },
    async candidates(capability): Promise<LayerInput> {
      const read = await local.readHeldCapability({ capability })
      if (read.kind === 'rejected') return UNAVAILABLE
      if (read.kind === 'absent' || read.selected === null)
        return { layer: 'tenant', state: 'read', candidates: [] }
      return {
        layer: 'tenant',
        state: 'read',
        candidates: [
          {
            asset: read.holding.assetRef,
            version: read.selected.version,
            disabled: !read.holding.enabled,
            immutable: false,
            replaceLocked: false,
          },
        ],
      }
    },
  } satisfies AssetLayerSource)
}

function entryOf(item: Listed): AssetEntry {
  const capability = capabilityId(item.category, item.name)
  if (!capability.ok) throw new TypeError('A held asset has an incomplete capability')
  return {
    capability: capability.id,
    layer: 'tenant',
    asset: item.assetRef,
    version: item.version,
    selection: item.selection,
    enabled: item.enabled,
  }
}
