import {
  capabilityId,
  scopeOfLayer,
  type AssetEntry,
  type AssetLayerSource,
  type CapabilityId,
  type HeldHolding,
  type HeldItem,
  type HeldPort,
} from '@omne-harness/assets'
import { candidates, list, type Placed, type Registry } from '@omne-harness/dynamis'
import type { AssetCategoriesService } from '@omne-harness/assets-cordis-contract/cordis'
import { tenantListing, type AssetsLocal } from '@omne-harness/assets-local'
import { registrySources } from './registry-sources.ts'

type Categories = Pick<AssetCategoriesService, 'held' | 'holdingsOf' | 'view' | 'official'>

export type HeldNames = Readonly<{ at: Registry; names: ReadonlyMap<string, string> }>

export type HeldOnRegistry = Readonly<{
  /** The port the assets of one tenant tell what they hold. The tenant is the one whose assets are opened. */
  heldOf(tenant: string): HeldPort
  /** The layers of one tenant, read back from the registry once its assets are opened. */
  sourcesOf(
    open: (tenantRef: string) => Promise<AssetsLocal | undefined>,
  ): (tenantRef: string) => readonly AssetLayerSource[]
  /** The registry changed: when the categories differ, every tenant is told again what it holds. */
  registryChanged(): void
  namesOf(tenantRef: string, category: string): HeldNames | undefined
  placed(category: string, tenantRef: string): readonly AssetEntry[]
}>

type Kept = {
  place(holdings: readonly HeldHolding[]): void
  last: readonly HeldHolding[] | undefined
  /** The categories whose holdings found no point at the last telling: they read as unavailable, not as none. */
  waiting: Set<string>
  stale: boolean
  names: Map<string, HeldNames>
}

/** A definition a plugin placed for this tenant, a directory or a value of the plugin's package, as the ledger would list it. */
function placedEntry(
  category: string,
  tenant: string,
  entry: Placed<HeldItem>,
): readonly AssetEntry[] {
  const { scope, item } = entry
  const capability = capabilityId(category, entry.key)
  const inside = item.within !== undefined || item.valueAt !== undefined
  if (!inside || scope[0] !== 'tenant' || scope[1] !== tenant || !capability.ok) return []
  const { asset, version, from } = item
  return [
    {
      capability: capability.id,
      layer: 'tenant',
      asset,
      version,
      selection: 'pinned',
      enabled: !item.disabled,
      ...(from === undefined ? {} : { from }),
    },
  ]
}

function namesIn(point: string, at: Registry, entries: readonly Placed<HeldItem>[]): HeldNames {
  const under = new Map<string, string[]>()
  for (const { key, scope, item } of entries) {
    const held = under.get(key) ?? []
    held.push(JSON.stringify([scope, item]))
    under.set(key, held)
  }
  const names = new Map<string, string>()
  for (const [key, held] of under) names.set(key, JSON.stringify([point, held.sort()]))
  return { at, names }
}

/** Puts what each tenant holds on the registry and reads it back; what could not be put reads as unavailable. */
export function heldOnRegistry(
  categories: () => Categories,
  warn: (message: string) => void,
  registry: () => Registry | undefined = () => undefined,
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
  const toldOf = (tenant: string, category: string): Kept | undefined => {
    const state = kept.get(tenant)
    return state === undefined || state.stale || state.waiting.has(category) ? undefined : state
  }
  const pointOf = (
    category: string,
  ): Readonly<{ registry: Registry; point: string }> | undefined => {
    const listing = categories().view.describe(category)
    const now = registry()
    return now === undefined || listing === undefined || !('point' in listing)
      ? undefined
      : { registry: now, point: listing.point }
  }
  const placedOf = (category: string, ref: string): readonly AssetEntry[] => {
    const at = pointOf(category)
    if (at === undefined) return []
    const read = list<HeldItem>(at.registry, at.point, null, scopeOfLayer('tenant', ref))
    if (read.kind !== 'read') return []
    return read.items.flatMap(({ entry }) => placedEntry(category, ref, entry))
  }
  return {
    placed: placedOf,
    heldOf(tenant) {
      const state: Kept = {
        place: categories().holdingsOf(tenant, ({ category, name }) => {
          state.waiting.add(category)
          warn(`tenant ${tenant}: held ${category}:${name} waits for its category to give a point`)
        }),
        last: undefined,
        waiting: new Set(),
        stale: true,
        names: new Map(),
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
          official: () => categories().official(),
          current: (ref, capability: CapabilityId) =>
            toldOf(ref, capability.category) !== undefined,
          async listing(ref) {
            const assets = await open(ref)
            return assets === undefined ? undefined : tenantListing(assets)
          },
          placed: placedOf,
        },
        tenantRef,
      ),
    namesOf(tenant, category) {
      const state = toldOf(tenant, category)
      const at = pointOf(category)
      if (state === undefined || at === undefined) return undefined
      const last = state.names.get(category)
      if (last?.at === at.registry) return last
      const scope = scopeOfLayer('tenant', tenant)
      const read = candidates<HeldItem>(at.registry, at.point, null, scope)
      if (read.kind !== 'read') return undefined
      const named = namesIn(at.point, at.registry, read.entries)
      state.names.set(category, named)
      return named
    },
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
