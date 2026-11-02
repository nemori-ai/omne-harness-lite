// The propagation of a committed control to the transport of the same call. The runtime wraps the
// send boundary that its driver uses: every send gets a stop of its own, joined with the drive's
// signal, and stays registered under its tenant and call until its facts end. A committed cancel
// fires the stop of that call only. The termination still comes from the transport, after it has
// physically stopped: firing the stop ends nothing here.
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { ModelCallId } from '@omne-harness/model-contract'
import type {
  ModelSendBoundary,
  SendDemand,
  TransportFact,
} from '@omne-harness/model-contract/provider'

type Target = Readonly<{ tenant: TenantId; call: ModelCallId }>

export type SendInterruption<P> = Readonly<{
  /** The send boundary to give the driver. */
  send: ModelSendBoundary<P>
  /** Requests the stop of every send of the call that is running now. */
  interrupt(target: Target): void
}>

function keyOf(target: Target): string | null {
  const tenant = tenantCodec.encode(target.tenant)
  return tenant.ok ? JSON.stringify([tenant.value, target.call]) : null
}

/**
 * The facts of `source`, unchanged, with `end` called once when the consumer has finished with
 * them: the stream is done, a read threw, or the consumer returned or threw into it. The one
 * iterator of the source is still the only one.
 */
function untilEnded(
  source: AsyncIterable<TransportFact>,
  end: () => void,
): AsyncIterable<TransportFact> {
  return {
    [Symbol.asyncIterator]() {
      const iterator = source[Symbol.asyncIterator]()
      async function finishing<T>(step: () => Promise<T>, last: (value: T) => boolean) {
        try {
          const value = await step()
          if (last(value)) end()
          return value
        } catch (error) {
          end()
          throw error
        }
      }
      return {
        next: () =>
          finishing(
            () => iterator.next(),
            result => result.done === true,
          ),
        return: () =>
          finishing(
            async () => (await iterator.return?.()) ?? { done: true as const, value: undefined },
            () => true,
          ),
        throw: (error?: unknown) =>
          finishing(
            async () => {
              if (iterator.throw) return iterator.throw(error)
              throw error
            },
            () => true,
          ),
      }
    },
  }
}

/** Wraps `inner` so that a committed control can stop the running send of its call. */
export function createSendInterruption<P>(inner: ModelSendBoundary<P>): SendInterruption<P> {
  const running = new Map<string, Set<AbortController>>()

  function register(key: string, stop: AbortController): () => void {
    let stops = running.get(key)
    if (stops === undefined) running.set(key, (stops = new Set()))
    stops.add(stop)
    let registered = true
    return () => {
      if (!registered) return
      registered = false
      stops.delete(stop)
      if (stops.size === 0 && running.get(key) === stops) running.delete(key)
    }
  }

  const send: ModelSendBoundary<P> = {
    async send(demand: SendDemand<P>, signal: AbortSignal) {
      const key = keyOf(demand)
      // A demand without a valid tenant is refused by the boundary itself; nothing to stop.
      if (key === null) return inner.send(demand, signal)
      const stop = new AbortController()
      const unregister = register(key, stop)
      let result: Awaited<ReturnType<ModelSendBoundary<P>['send']>>
      try {
        result = await inner.send(demand, AbortSignal.any([signal, stop.signal]))
      } catch (error) {
        unregister()
        throw error
      }
      if (result.kind !== 'started') {
        unregister()
        return result
      }
      return { ...result, facts: untilEnded(result.facts, unregister) }
    },
  }

  return {
    send,
    interrupt(target) {
      const key = keyOf(target)
      if (key === null) return
      for (const stop of running.get(key) ?? []) stop.abort()
    },
  }
}
