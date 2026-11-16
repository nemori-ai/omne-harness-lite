import type { CardChangeListener, CardChanges } from '../../src/ports.ts'

export type ChangesDouble = Readonly<{
  changes: CardChanges
  subscribed: string[]
  live(tenant: string): number
  changed(tenant: string): void
  closed(): void
  failSubscribe: { value: boolean }
}>

export function createChangesDouble(): ChangesDouble {
  const listeners = new Map<string, Set<{ listener: CardChangeListener }>>()
  const subscribed: string[] = []
  const failSubscribe = { value: false }
  const all = () => [...listeners.values()].flatMap(set => [...set])
  return {
    subscribed,
    failSubscribe,
    live: tenant => listeners.get(tenant)?.size ?? 0,
    changed: tenant => {
      for (const entry of listeners.get(tenant) ?? []) entry.listener.changed()
    },
    closed: () => {
      for (const entry of all()) entry.listener.closed()
    },
    changes: {
      subscribe(tenant, listener) {
        if (failSubscribe.value) throw new Error('the signal source is down')
        subscribed.push(tenant)
        const entry = { listener }
        const set = listeners.get(tenant) ?? new Set()
        set.add(entry)
        listeners.set(tenant, set)
        return () => {
          set.delete(entry)
        }
      },
    },
  }
}
