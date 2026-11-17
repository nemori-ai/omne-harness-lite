import type { CategoryView } from '@omne-harness/assets'
import type { CaptureScope } from '@omne-harness/assets-local'

export type GovernedCapture = () => CaptureScope

export function governedCapture(categories: Pick<CategoryView, 'list' | 'lookup'>): GovernedCapture {
  return () => ({
    categories: categories
      .list()
      .map(listing => listing.category)
      .filter(category => categories.lookup(category)?.settings !== undefined),
  })
}

/** A capture that names its targets, or reads the runtime view, scans no category. */
export const NAMED_TARGETS: CaptureScope = Object.freeze({ categories: Object.freeze([]) })
