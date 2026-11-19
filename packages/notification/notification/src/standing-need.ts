import {
  standingItemsSchema,
  type StandingItem,
  type StandingRead,
} from '@omne-harness/notification-contract'

export const STANDING_ITEMS_NEED = 'notification.standing-items'

/** How one bound block read now, in this group's own words. */
export type StandingBlockRead =
  | Readonly<{ kind: 'value'; value: unknown }>
  | Readonly<{ kind: 'none' | 'missing' | 'unknown' }>

export type StandingScopeRead =
  | Readonly<{ kind: 'read'; bound: boolean; blocks: readonly StandingBlockRead[] }>
  | Readonly<{ kind: 'refused' | 'unknown' }>

/** The items of every bound block. A block that did not read makes the whole read not `ok`. */
export function standingReadOf(read: StandingScopeRead): StandingRead {
  if (read.kind !== 'read') return { kind: read.kind }
  if (!read.bound) return { kind: 'missing' }
  const items: StandingItem[] = []
  for (const block of read.blocks) {
    if (block.kind === 'unknown') return { kind: 'unknown' }
    if (block.kind !== 'value') return { kind: 'missing' }
    const parsed = standingItemsSchema.safeParse(block.value)
    if (!parsed.success) return { kind: 'unknown' }
    items.push(...parsed.data)
  }
  return { kind: 'ok', items }
}
