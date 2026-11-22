import {
  heldLayerSource,
  type AssetLayerSource,
  type CapabilityId,
  type HeldReading,
} from '@omne-harness/assets'

type TenantListing = AssetLayerSource['list']

export type RegistrySourcePorts = Readonly<{
  /** What one tenant sees on the point of a category under one name. */
  held(capability: CapabilityId, tenantRef: string): HeldReading
  /** Whether everything the tenant holds was told to the registry at its last change. */
  current(tenantRef: string): boolean
  /** The ledger listing of the tenant, once its assets are opened; undefined when they cannot be. */
  listing(tenantRef: string): Promise<TenantListing | undefined>
}>

const UNREAD: HeldReading = Object.freeze({ kind: 'unavailable' })

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
      list: async () => ({ layer: 'official', state: 'not-applicable' }),
    }),
    heldLayerSource({
      layer: 'tenant',
      tenant,
      async read(capability) {
        const opened = await ports.listing(tenant)
        return opened !== undefined && ports.current(tenant)
          ? ports.held(capability, tenant)
          : UNREAD
      },
      async list(request) {
        const listing = await ports.listing(tenant)
        return listing === undefined ? { layer: 'tenant', state: 'unavailable' } : listing(request)
      },
    }),
  ])
}
