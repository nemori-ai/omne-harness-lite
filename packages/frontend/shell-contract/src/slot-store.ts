import { ShellAssemblyError, slots, type ItemOf, type ShellSlots, type SlotName } from './slots.ts'

export interface SlotStore extends ShellSlots {
  place<K extends SlotName>(slot: K, item: ItemOf<K>): () => void
}

type Held = Readonly<{ id: string; order?: number }>

const byOrderThenId = (a: Held, b: Held): number =>
  (a.order ?? 0) - (b.order ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

export function createSlotStore(): SlotStore {
  const held: Record<SlotName, Held[]> = { gate: [], pages: [], sidebar: [] }
  const listeners = new Set<{ slot: SlotName; listener: () => void }>()

  function changed(slot: SlotName): void {
    for (const entry of Array.from(listeners)) if (entry.slot === slot) entry.listener()
  }

  return {
    items<K extends SlotName>(slot: K): readonly ItemOf<K>[] {
      return [...held[slot]].sort(byOrderThenId) as unknown as ItemOf<K>[]
    },
    subscribe(slot, listener) {
      const entry = { slot, listener }
      listeners.add(entry)
      return () => {
        listeners.delete(entry)
      }
    },
    place(slot, item) {
      const list = held[slot]
      if (slots[slot].kind === 'one' && list.length > 0)
        throw new ShellAssemblyError(slot, item.id, 'occupied')
      if (list.some(other => other.id === item.id))
        throw new ShellAssemblyError(slot, item.id, 'duplicate')
      list.push(item)
      changed(slot)
      let placed = true
      return () => {
        if (!placed) return
        placed = false
        list.splice(list.indexOf(item), 1)
        changed(slot)
      }
    },
  }
}
