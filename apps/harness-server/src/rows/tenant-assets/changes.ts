import type { AssetChangeListener, AssetChanges } from '@omne-harness/assets-cordis-contract/cordis'

export type AssetChangeFeed = AssetChanges &
  Readonly<{ changed(tenant: string): void; close(): void }>

/** Listeners by tenant: a change of one tenant's assets reaches that tenant's listeners only. */
export function createAssetChangeFeed(): AssetChangeFeed {
  const listeners = new Map<string, Set<AssetChangeListener>>()
  let closed = false
  const each = (set: Iterable<AssetChangeListener>, call: (one: AssetChangeListener) => void) => {
    for (const listener of [...set])
      try {
        call(listener)
      } catch {
        continue
      }
  }
  return {
    subscribe(tenant, listener) {
      if (closed) {
        listener.closed()
        return () => {}
      }
      const set = listeners.get(tenant) ?? new Set()
      set.add(listener)
      listeners.set(tenant, set)
      return () => {
        set.delete(listener)
        if (set.size === 0 && listeners.get(tenant) === set) listeners.delete(tenant)
      }
    },
    changed(tenant) {
      each(listeners.get(tenant) ?? [], listener => listener.changed())
    },
    close() {
      closed = true
      const all = [...listeners.values()].flatMap(set => [...set])
      listeners.clear()
      each(all, listener => listener.closed())
    },
  }
}
