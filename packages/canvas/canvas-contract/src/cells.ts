import type { ConflictReason } from './answers.ts'
import type { CanvasId, Item, Reference, TenantId } from './values.ts'

/** The state of a reference on a canvas. `loose` and `piled` are unlocked; a locked item is on and loose. */
export type ItemStatus = 'none' | 'loose' | 'piled' | 'away' | 'locked'

export function statusOf(item: Item | null): ItemStatus {
  if (item === null) return 'none'
  if (item.state === 'off') return 'away'
  if (item.locked) return 'locked'
  return item.pile === null ? 'loose' : 'piled'
}

/** What a change of one item does in one state, before its values are compared. */
export type Cell = 'apply' | 'no-change' | 'not-found' | Readonly<{ conflict: ConflictReason }>

export type ItemOperation =
  | 'place'
  | 'move'
  | 'adjust'
  | 'enter'
  | 'leave'
  | 'take'
  | 'pile'
  | 'lock'
  | 'unlock'

const taken = { conflict: 'taken' } as const
const locked = { conflict: 'locked' } as const
const inPile = { conflict: 'in-pile' } as const

/** The total table of the specification, one row per operation. `move` gives a spot; `adjust` sizes or raises. */
export const CELLS: Readonly<Record<ItemOperation, Readonly<Record<ItemStatus, Cell>>>> = {
  place: {
    none: 'apply',
    loose: 'no-change',
    piled: 'no-change',
    away: 'apply',
    locked: 'no-change',
  },
  move: { none: 'not-found', loose: 'apply', piled: inPile, away: taken, locked },
  adjust: { none: 'not-found', loose: 'apply', piled: 'apply', away: taken, locked },
  enter: { none: 'not-found', loose: 'apply', piled: 'apply', away: taken, locked },
  leave: { none: 'not-found', loose: 'no-change', piled: 'apply', away: taken, locked },
  take: { none: 'not-found', loose: 'apply', piled: 'apply', away: 'no-change', locked },
  pile: { none: 'not-found', loose: 'apply', piled: 'apply', away: taken, locked },
  lock: { none: 'not-found', loose: 'apply', piled: inPile, away: taken, locked: 'no-change' },
  unlock: {
    none: 'not-found',
    loose: 'no-change',
    piled: 'no-change',
    away: 'no-change',
    locked: 'apply',
  },
}

/** The holder admit is given: fixed by the tenant, the canvas and the reference, so the same before a record exists and after. */
export function holderOf(tenant: TenantId, canvas: CanvasId, reference: Reference): string {
  return ['canvas', tenant, canvas, reference.kind, reference.ref].map(encodeURIComponent).join('/')
}
