import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from 'react'

export type ModelChoiceAsk = Readonly<{
  open(session: string): void
  count(session: string): number
  subscribe(listener: () => void): () => void
}>

export function createModelChoiceAsk(): ModelChoiceAsk {
  let last: Readonly<{ session: string; count: number }> = { session: '', count: 0 }
  const listeners = new Set<() => void>()
  return {
    open(session) {
      last = { session, count: last.count + 1 }
      for (const listener of listeners) listener()
    },
    count: session => (last.session === session ? last.count : 0),
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export const ModelChoiceAskContext = createContext<ModelChoiceAsk | null>(null)

const NEVER = () => () => undefined

export function useModelChoiceAsked(session: string, act: () => void): void {
  const ask = useContext(ModelChoiceAskContext)
  const count = useSyncExternalStore(ask?.subscribe ?? NEVER, () => ask?.count(session) ?? 0)
  const seen = useRef(count)
  useEffect(() => {
    if (count === seen.current) return
    seen.current = count
    if (count > 0) act()
  }, [count, act])
}
