import { compareInstants, parseInstant, type Instant } from '@omne-harness/utc-instant'
import type { ModelClock } from '@omne-harness/model-contract/provider'
import { positiveLimit } from './value.ts'

function instant(text: string): Instant {
  const value = parseInstant(text)
  if (!value.ok) throw new TypeError('manual clock requires a valid UTC instant')
  return value.value
}
export function createManualModelClock(start: string, maxWaiters: number) {
  positiveLimit(maxWaiters, 'maxWaiters')
  let current = instant(start)
  let text = start
  const waiters = new Set<{ at: Instant; finish: (value: 'elapsed' | 'cancelled') => void }>()
  const clock: ModelClock = {
    now: () => text,
    waitUntil: (target, signal) => {
      const at = instant(target)
      if (signal.aborted) return Promise.resolve('cancelled')
      if (compareInstants(at, current) <= 0) return Promise.resolve('elapsed')
      if (waiters.size >= maxWaiters)
        return Promise.reject(new RangeError('manual clock waiter capacity'))
      return new Promise(resolve => {
        const waiter = {
          at,
          finish: (value: 'elapsed' | 'cancelled') => {
            waiters.delete(waiter)
            signal.removeEventListener('abort', abort)
            resolve(value)
          },
        }
        const abort = () => waiter.finish('cancelled')
        waiters.add(waiter)
        signal.addEventListener('abort', abort, { once: true })
      })
    },
  }
  const control = {
    advanceTo(target: string): void {
      const at = instant(target)
      if (compareInstants(at, current) < 0)
        throw new RangeError('manual clock cannot move backwards')
      current = at
      text = target
      for (const waiter of waiters)
        if (compareInstants(waiter.at, current) <= 0) waiter.finish('elapsed')
    },
    pending: () => waiters.size,
  }
  return { clock, control }
}
