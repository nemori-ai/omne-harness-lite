import type { CanvasId, Item, Pile, TenantId } from '@omne-harness/canvas-contract'
import { arrangementOf, type CanvasFacts } from '../facts.ts'
import type { CanvasStore, StoreRead } from '../store.ts'

/** One canvas's facts, as a store keeps them. */
export type CanvasRecords = Readonly<{
  revision: number
  items: readonly Item[]
  piles: readonly Pile[]
}>

export type MemoryStore = CanvasStore &
  Readonly<{
    /** Puts records in place, as the commits that wrote them would have left them. */
    seed(tenant: TenantId, canvas: CanvasId, records: CanvasRecords): void
    /** Every read from now on answers unavailable, or reads again. */
    failReads(failing: boolean): void
  }>

const key = (tenant: TenantId, canvas: CanvasId) => JSON.stringify([tenant, canvas])

/** The store in memory. Its reads run the same scripts as the SQL store's. */
export function createMemoryStore(): MemoryStore {
  const canvases = new Map<string, CanvasRecords>()
  let failing = false

  const factsOf = (tenant: TenantId): CanvasFacts => ({
    revision: canvas => canvases.get(key(tenant, canvas))?.revision ?? 0,
    items: (canvas, state) =>
      (canvases.get(key(tenant, canvas))?.items ?? []).filter(item => item.state === state),
    piles: canvas => canvases.get(key(tenant, canvas))?.piles ?? [],
  })

  return {
    seed(tenant, canvas, records) {
      canvases.set(key(tenant, canvas), structuredClone(records))
    },
    failReads(next) {
      failing = next
    },
    async look(tenant, canvas): Promise<StoreRead<ReturnType<typeof arrangementOf>>> {
      if (failing) return { kind: 'unavailable' }
      return { kind: 'read', value: structuredClone(arrangementOf(factsOf(tenant), canvas)) }
    },
  }
}
