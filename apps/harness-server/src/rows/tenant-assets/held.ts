import type { AssetLayerSource, CapabilityId, HeldHolding, HeldPort } from '@omne-harness/assets'
import type { AssetCategoriesService } from '@omne-harness/assets-cordis-contract/cordis'
import { tenantListing, type AssetsLocal } from '@omne-harness/assets-local'
import { registrySources } from './registry-sources.ts'

type Categories = Pick<AssetCategoriesService, 'held' | 'holdingsOf' | 'view'>

export type HeldOnRegistry = Readonly<{
  /** The port the assets of one tenant tell what they hold. The tenant is the one whose assets are opened. */
  heldOf(tenant: string): HeldPort
  /** The layers of one tenant, read back from the registry once its assets are opened. */
  sourcesOf(
    open: (tenantRef: string) => Promise<AssetsLocal | undefined>,
  ): (tenantRef: string) => readonly AssetLayerSource[]
  /** The registry changed: when the categories differ, every tenant is told again what it holds. */
  registryChanged(): void
}>

type Kept = {
  place(holdings: readonly HeldHolding[]): void
  last: readonly HeldHolding[] | undefined
  /** The categories whose holdings found no point at the last telling: they read as unavailable, not as none. */
  waiting: Set<string>
  stale: boolean
}

/** Puts what each tenant holds on the registry and reads it back; what could not be put reads as unavailable. */
export function heldOnRegistry(
  categories: () => Categories,
  warn: (message: string) => void,
): HeldOnRegistry {
  const kept = new Map<string, Kept>()
  let points = ''
  const tell = (tenant: string, state: Kept, holdings: readonly HeldHolding[]): void => {
    state.stale = true
    state.waiting.clear()
    state.last = holdings
    try {
      state.place(holdings)
      state.stale = false
    } catch (error) {
      warn(`tenant ${tenant}: what it holds was not put on the registry: ${String(error)}`)
      throw error
    }
  }
  return {
    heldOf(tenant) {
      const state: Kept = {
        place: categories().holdingsOf(tenant, ({ category, name }) => {
          state.waiting.add(category)
          warn(`tenant ${tenant}: held ${category}:${name} waits for its category to give a point`)
        }),
        last: undefined,
        waiting: new Set(),
        stale: true,
      }
      kept.set(tenant, state)
      return {
        sync: holdings => tell(tenant, state, holdings),
        missed(reason) {
          state.stale = true
          warn(`tenant ${tenant}: what it holds was not told to the registry: ${reason}`)
        },
      }
    },
    sourcesOf: open => tenantRef =>
      registrySources(
        {
          held: (capability, ref) => categories().held(capability, ref),
          current(ref, capability: CapabilityId) {
            const state = kept.get(ref)
            return state !== undefined && !state.stale && !state.waiting.has(capability.category)
          },
          async listing(ref) {
            const assets = await open(ref)
            return assets === undefined ? undefined : tenantListing(assets)
          },
        },
        tenantRef,
      ),
    registryChanged() {
      const now = JSON.stringify(
        categories()
          .view.list()
          .map(({ category, point }) => [category, point]),
      )
      if (now === points) return
      points = now
      for (const [tenant, state] of kept) {
        if (state.last === undefined) continue
        try {
          tell(tenant, state, state.last)
        } catch {
          continue
        }
      }
    },
  }
}
