import type { CategoryView } from '@omne-harness/assets'
import type { CaptureScope } from '@omne-harness/assets-local'

export type GovernedCapture = () => CaptureScope

/** Every holding is a settings candidate, except those of categories whose contract declares no settings. */
export function governedCapture(
  categories: Pick<CategoryView, 'list' | 'lookup'>,
): GovernedCapture {
  return () => ({
    excluded: categories
      .list()
      .map(listing => listing.category)
      .filter(category => categories.lookup(category)?.settings === undefined),
  })
}

export const NAMED_TARGETS: CaptureScope = Object.freeze({ excluded: Object.freeze([]) })
