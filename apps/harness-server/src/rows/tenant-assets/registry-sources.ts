import {
  heldLayerSource,
  type AssetEntry,
  type AssetLayerListing,
  type AssetLayerSource,
  type AssetListRequest,
  type AssetPage,
  type CapabilityId,
  type HeldReading,
  type OfficialAsset,
} from '@omne-harness/assets'

type TenantListing = AssetLayerSource['list']

export type RegistrySourcePorts = Readonly<{
  /** What one tenant sees on the point of a category under one name. */
  held(capability: CapabilityId, tenantRef: string): HeldReading
  /** Whether what the tenant holds in the category of this capability is on the registry now. */
  current(tenantRef: string, capability: CapabilityId): boolean
  /** The ledger listing of the tenant, once its assets are opened; undefined when they cannot be. */
  listing(tenantRef: string): Promise<TenantListing | undefined>
  /** What plugins placed on the point of a category for this tenant: definitions the ledger does not hold. */
  placed(category: string, tenantRef: string): readonly AssetEntry[]
  official(): readonly OfficialAsset[] | 'unavailable'
}>

const UNREAD: HeldReading = Object.freeze({ kind: 'unavailable' })

const orderOf = (category: string, name: string): string => JSON.stringify([category, name])

const officialEntry = ({ capability, asset, version }: OfficialAsset): AssetEntry => ({
  capability,
  layer: 'official',
  asset,
  version,
  selection: 'pinned',
  enabled: true,
})

function officialListing(ports: RegistrySourcePorts, request: AssetListRequest): AssetLayerListing {
  let all: readonly OfficialAsset[] | 'unavailable'
  try {
    all = ports.official()
  } catch {
    all = 'unavailable'
  }
  if (all === 'unavailable') return { layer: 'official', state: 'unavailable' }
  const after = request.after ?? ''
  const named = all
    .filter(({ capability }) => capability.category === request.category && capability.name > after)
    .map(officialEntry)
    .sort((left, right) => (left.capability.name < right.capability.name ? -1 : 1))
  const items = named.slice(0, request.limit)
  const next = named.length > items.length ? (items.at(-1)?.capability.name ?? null) : null
  return { layer: 'official', state: 'read', page: { items, next, completeness: 'complete' } }
}

/** A page of the ledger with the placed definitions it does not hold, in the ledger's order; the cursor stays a name. */
export function withPlaced(
  page: AssetPage,
  placed: readonly AssetEntry[],
  request: AssetListRequest,
): AssetPage {
  const keyOf = ({ capability }: AssetEntry) => orderOf(capability.category, capability.name)
  const after = request.after === null ? '' : orderOf(request.category, request.after)
  const last = page.items.at(-1)
  const bound = page.next === null || last === undefined ? undefined : keyOf(last)
  const held = new Set(page.items.map(each => each.capability.name))
  const extra = placed.filter(
    each =>
      each.capability.category === request.category &&
      !held.has(each.capability.name) &&
      keyOf(each) > after &&
      (bound === undefined || keyOf(each) <= bound),
  )
  if (extra.length === 0) return page
  const items = [...page.items, ...extra].sort((left, right) =>
    keyOf(left) < keyOf(right) ? -1 : 1,
  )
  if (items.length <= request.limit) return { ...page, items }
  const kept = items.slice(0, request.limit)
  return { ...page, items: kept, next: kept.at(-1)?.capability.name ?? null }
}

/** The official and the tenant layer of one tenant: candidates from the registry, listing from the ledger. */
export function registrySources(
  ports: RegistrySourcePorts,
  tenant: string,
): readonly AssetLayerSource[] {
  return Object.freeze([
    heldLayerSource({
      layer: 'official',
      tenant,
      read: capability => ports.held(capability, tenant),
      list: async request => officialListing(ports, request),
    }),
    heldLayerSource({
      layer: 'tenant',
      tenant,
      async read(capability) {
        const opened = await ports.listing(tenant)
        const told = opened !== undefined && ports.current(tenant, capability)
        return told ? ports.held(capability, tenant) : UNREAD
      },
      async list(request) {
        const listing = await ports.listing(tenant)
        if (listing === undefined) return { layer: 'tenant', state: 'unavailable' }
        const listed = await listing(request)
        if (listed.state !== 'read') return listed
        return {
          ...listed,
          page: withPlaced(listed.page, ports.placed(request.category, tenant), request),
        }
      },
    }),
  ])
}
