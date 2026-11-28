import type { GoalChanges } from '@omne-harness/goal'
import type { GoalChangeFeed, GoalChangeListener } from '@omne-harness/goal-access'

export type GoalChangePublisher = GoalChanges & GoalChangeFeed & Readonly<{ close(): void }>

/** Says to whoever watches the goal of one session that it was written. It lives in memory: a watcher that comes later reads the goal, it is told nothing of the past. */
export function createGoalChangePublisher(): GoalChangePublisher {
  const watching = new Map<string, Set<GoalChangeListener>>()
  const keyOf = (tenant: string, session: string): string => JSON.stringify([tenant, session])
  const told = (tell: () => void): void => {
    try {
      tell()
    } catch {
      return
    }
  }
  return {
    changed(tenant, session) {
      for (const listener of watching.get(keyOf(tenant, session)) ?? [])
        told(() => listener.changed())
    },
    subscribe(tenant, session, listener) {
      const key = keyOf(tenant, session)
      const listeners = watching.get(key) ?? new Set()
      watching.set(key, listeners)
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) watching.delete(key)
      }
    },
    close() {
      const all = [...watching.values()].flatMap(listeners => [...listeners])
      watching.clear()
      for (const listener of all) told(() => listener.closed())
    },
  }
}
