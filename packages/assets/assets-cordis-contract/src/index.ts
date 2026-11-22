import type { HeldItem, HeldScope } from '@omne-harness/assets'
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
