import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { ChoicesView } from '../model/offered-choices.ts'

type Offering<C> = Readonly<{
  choices(tenant: string): ChoicesView<C>
  subscribeChoices(tenant: string, listener: () => void): () => void
  loadChoices(tenant: string): Promise<void>
}>

/** What a tenant can pick from a store's handed-over source, read when the tenant is shown and `load` is on. */
export function useOffered<C>(store: Offering<C>, tenant: string, load = true): ChoicesView<C> {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribeChoices(tenant, listener),
    [store, tenant],
  )
  useEffect(() => {
    if (load) void store.loadChoices(tenant)
  }, [store, tenant, load])
  return useSyncExternalStore(subscribe, () => store.choices(tenant))
}
