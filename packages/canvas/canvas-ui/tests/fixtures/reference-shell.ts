import { serverPointsContract, type ServerPoints } from '@omne-harness/client-assembly'
import { servePoint, startShell as startBare } from '@omne-harness/shell-contract/testing'

export { ReferenceShell, render } from '@omne-harness/shell-contract/testing'

export type FakeKeys = Readonly<{
  source: ServerPoints
  /** What the server now tells of one point; `undefined` is a server that tells nothing of it. */
  set(point: string, keys: readonly string[] | undefined): void
  /** A frame that changed something else: every listener is called, the keys are the same. */
  touch(): void
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
        return () => void listeners.delete(listener)
      },
    },
    set(point, keys) {
      if (keys === undefined) held.delete(point)
      else held.set(point, keys)
      tell()
    },
    touch: tell,
  }
}

/** The reference shell, without a connection: what the server tells of its points is not known. */
export const startShell = startBare

/** The reference shell on a tree with a connection: its server tells no point until the case sets one. */
export async function startConnected() {
  const started = await startBare()
  const keys = fakeKeys()
  await servePoint(started.root, serverPointsContract, keys.source)
  return { ...started, keys }
}
