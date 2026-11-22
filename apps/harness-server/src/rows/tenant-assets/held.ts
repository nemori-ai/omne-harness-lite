import type { AssetLayerSource, HeldPort } from '@omne-harness/assets'
import type { AssetCategoriesService } from '@omne-harness/assets-cordis-contract/cordis'
import { tenantLayerSource, type AssetsLocal } from '@omne-harness/assets-local'
import { registrySources } from './registry-sources.ts'

type Categories = Pick<AssetCategoriesService, 'held' | 'holdingsOf'>

export type HeldOnRegistry = Readonly<{
  /** The port the assets of one tenant tell what they hold. The tenant is the one whose assets are opened. */
  heldOf(tenant: string): HeldPort
  /** The layers of one tenant, read back from the registry once its assets are opened. */
  sourcesOf(
    open: (tenantRef: string) => Promise<AssetsLocal | undefined>,
  ): (tenantRef: string) => readonly AssetLayerSource[]
}>

/** Puts what each tenant holds on the registry and reads it back; a tenant whose last telling failed reads as unavailable. */
export function heldOnRegistry(
  categories: () => Categories,
  warn: (message: string) => void,
): HeldOnRegistry {
  const stale = new Set<string>()
  return {
    heldOf(tenant) {
      const place = categories().holdingsOf(tenant, ({ category, name }) =>
        warn(`held ${category}:${name} is not on a point: its category gives none`),
      )
      return {
        sync(holdings) {
          stale.add(tenant)
          place(holdings)
          stale.delete(tenant)
        },
        missed(reason) {
          stale.add(tenant)
          warn(`what a tenant holds was not told to the registry: ${reason}`)
        },
      }
    },
    sourcesOf: open => tenantRef =>
      registrySources(
        {
          held: (capability, ref) => categories().held(capability, ref),
          current: ref => !stale.has(ref),
          async listing(ref) {
            const assets = await open(ref)
            return assets === undefined ? undefined : tenantLayerSource(assets).list
          },
        },
        tenantRef,
      ),
  }
}
