import { describe, expect, it } from 'vitest'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { createCallContainerStore } from '../src/service-container.ts'
import type { ReservationWaitPolicy } from '../src/service-types.ts'
import type { SettlementScheduler } from '../src/settlement-types.ts'
import type {PlannedSemantics} from '@omne-harness-lite/model-request-runtime'

function sessionRef(value: string) {
  const parsed = parseOpaqueIdentifier(value, 'SessionRef')
  if ('invalidInput' in parsed) throw new Error('invalid test session')
  return parsed.ok
}

const key = { session: sessionRef('session-a'), callId: 'call-a' }
const policy: ReservationWaitPolicy = { maxWaitersPerCall: 1, timeoutMs: 500 }

function controlledScheduler() {
  const timers: { finish: (result: 'elapsed' | 'cancelled') => void; get stopped(): boolean }[] = []
  const scheduler: SettlementScheduler = {
    nowMonotonicMs: () => 0,
    wait(_timeout, signal) {
      let finish: ((result: 'elapsed' | 'cancelled') => void) | undefined
      let stopped = false
      const completion = new Promise<'elapsed' | 'cancelled'>(resolve => {
        finish = resolve
      })
      const task = {
        completion,
        get stopped() {
          return stopped ? Promise.resolve() : completion.then(() => undefined)
        },
        requestStop() {
          stopped = true
          finish?.('cancelled')
        },
      }
      timers.push({
        finish: result => finish?.(result),
        get stopped() {
          return stopped
        },
      })
      if (signal.aborted) task.requestStop()
      else signal.addEventListener('abort', () => task.requestStop(), { once: true })
      return task
    },
  }
  return { scheduler, timers }
}

describe('bounded call reservation waiting', () => {
  it('wakes a waiter on close and waits for its timer to stop before final release', async () => {
    const store = createCallContainerStore<PlannedSemantics, never>()
    const first = store.reserve(key)
    if (!('reservation' in first)) throw new Error('first reservation')
    const { scheduler, timers } = controlledScheduler()
    const waiting = store.waitReserve(key, {
      policy,
      scheduler,
      signal: new AbortController().signal,
    })
    expect(timers).toHaveLength(1)
    const closing = store.close()
    expect(store.reserve(key)).toEqual({ closed: true })
    expect(await waiting).toEqual({ unavailable: true })
    expect(timers[0]?.stopped).toBe(true)
    expect(await closing).toEqual({ unavailable: true })
    first.reservation.release()
    expect(await store.close()).toEqual({ released: true })
  })

  it('keeps the store unavailable while a cancelled waiter timer has not actually stopped', async () => {
    const store = createCallContainerStore<PlannedSemantics, never>()
    const first = store.reserve(key)
    if (!('reservation' in first)) throw new Error('first reservation')
    let finishTimer: (() => void) | undefined
    const stopped = new Promise<void>(resolve => {
      finishTimer = resolve
    })
    let cancel: (() => void) | undefined
    const scheduler: SettlementScheduler = {
      nowMonotonicMs: () => 0,
      wait() {
        const completion = new Promise<'cancelled'>(resolve => {
          cancel = () => resolve('cancelled')
        })
        return { completion, stopped, requestStop: () => cancel?.() }
      },
    }
    const waiting = store.waitReserve(key, {
      policy,
      scheduler,
      signal: new AbortController().signal,
    })
    expect(await store.close()).toEqual({ unavailable: true })
    first.reservation.release()
    expect(await store.close()).toEqual({ unavailable: true })
    finishTimer?.()
    expect(await waiting).toEqual({ unavailable: true })
    expect(await store.close()).toEqual({ released: true })
  })

  it('subscribes before checking occupation, then wakes without losing another call identity', async () => {
    const store = createCallContainerStore<PlannedSemantics, never>()
    const first = store.reserve(key)
    if (!('reservation' in first)) throw new Error('first reservation')
    const { scheduler, timers } = controlledScheduler()
    const waiting = store.waitReserve(key, {
      policy,
      scheduler,
      signal: new AbortController().signal,
    })
    expect(timers).toHaveLength(1)
    const other = store.reserve({ session: sessionRef('session-b'), callId: key.callId })
    expect(other).toHaveProperty('reservation')
    first.reservation.release()
    const next = await waiting
    expect(next).toHaveProperty('reservation')
    expect(timers[0]?.stopped).toBe(true)
    if ('reservation' in next) next.reservation.release()
    if ('reservation' in other) other.reservation.release()
  })

  it('enforces waiter capacity and cancellation without abandoning a timer', async () => {
    const store = createCallContainerStore<PlannedSemantics, never>()
    const first = store.reserve(key)
    if (!('reservation' in first)) throw new Error('first reservation')
    const { scheduler, timers } = controlledScheduler()
    const controller = new AbortController()
    const waiting = store.waitReserve(key, { policy, scheduler, signal: controller.signal })
    expect(
      await store.waitReserve(key, { policy, scheduler, signal: new AbortController().signal }),
    ).toEqual({ unavailable: true })
    controller.abort()
    expect(await waiting).toEqual({ unavailable: true })
    expect(timers[0]?.stopped).toBe(true)
    first.reservation.release()
    const available = store.reserve(key)
    expect(available).toHaveProperty('reservation')
    if ('reservation' in available) available.reservation.release()
  })

  it('maps policy timeout to unavailable and frees the waiter slot', async () => {
    const store = createCallContainerStore<PlannedSemantics, never>()
    const first = store.reserve(key)
    if (!('reservation' in first)) throw new Error('first reservation')
    const { scheduler, timers } = controlledScheduler()
    const waiting = store.waitReserve(key, {
      policy,
      scheduler,
      signal: new AbortController().signal,
    })
    timers[0]?.finish('elapsed')
    expect(await waiting).toEqual({ unavailable: true })
    expect(timers[0]?.stopped).toBe(true)
    const second = store.waitReserve(key, {
      policy,
      scheduler,
      signal: new AbortController().signal,
    })
    expect(timers).toHaveLength(2)
    first.reservation.release()
    const result = await second
    expect(result).toHaveProperty('reservation')
    if ('reservation' in result) result.reservation.release()
  })
})
