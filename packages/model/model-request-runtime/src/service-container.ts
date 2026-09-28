import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  isJsonNumber,
  isNonNegativeJsonInteger,
  LosslessNumber,
  type JsonNumber,
} from '@omne-harness-lite/content-blocks'
import type { PlannedSemantics } from './types.ts'
import type {
  CallContainer,
  CallContainerStore,
  CallContainerView,
  CallKey,
  CallOperationState,
  CallReservation,
  CreateCallContainerInput,
  OpenCallInput,
  RuntimeCloseResult,
  ReservationWaitPolicy,
} from './service-types.ts'
import type { SettlementScheduler } from './settlement-types.ts'
import type { AnchoredInvocationHandle } from './anchored-invocation-types.ts'

const invocationSlots = new WeakMap<object, (handle: AnchoredInvocationHandle) => void>()
const requestSlots = new WeakMap<object, (request: OpenCallInput) => void>()

function sameKey(left: CallKey, right: CallKey): boolean {
  return left.session === right.session && left.callId === right.callId
}
function positive(value: JsonNumber): boolean {
  return (
    isNonNegativeJsonInteger(value) && ExactDecimal.from(value).compare(ExactDecimal.from(0)) > 0
  )
}
function negative(value: JsonNumber): JsonNumber {
  const source = ExactDecimal.from(value).toString()
  return new LosslessNumber(source.startsWith('-') ? source.slice(1) : `-${source}`)
}
function nonnegative(value: unknown): value is JsonNumber {
  return isJsonNumber(value) && ExactDecimal.from(value).compare(ExactDecimal.from(0)) >= 0
}
function validWaitPolicy(policy: ReservationWaitPolicy): boolean {
  return positive(policy.maxWaitersPerCall) && positive(policy.timeoutMs)
}

/** Captures process resources only. Log facts and authorization remain with their providers. */
export function createCallContainer<P extends PlannedSemantics, R>(
  input: CreateCallContainerInput<P, R>,
): CallContainer<P, R> {
  const { key, session, binding, owner, coordinator } = input
  let request = input.request
  if (
    key.session !== request.session ||
    key.session !== session.log.session ||
    key.session !== session.selection.binding.session ||
    !tenantIdEquals(session.log.tenant, session.selection.binding.tenant) ||
    session.log.generation !== session.selection.binding.generation ||
    (request.callId !== undefined && request.callId !== key.callId)
  )
    throw new TypeError('call container ownership mismatch')

  const ownedKey = Object.freeze({ session: key.session, callId: key.callId })
  let operation: CallOperationState = Object.freeze({ phase: 'ready' })
  let closing: Promise<RuntimeCloseResult> | undefined
  let admissionClosed = false
  let released = false
  let releaseAttempted = false
  let stopFailed = false
  let invocation: AnchoredInvocationHandle | undefined
  let nextTask = 0
  const stopped = new Map<number, Promise<void>>()

  function retainStopped(actualStop: Promise<void>): void {
    if (released || releaseAttempted) throw new TypeError('call container already released')
    const token = ++nextTask
    const tracked = actualStop.then(
      () => {
        stopped.delete(token)
      },
      () => {
        stopFailed = true
        stopped.delete(token)
      },
    )
    stopped.set(token, tracked)
  }

  async function closeOnce(): Promise<RuntimeCloseResult> {
    if (released) return { released: true }
    admissionClosed = true
    if (operation.phase === 'dispatching') {
      try {
        operation.abort()
      } catch {
        return { unavailable: true }
      }
    }
    try {
      if (invocation !== undefined && 'unavailable' in (await invocation.close()))
        return { unavailable: true }
      await coordinator.close()
      while (stopped.size > 0) await Promise.all([...stopped.values()])
      if (
        stopFailed ||
        operation.phase === 'dispatching' ||
        operation.phase === 'reply_pending' ||
        operation.phase === 'settling'
      )
        return { unavailable: true }
      if ('unknown' in owner.opened() || owner.unresolvedWrites().length !== 0)
        return { unavailable: true }
      if (releaseAttempted) return { unavailable: true }
      releaseAttempted = true
      binding.lease.release()
      released = true
      return { released: true }
    } catch {
      return { unavailable: true }
    }
  }

  const container: CallContainer<P, R> = {
    key: ownedKey,
    view(): CallContainerView<P, R> {
      return Object.freeze({
        key: ownedKey,
        session,
        binding,
        request,
        owner,
        coordinator,
        ...(invocation === undefined ? {} : { invocation }),
        operation,
      })
    },
    publish(next: CallOperationState): void {
      if (released || releaseAttempted) throw new TypeError('call container already released')
      // An already running dispatch may publish its final state during host shutdown.
      if (admissionClosed && operation.phase !== 'dispatching' && operation.phase !== 'settling')
        throw new TypeError('call container admission closed')
      operation = Object.freeze({ ...next })
    },
    retainStopped,
    close(): Promise<RuntimeCloseResult> {
      if (closing !== undefined) return closing
      closing = closeOnce().finally(() => {
        closing = undefined
      })
      return closing
    },
    canRemove: () => released,
  }
  invocationSlots.set(container, handle => {
    if (released || releaseAttempted || admissionClosed)
      throw new TypeError('call container admission closed')
    if (invocation !== undefined && invocation !== handle)
      throw new TypeError('original invocation already attached')
    invocation = handle
  })
  requestSlots.set(container, next => {
    if (released || releaseAttempted || admissionClosed || operation.phase !== 'ready')
      throw new TypeError('call container cannot update request')
    if (
      next.session !== ownedKey.session ||
      next.callId !== ownedKey.callId ||
      next.host !== session ||
      next.run !== request.run ||
      (next.run === undefined && (next.attempt !== undefined || next.report !== undefined)) ||
      (next.run !== undefined && (next.attempt === undefined || next.report === undefined)) ||
      'unknown' in owner.opened() ||
      owner.unresolvedWrites().length !== 0
    )
      throw new TypeError('call request ownership mismatch')
    request = Object.freeze({
      ...next,
      messages: Object.freeze([...next.messages]),
      tools: Object.freeze([...next.tools]),
    })
  })
  return Object.freeze(container)
}

