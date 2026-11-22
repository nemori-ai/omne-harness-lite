import type { KeysSource } from '../../src/model/category-names.ts'

export type FakeKeys = Readonly<{
  source: KeysSource
  /** What the server now tells of one point; `undefined` is a server that tells nothing of it. */
  set(point: string, keys: readonly string[] | undefined): void
  /** A frame that changed something else: every listener is called, the keys are the same. */
  touch(): void
  listeners(): number
}>

export function fakeKeys(): FakeKeys {
  const held = new Map<string, readonly string[]>()
  const listeners = new Set<() => void>()
  const tell = (): void => {
    for (const listener of Array.from(listeners)) listener()
  }
  return {
    source: {
      keys: point => held.get(point),
      subscribe(listener) {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
    set(point, keys) {
      if (keys === undefined) held.delete(point)
      else held.set(point, keys)
      tell()
    },
    touch: tell,
    listeners: () => listeners.size,
  }
}
