import type { HeldHolding, HeldItem, HeldScope } from '@omne-harness/assets'
import type { Entry } from '@omne-harness/dynamis'

export const assetCategoriesKey = 'assetCategories'
export const assetPublishingKey = 'assetPublishing'
export const assetManagementKey = 'assetManagement'
export const assetChangesKey = 'assetChanges'
export const independentSettingsKey = 'independentSettings'

/** The point on the server's tree whose keys are the category names; its keys are public. */
export const ASSET_CATEGORIES_POINT = 'assets.categories'

/** One held definition as an entry on the point of its category. The digest is the item, so two that hold the same are one. */
export function heldEntry(
  point: string,
  name: string,
  scope: HeldScope,
  held: HeldItem,
): Entry<HeldItem> {
  const { asset, version, disabled, immutable, replaceLocked } = held
  const item = Object.freeze({ asset, version, disabled, immutable, replaceLocked })
  const digest = JSON.stringify([asset, version, disabled, immutable, replaceLocked])
  return { point, key: name, id: '', scope, rank: 0, digest, item }
}

export type HeldPlacing = Readonly<{
  /** Puts one entry and gives what takes it back. */
  put(entry: Entry<HeldItem>): () => unknown
  /** The point of a category that gives a contract now; undefined for any other. */
  pointOf(category: string): string | undefined
  scope: HeldScope
  skipped(holding: HeldHolding): void
}>

/** Keeps the entries of one scope equal to what is held: each call is given all of it, and changes only what differs. */
export function createHeldSync(placing: HeldPlacing): (holdings: readonly HeldHolding[]) => void {
  const placed = new Map<string, Readonly<{ digest: string; take: () => unknown }>>()
  return holdings => {
    const wanted = new Map<string, Entry<HeldItem>>()
    for (const holding of holdings) {
      const point = placing.pointOf(holding.category)
      if (point === undefined) placing.skipped(holding)
      else
        wanted.set(
          JSON.stringify([point, holding.name]),
          heldEntry(point, holding.name, placing.scope, holding.item),
        )
    }
    for (const [spot, held] of placed) {
      if (wanted.get(spot)?.digest === held.digest) continue
      placed.delete(spot)
      held.take()
    }
    for (const [spot, entry] of wanted)
      if (!placed.has(spot)) placed.set(spot, { digest: entry.digest, take: placing.put(entry) })
  }
}