interface ReservationState<P extends PlannedSemantics, R> {
  readonly key: CallKey
  readonly reservation: CallReservation<P, R>
  active: boolean
}

/** Synchronous short admission per (session, callId); no timer, queue or durable claim. */
export function createCallContainerStore<P extends PlannedSemantics, R>(): CallContainerStore<
  P,
  R
> {
  const containers = new Map<string, Map<string, CallContainer<P, R>>>()
  const occupied = new Map<string, Set<string>>()
  const reservations = new WeakMap<CallReservation<P, R>, ReservationState<P, R>>()
  const waiters = new Map<string, Map<string, Set<() => void>>>()

  function waiting(key: CallKey): Set<() => void> {
    let session = waiters.get(key.session)
    if (session === undefined) {
      session = new Map()
      waiters.set(key.session, session)
    }
    let call = session.get(key.callId)
    if (call === undefined) {
      call = new Set()
      session.set(key.callId, call)
    }
    return call
  }
  function removeWaiter(key: CallKey, wake: () => void): void {
    const session = waiters.get(key.session)
    const call = session?.get(key.callId)
    call?.delete(wake)
    if (call?.size === 0) session?.delete(key.callId)
    if (session?.size === 0) waiters.delete(key.session)
  }

  function current(key: CallKey): CallContainer<P, R> | undefined {
    return containers.get(key.session)?.get(key.callId)
  }
  function owns(reservation: CallReservation<P, R>): ReservationState<P, R> | undefined {
    const state = reservations.get(reservation)
    return state?.active ? state : undefined
  }
  function unlock(state: ReservationState<P, R>): void {
    if (!state.active) return
    state.active = false
    const session = occupied.get(state.key.session)
    session?.delete(state.key.callId)
    if (session?.size === 0) occupied.delete(state.key.session)
    for (const wake of waiters.get(state.key.session)?.get(state.key.callId) ?? []) wake()
  }

  function reserve(
    key: CallKey,
  ): { readonly reservation: CallReservation<P, R> } | { readonly occupied: true } {
    if (
      typeof key.session !== 'string' ||
      key.session.length === 0 ||
      typeof key.callId !== 'string' ||
      key.callId.length === 0
    )
      throw new TypeError('invalid call key')
    let session = occupied.get(key.session)
    if (session?.has(key.callId)) return { occupied: true } as const
    if (session === undefined) {
      session = new Set<string>()
      occupied.set(key.session, session)
    }
    session.add(key.callId)
    const ownedKey = Object.freeze({ session: key.session, callId: key.callId })
    const reservation: CallReservation<P, R> = Object.freeze({
      key: ownedKey,
      view: () => {
        if (owns(reservation) === undefined) throw new TypeError('reservation released')
        return current(ownedKey)?.view()
      },
      publish(next: CallOperationState): void {
        if (owns(reservation) === undefined) throw new TypeError('reservation released')
        const container = current(ownedKey)
        if (container === undefined) throw new TypeError('call container absent')
        container.publish(next)
      },
      attachInvocation(handle: AnchoredInvocationHandle): void {
        if (owns(reservation) === undefined) throw new TypeError('reservation released')
        const container = current(ownedKey)
        if (container === undefined) throw new TypeError('call container absent')
        const attach = invocationSlots.get(container)
        if (attach === undefined) throw new TypeError('call container ownership absent')
        attach(handle)
      },
      updateRequest(request: OpenCallInput): void {
        if (owns(reservation) === undefined) throw new TypeError('reservation released')
        const container = current(ownedKey)
        if (container === undefined) throw new TypeError('call container absent')
        const update = requestSlots.get(container)
        if (update === undefined) throw new TypeError('call container ownership absent')
        update(request)
      },
      release(): void {
        const state = reservations.get(reservation)
        if (state !== undefined) unlock(state)
      },
    })
    reservations.set(reservation, { key: ownedKey, reservation, active: true })
    return { reservation } as const
  }

  return Object.freeze({
    find: current,
    reserve,
    async waitReserve(
      key: CallKey,
      input: {
        readonly policy: ReservationWaitPolicy
        readonly scheduler: SettlementScheduler
        readonly signal: AbortSignal
      },
    ) {
      const { policy, scheduler, signal } = input
      if (!validWaitPolicy(policy) || signal.aborted) return { unavailable: true } as const
      if (typeof scheduler.nowMonotonicMs !== 'function' || typeof scheduler.wait !== 'function')
        return { unavailable: true } as const
      let started: JsonNumber
      try {
        started = scheduler.nowMonotonicMs()
        if (!nonnegative(started)) return { unavailable: true } as const
      } catch {
        return { unavailable: true } as const
      }
      const existing = waiters.get(key.session)?.get(key.callId)?.size ?? 0
      if (ExactDecimal.from(existing).compare(ExactDecimal.from(policy.maxWaitersPerCall)) >= 0)
        return { unavailable: true } as const
      const callbacks = waiting(key)
      let wake: (() => void) | undefined
      let notified: Promise<void> = Promise.resolve()
      function subscribe(): void {
        notified = new Promise<void>(resolve => {
          wake = resolve
          callbacks.add(resolve)
        })
      }
      subscribe()
      try {
        for (;;) {
          if (signal.aborted) return { unavailable: true } as const
          const attempt = reserve(key)
          if ('reservation' in attempt) return attempt
          let now: JsonNumber
          try {
            now = scheduler.nowMonotonicMs()
            if (!nonnegative(now) || ExactDecimal.from(now).compare(ExactDecimal.from(started)) < 0)
              return { unavailable: true } as const
          } catch {
            return { unavailable: true } as const
          }
          const elapsed = ExactDecimal.from(now).add(ExactDecimal.from(negative(started)))
          const remaining = ExactDecimal.from(policy.timeoutMs).add(
            ExactDecimal.from(negative(elapsed.toJsonNumber())),
          )
          if (remaining.compare(ExactDecimal.from(0)) <= 0) return { unavailable: true } as const
          const controller = new AbortController()
          const abort = () => controller.abort()
          let notifyAbort: (() => void) | undefined
          const cancelled = new Promise<'cancelled'>(resolve => {
            notifyAbort = () => resolve('cancelled')
            signal.addEventListener('abort', notifyAbort, { once: true })
          })
          signal.addEventListener('abort', abort, { once: true })
          if (signal.aborted) {
            controller.abort()
            notifyAbort?.()
          }
          try {
            const timer = scheduler.wait(remaining.toJsonNumber(), controller.signal)
            try {
              const result = await Promise.race([
                notified.then(() => 'released' as const),
                timer.completion,
                cancelled,
              ])
              if (result !== 'released') return { unavailable: true } as const
            } finally {
              timer.requestStop()
              await timer.stopped
            }
          } catch {
            return { unavailable: true } as const
          } finally {
            signal.removeEventListener('abort', abort)
            if (notifyAbort !== undefined) signal.removeEventListener('abort', notifyAbort)
          }
          if (wake !== undefined) removeWaiter(key, wake)
          subscribe()
        }
      } finally {
        if (wake !== undefined) removeWaiter(key, wake)
      }
    },
    insert(reservation: CallReservation<P, R>, prepared: CallContainer<P, R>): boolean {
      const state = owns(reservation)
      if (
        state === undefined ||
        !sameKey(state.key, prepared.key) ||
        current(state.key) !== undefined
      )
        return false
      let session = containers.get(state.key.session)
      if (session === undefined) {
        session = new Map<string, CallContainer<P, R>>()
        containers.set(state.key.session, session)
      }
      session.set(state.key.callId, prepared)
      return true
    },
    remove(reservation: CallReservation<P, R>): boolean {
      const state = owns(reservation)
      if (state === undefined) return false
      const container = current(state.key)
      if (container === undefined || !container.canRemove()) return false
      const session = containers.get(state.key.session)
      session?.delete(state.key.callId)
      if (session?.size === 0) containers.delete(state.key.session)
      return true
    },
  })
}
