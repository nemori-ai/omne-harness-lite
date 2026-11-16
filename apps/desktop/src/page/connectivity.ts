import type { JsonValue } from '@omne-harness/json-text'
import type { ObserveEnd, Transport } from '@omne-harness/sdk/core'

export type Connectivity = 'connecting' | 'connected' | 'disconnected'

export type WatchedTransport = {
  readonly transport: Transport
  current(): Connectivity
  subscribe(listener: (state: Connectivity) => void): () => void
}

export function watchConnectivity(inner: Transport): WatchedTransport {
  let state: Connectivity = 'connecting'
  const listeners = new Set<(state: Connectivity) => void>()
  function enter(next: Connectivity): void {
    if (state === next) return
    state = next
    for (const listener of Array.from(listeners)) listener(next)
  }
  return {
    transport: {
      call: request => inner.call(request),
      async *observe(request): AsyncGenerator<JsonValue, ObserveEnd> {
        const watched = request.protocol.name === 'access' && request.observation === 'availability'
        const frames = inner.observe(request)
        try {
          for (;;) {
            const next = await frames.next()
            if (next.done === true) {
              if (watched && next.value.kind !== 'aborted') enter('disconnected')
              return next.value
            }
            if (watched) enter('connected')
            yield next.value
          }
        } finally {
          await frames.return({ kind: 'aborted' })
        }
      },
    },
    current: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
