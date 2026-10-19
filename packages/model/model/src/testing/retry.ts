import type {
  ModelRetryPolicy,
  RetryResolution,
  RetryPosition,
  CallAccess,
} from '@omne-harness/model-contract'
import { MemoryState } from './state.ts'
import { digest, invalid, tenantKey, unavailable } from './value.ts'

export function createMemoryRetryPolicy<P>(store: MemoryState<P>) {
  const plans = new Map<string, RetryResolution>()
  const counts = new Map<string, number>()
  function key(input: CallAccess<P> & { readonly position: RetryPosition }): string {
    const tenant = tenantKey(input.tenant)
    if (typeof tenant !== 'string') throw new TypeError('retry plan requires a valid tenant')
    return `${tenant}/${input.call}/${digest(input.position)}`
  }
  const inspect: ModelRetryPolicy<P>['inspect'] = input =>
    store.run(() =>
      store.read(input, 'recovery', call => {
        if (!call.retryPosition || digest(call.retryPosition) !== digest(input.position))
          return { failure: invalid('position', 'not-original') }
        const plan = plans.get(key(input))
        return plan
          ? { ok: structuredClone(plan) }
          : { failure: unavailable('model-retry-policy', 'no-plan') }
      }),
    )
  const retry: ModelRetryPolicy<P> = {
    inspect,
    decide: input =>
      store.run(() =>
        store.read(input, 'recovery', call => {
          if (!call.retryPosition || digest(call.retryPosition) !== digest(input.position))
            return { failure: invalid('position', 'not-original') }
          const id = key(input)
          const plan = plans.get(id)
          if (!plan) return { failure: unavailable('model-retry-policy', 'no-plan') }
          if (counts.has(id)) return { ok: structuredClone(plan) }
          if (call.state.control.kind !== 'none' || call.state.phase === 'settled')
            return { failure: invalid('call', 'controlled-or-settled') }
          if (
            digest(input.request) !== call.requestDigest ||
            digest(input.initiator) !== digest(call.initiator)
          )
            return { failure: invalid('request', 'not-original') }
          if (plan.kind === 'decided') counts.set(id, 1)
          return { ok: structuredClone(plan) }
        }),
      ),
  }
  const control = {
    set(input: CallAccess<P> & { readonly resolution: RetryResolution }): void {
      const id = key({ ...input, position: input.resolution.position })
      const old = plans.get(id)
      if (old?.kind === 'decided' && digest(old) !== digest(input.resolution))
        throw new TypeError('retry decision is already fixed')
      plans.set(id, structuredClone(input.resolution))
    },
    decisions: (input: CallAccess<P> & { readonly position: RetryPosition }) =>
      counts.get(key(input)) ?? 0,
  }
  return { retry, control }
}
