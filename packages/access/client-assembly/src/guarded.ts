import type { ProtocolContract } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'

export function guarded<P extends ProtocolContract>(
  protocol: P,
  client: ClientOf<P>,
  revoked: AbortSignal,
): ClientOf<P> {
  const unavailable = Object.freeze({ outcome: 'unavailable' as const })
  const raw = client as unknown as Record<
    string,
    (body: unknown, options: { signal: AbortSignal; messageId?: string }) => unknown
  >
  const guardedClient: Record<string, unknown> = {}
  for (const name of Object.keys(protocol.operations))
    guardedClient[name] = (
      body: unknown,
      options?: { signal?: AbortSignal; messageId?: string },
    ) =>
      revoked.aborted
        ? Promise.resolve(unavailable)
        : raw[name]!(body, {
            ...options,
            signal:
              options?.signal === undefined ? revoked : AbortSignal.any([options.signal, revoked]),
          })
  const observers: Record<string, unknown> = {}
  const rawObservers = client.observe as unknown as Record<
    string,
    (open: unknown, options: { signal: AbortSignal }) => AsyncGenerator<unknown, unknown>
  >
  for (const name of Object.keys(protocol.observations))
    observers[name] = (open: unknown, options: { signal: AbortSignal; messageId?: string }) => {
      if (revoked.aborted)
        return (async function* () {
          yield* []
          return { kind: 'unavailable' }
        })()
      return rawObservers[name]!(open, {
        ...options,
        signal: AbortSignal.any([options.signal, revoked]),
      })
    }
  guardedClient['observe'] = observers
  return guardedClient as ClientOf<P>
}
