import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { ChoicesView } from '../model/offered-choices.ts'

type Offering<C, W> = Readonly<{
  choices(where: W): ChoicesView<C>
  subscribeChoices(where: W, listener: () => void): () => void
  loadChoices(where: W): Promise<void>
}>

/** What can be picked where it is shown, from a store's handed-over source, read while `load` is on. */
export function useOffered<C, W>(store: Offering<C, W>, where: W, load = true): ChoicesView<C> {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribeChoices(where, listener),
    [store, where],
  )
  useEffect(() => {
    if (load) void store.loadChoices(where)
  }, [store, where, load])
  return useSyncExternalStore(subscribe, () => store.choices(where))
}
