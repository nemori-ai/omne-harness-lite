import type { McpTransport } from '@omne-harness/mcp-contract/provider'
import type { Spawn } from './scope.ts'
import type { Ensured } from './table.ts'

/** Waits for about `ms`: the host waits between half of it and all of it, at random. */
export type Pause = (ms: number) => Promise<void>

export type Following = Readonly<{
  /** Listens for the changes of the tools on this connection, once per connection; each change refreshes. */
  follow(ensured: Ensured, refresh: () => Promise<unknown>): void
}>

const backoffMs = (attempt: number): number => Math.min(250 * 2 ** attempt, 30_000)

// Refreshes one at a time: a change heard while one runs makes one more run after it.
export function coalesced(refresh: () => Promise<unknown>): () => void {
  let running: Promise<void> | undefined
  let again = false
  return () => {
    if (running !== undefined) {
      again = true
      return
    }
    running = (async () => {
      do {
        again = false
        await refresh().catch(() => undefined)
      } while (again)
    })().finally(() => {
      running = undefined
    })
  }
}

type Listen = NonNullable<McpTransport['listen']>

async function listenOn(
  listen: Listen,
  ensured: Ensured,
  changed: () => void,
  pause: Pause,
): Promise<void> {
  const current = () => ensured.connection.isCurrent(ensured.generation)
  for (let attempt = 0; current(); attempt += 1) {
    const stop = new AbortController()
    const end = await listen({ toolsListChanged: true }, stop.signal, event => {
      if (event.kind === 'tools-changed') return changed()
      if (!event.agreed.toolsListChanged) stop.abort()
    })
    if (end.kind !== 'broken') return
    await pause(backoffMs(attempt))
    // The protocol keeps nothing across a broken stream: the catalog is taken once before listening again.
    if (current()) changed()
  }
}

export function createFollowing(scope: Spawn, pause: Pause): Following {
  const followed = new WeakSet<object>()
  return {
    follow(ensured, refresh) {
      if (followed.has(ensured.connection)) return
      const wire = ensured.wire()
      if (!('ok' in wire)) return
      const transport = wire.ok
      const { listen } = transport
      if (listen === undefined) return
      followed.add(ensured.connection)
      const bound: Listen = (filter, signal, observe) =>
        listen.call(transport, filter, signal, observe)
      scope.spawn(listenOn(bound, ensured, coalesced(refresh), pause))
    },
  }
}
