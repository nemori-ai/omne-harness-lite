import {
  layerInputsOf,
  type AssetLayer,
  type AssetLayerInput,
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

const layerOf = (inputs: readonly AssetLayerInput[], layer: AssetLayer): AssetLayerInput =>
  inputs.find(input => input.layer === layer) ?? { layer, state: 'unavailable' }

/** The official and the tenant layer of one tenant: candidates from the registry, listing from the ledger. */
export function registrySources(
  ports: RegistrySourcePorts,
  tenantRef: string,
): readonly AssetLayerSource[] {
  const read = (capability: CapabilityId) =>
    layerInputsOf(ports.held(capability, tenantRef), tenantRef)
  return Object.freeze([
    Object.freeze({
      layer: 'official',
      list: async () => ({ layer: 'official', state: 'not-applicable' }),
      candidates: async capability => layerOf(read(capability), 'official'),
    } satisfies AssetLayerSource),
    Object.freeze({
      layer: 'tenant',
      async list(request) {
        const listing = await ports.listing(tenantRef)
        return listing === undefined ? { layer: 'tenant', state: 'unavailable' } : listing(request)
      },
      async candidates(capability) {
        const opened = await ports.listing(tenantRef)
        if (opened === undefined || !ports.current(tenantRef))
          return { layer: 'tenant', state: 'unavailable' }
        return layerOf(read(capability), 'tenant')
      },
    } satisfies AssetLayerSource),
  ])
}
