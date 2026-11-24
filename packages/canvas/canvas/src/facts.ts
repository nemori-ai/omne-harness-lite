import type {
  AwayPage,
  CanvasId,
  Item,
  ItemId,
  Pile,
  PileId,
  Reference,
} from '@omne-harness/canvas-contract'
import type { Arrangement, Placing } from './store.ts'

/** One tenant's facts inside one storage transaction. Synchronous: a script runs to completion in the storage worker. */
export interface CanvasFacts {
  revision(canvas: CanvasId): number
  nextRank(canvas: CanvasId): number
  items(canvas: CanvasId, state: Item['state']): readonly Item[]
  item(canvas: CanvasId, id: ItemId): Item | null
  itemOf(canvas: CanvasId, reference: Reference): Item | null
  piles(canvas: CanvasId): readonly Pile[]

  setHead(canvas: CanvasId, revision: number, nextRank: number): void
  /** Inserts or replaces by identity. A second item of the same reference is refused. */
  putItem(canvas: CanvasId, item: Item): void
  dropItem(canvas: CanvasId, id: ItemId): void
  putPile(canvas: CanvasId, pile: Pile): void
  dropPile(canvas: CanvasId, id: PileId): void
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

/** The read of `look-away`: taking an item gives it the next rank, so the newest has the highest. */
export function awayOf(
  facts: CanvasFacts,
  canvas: CanvasId,
  page: Readonly<{ limit: number; before?: number | undefined }>,
): AwayPage {
  const newest = [...facts.items(canvas, 'off')]
    .filter(item => page.before === undefined || item.rank < page.before)
    .sort((left, right) => right.rank - left.rank)
  const items = newest.slice(0, page.limit)
  const more = newest.length > page.limit
  return { items, next: more ? items[items.length - 1]!.rank : null }
}

export function placingOf(facts: CanvasFacts, canvas: CanvasId, reference: Reference): Placing {
  return { item: facts.itemOf(canvas, reference), placed: facts.items(canvas, 'on').length }
}
