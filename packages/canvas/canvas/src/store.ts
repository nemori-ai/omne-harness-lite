import type { CanvasId, Item, Pile, TenantId } from '@omne-harness/canvas-contract'

/** A read either returns the facts or says it could not read. It never answers empty instead. */
export type StoreRead<T> = Readonly<{ kind: 'read'; value: T }> | Readonly<{ kind: 'unavailable' }>

/** What the store holds of one canvas: the items on the sheet, every pile, and the revision. */
export type Arrangement = Readonly<{
  revision: number
  items: readonly Item[]
  piles: readonly Pile[]
}>

/** The arrangements of the canvases, in the words of the domain. Every read is of one tenant. */
export interface CanvasStore {
  look(tenant: TenantId, canvas: CanvasId): Promise<StoreRead<Arrangement>>
}
