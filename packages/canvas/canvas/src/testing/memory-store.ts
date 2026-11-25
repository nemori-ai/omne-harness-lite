import type { CanvasId, Item, ItemId, Pile, PileId, TenantId } from '@omne-harness/canvas-contract'
import { arrangementOf, awayOf, placingOf, type CanvasFacts } from '../facts.ts'
import {
  arrangeBatch,
  lockItems,
  pileItems,
  placeReference,
  scatterPile,
  takeItems,
} from '../scripts.ts'
import type { CanvasStore, StoreAnswer, StoreRead } from '../store.ts'

export type CanvasRecords = Readonly<{
  revision: number
  items: readonly Item[]
  piles: readonly Pile[]
}>

type Held = {
  revision: number
  nextRank: number
  items: Map<ItemId, Item>
  piles: Map<PileId, Pile>
}

/** What every commit from now on does instead of its normal work; null: its normal work. */
export type CommitFault = 'rolled-back' | 'unknown-lost' | 'unknown-applied'

export type MemoryStore = CanvasStore &
  Readonly<{
    /** Puts records in place, as the commits that wrote them would have left them. */
    seed(tenant: TenantId, canvas: CanvasId, records: CanvasRecords): void
    /** Every read from now on answers unavailable, or reads again. */
    failReads(failing: boolean): void
    failCommits(fault: CommitFault | null): void
    /** The facts of one tenant, written as a script writes them: past the domain. */
    facts(tenant: TenantId): CanvasFacts
  }>

const sameReference = (left: Item, right: Item) =>
  left.reference.kind === right.reference.kind && left.reference.ref === right.reference.ref

function factsOver(canvases: Map<CanvasId, Held>): CanvasFacts {
  const held = (canvas: CanvasId): Held => {
    let found = canvases.get(canvas)
    if (found === undefined) {
      found = { revision: 0, nextRank: 1, items: new Map(), piles: new Map() }
      canvases.set(canvas, found)
    }
    return found
  }
  const peek = (canvas: CanvasId) => canvases.get(canvas)
  return {
    revision: canvas => peek(canvas)?.revision ?? 0,
    nextRank: canvas => peek(canvas)?.nextRank ?? 1,
    items: (canvas, state) =>
      [...(peek(canvas)?.items.values() ?? [])].filter(i => i.state === state),
    item: (canvas, id) => peek(canvas)?.items.get(id) ?? null,
    itemOf: (canvas, reference) =>
      [...(peek(canvas)?.items.values() ?? [])].find(
        item => item.reference.kind === reference.kind && item.reference.ref === reference.ref,
      ) ?? null,
    piles: canvas => [...(peek(canvas)?.piles.values() ?? [])],
    setHead(canvas, revision, nextRank) {
      Object.assign(held(canvas), { revision, nextRank })
    },
    putItem(canvas, item) {
      const { items } = held(canvas)
      for (const other of items.values())
        if (other.id !== item.id && sameReference(other, item))
          throw new Error('UNIQUE: one item for one reference on a canvas')
      items.set(item.id, item)
    },
    dropItem: (canvas, id) => void held(canvas).items.delete(id),
    putPile: (canvas, pile) => void held(canvas).piles.set(pile.id, pile),
    dropPile: (canvas, id) => void held(canvas).piles.delete(id),
  }
}

/** A commit runs the SQL store's script on a copy of the tenant's facts and keeps the copy. */
export function createMemoryStore(): MemoryStore {
  const tenants = new Map<TenantId, Map<CanvasId, Held>>()
  let failingReads = false
  let fault: CommitFault | null = null
  const canvasesOf = (tenant: TenantId) => {
    if (!tenants.has(tenant)) tenants.set(tenant, new Map())
    return tenants.get(tenant)!
  }

  async function read<T>(
    tenant: TenantId,
    query: (facts: CanvasFacts) => T,
  ): Promise<StoreRead<T>> {
    if (failingReads) return { kind: 'unavailable' }
    return { kind: 'read', value: structuredClone(query(factsOver(canvasesOf(tenant)))) }
  }

  async function commit<C, T>(
    tenant: TenantId,
    script: (facts: CanvasFacts, command: C) => T,
    command: C,
  ): Promise<StoreAnswer<T>> {
    if (fault === 'rolled-back') return { kind: 'rolled-back' }
    if (fault === 'unknown-lost') return { kind: 'unknown' }
    const working = structuredClone(canvasesOf(tenant))
    let value: T
    try {
      value = script(factsOver(working), structuredClone(command))
    } catch {
      return { kind: 'rolled-back' }
    }
    tenants.set(tenant, working)
    return fault === 'unknown-applied' ? { kind: 'unknown' } : { kind: 'committed', value }
  }

  return {
    seed(tenant, canvas, records) {
      const ranks = records.items.map(item => item.rank)
      canvasesOf(tenant).set(canvas, {
        revision: records.revision,
        nextRank: Math.max(0, ...ranks) + 1,
        items: new Map(structuredClone(records.items).map(item => [item.id, item])),
        piles: new Map(structuredClone(records.piles).map(pile => [pile.id, pile])),
      })
    },
    failReads(next) {
      failingReads = next
    },
    failCommits(next) {
      fault = next
    },
    facts: tenant => factsOver(canvasesOf(tenant)),
    look: (tenant, canvas) => read(tenant, facts => arrangementOf(facts, canvas)),
    away: (tenant, canvas, page) => read(tenant, facts => awayOf(facts, canvas, page)),
    placing: (tenant, canvas, reference) =>
      read(tenant, facts => placingOf(facts, canvas, reference)),
    place: (tenant, command) => commit(tenant, placeReference, command),
    arrange: (tenant, command) => commit(tenant, arrangeBatch, command),
    take: (tenant, command) => commit(tenant, takeItems, command),
    pile: (tenant, command) => commit(tenant, pileItems, command),
    scatter: (tenant, command) => commit(tenant, scatterPile, command),
    lock: (tenant, command) => commit(tenant, lockItems, command),
  }
}
