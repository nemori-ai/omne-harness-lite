import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ItemOf, ShellSlots, SlotConflict, SlotName } from '@omne-harness/shell-contract'
import type { Watched } from './state.ts'

export function useWatched<T>(source: Watched<T>): T {
  return useSyncExternalStore(
    listener => source.subscribe(() => listener()),
    () => source.get(),
  )
}

export function useSlot<K extends SlotName>(slots: ShellSlots, slot: K): readonly ItemOf<K>[] {
  const [items, setItems] = useState(() => slots.items(slot))
  useEffect(() => {
    setItems(slots.items(slot))
    return slots.subscribe(slot, () => setItems(slots.items(slot)))
  }, [slots, slot])
  return items
}

export function useConflicts(slots: ShellSlots, slot: SlotName): readonly SlotConflict[] {
  const [conflicts, setConflicts] = useState(() => slots.conflicts(slot))
  useEffect(() => {
    setConflicts(slots.conflicts(slot))
    return slots.subscribe(slot, () => setConflicts(slots.conflicts(slot)))
  }, [slots, slot])
  return conflicts
}
