import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { ModelCallId } from '@omne-harness/model-contract'
import type {
  ModelSendBoundary,
  SendDemand,
  TransportFact,
} from '@omne-harness/model-contract/provider'

type Target = Readonly<{ tenant: TenantId; call: ModelCallId }>

export type SendInterruption<P> = Readonly<{
  send: ModelSendBoundary<P>
  interrupt(target: Target): void
}>

function keyOf(target: Target): string | null {
  const tenant = tenantCodec.encode(target.tenant)
  return tenant.ok ? JSON.stringify([tenant.value, target.call]) : null
}

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
