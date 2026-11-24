import type { CanvasId, Item, Pile } from '@omne-harness/canvas-contract'
import type { Arrangement } from './store.ts'

/** One tenant's facts inside one storage transaction. Synchronous: a script runs to completion in the storage worker. */
export interface CanvasFacts {
  /** The revision of the canvas; 0 while nothing was ever committed to it. */
  revision(canvas: CanvasId): number
  items(canvas: CanvasId, state: Item['state']): readonly Item[]
  piles(canvas: CanvasId): readonly Pile[]
}

const byText = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0)

/** The read of `look`: the items on the sheet from the bottom up, and the piles by their identity. */
export function arrangementOf(facts: CanvasFacts, canvas: CanvasId): Arrangement {
  const items = [...facts.items(canvas, 'on')].sort(
    (left, right) => left.rank - right.rank || byText(left.id, right.id),
  )
  const piles = [...facts.piles(canvas)].sort((left, right) => byText(left.id, right.id))
  return { revision: facts.revision(canvas), items, piles }
}
