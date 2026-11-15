import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ClientTree } from '../tree.ts'

export type Source<T> = {
  current(): T
  subscribe(listener: (value: T) => void): () => void
}

export function useSource<T>(source: Source<T>): T {
  return useSyncExternalStore(
    listener => source.subscribe(() => listener()),
    () => source.current(),
  )
}

export function useServices(tree: ClientTree, services: readonly string[]): readonly unknown[] {
  const key = services.join('\n')
  const [values, setValues] = useState<readonly unknown[]>(() => services.map(() => undefined))
  useEffect(() => {
    const names = key.split('\n')
    const stops = names.map((name, index) =>
      tree.watch(name, value =>
        setValues(previous => previous.map((item, at) => (at === index ? value : item))),
      ),
    )
    return () => {
      for (const stop of stops) stop()
    }
  }, [tree, key])
  return values
}
