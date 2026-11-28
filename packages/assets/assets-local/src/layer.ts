import { capabilityId, type AssetEntry, type AssetLayerSource } from '@omne-harness/assets'
import type { AssetsListResult, AssetsLocal } from './types.ts'

type Listed = Extract<AssetsListResult, { kind: 'page' }>['items'][number]

const UNAVAILABLE = Object.freeze({ layer: 'tenant', state: 'unavailable' } as const)

/** The listing of the tenant layer: what the ledger of one tenant holds in a category. Candidates are read elsewhere. */
export function tenantListing(local: Pick<AssetsLocal, 'listHeld'>): AssetLayerSource['list'] {
  return async request => {
    const read = await local.listHeld(request)
    if (read.kind === 'rejected')
      return read.reason === 'invalid_input' ? { state: 'invalid' } : UNAVAILABLE
    return {
      layer: 'tenant',
      state: 'read',
      page: { items: read.items.map(entryOf), next: read.next, completeness: 'complete' },
    }
  }
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
