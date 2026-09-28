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
const replacementSlots = new WeakMap<
  object,
  {
    eligible: (old: AnchoredInvocationHandle) => boolean
    replace: (
      old: AnchoredInvocationHandle,
      create: () => AnchoredInvocationHandle,
    ) => { readonly attached: AnchoredInvocationHandle } | { readonly unavailable: true }
  }
>()
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
      if (invocation !== undefined) {
        const stopped = await invocation.close()
        if (!('released' in stopped) || stopped.released !== true) return { unavailable: true }
      }
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
  function eligibleForReplacement(old: AnchoredInvocationHandle): boolean {
    return (
      invocation === old &&
      !released &&
      !releaseAttempted &&
      !admissionClosed &&
      operation.phase === 'ready' &&
      !('unknown' in owner.opened()) &&
      owner.unresolvedWrites().length === 0
    )
  }
  replacementSlots.set(container, {
    eligible: eligibleForReplacement,
    replace(old, create) {
      if (!eligibleForReplacement(old)) return { unavailable: true }
      let next: AnchoredInvocationHandle
      try {
        next = create()
      } catch {
        return { unavailable: true }
      }
      if (
        next === old ||
        next === null ||
        typeof next !== 'object' ||
        typeof next.close !== 'function' ||
        typeof next.settleReply !== 'function'
      )
        return { unavailable: true }
      // The factory is synchronous: attach in the same turn as construction.
      invocation = next
      return { attached: next }
    },
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
  const activeReservations = new Set<CallReservation<P, R>>()
  const activeWaiters = new Set<{ readonly stop: () => void }>()
  let closed = false
  let released = false
  let closing: Promise<RuntimeCloseResult> | undefined

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
    activeReservations.delete(state.reservation)
    const session = occupied.get(state.key.session)
    session?.delete(state.key.callId)
    if (session?.size === 0) occupied.delete(state.key.session)
    for (const wake of waiters.get(state.key.session)?.get(state.key.callId) ?? []) wake()
  }

  function reserve(
    key: CallKey,
  ):
    | { readonly reservation: CallReservation<P, R> }
    | { readonly occupied: true }
    | { readonly closed: true } {
    if (
      typeof key.session !== 'string' ||
      key.session.length === 0 ||
      typeof key.callId !== 'string' ||
      key.callId.length === 0
    )
      throw new TypeError('invalid call key')
    if (closed) return { closed: true } as const
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
        if (closed) throw new TypeError('reservation admission closed')
        const container = current(ownedKey)
        if (container === undefined) throw new TypeError('call container absent')
        const attach = invocationSlots.get(container)
        if (attach === undefined) throw new TypeError('call container ownership absent')
        attach(handle)
      },
      async replaceInvocation(create: () => AnchoredInvocationHandle) {
        if (closed || owns(reservation) === undefined || typeof create !== 'function')
          return { unavailable: true } as const
        const container = current(ownedKey)
        const old = container?.view().invocation
        const slot = container === undefined ? undefined : replacementSlots.get(container)
        if (old === undefined || slot === undefined || !slot.eligible(old))
          return { unavailable: true } as const
        let stopped: Awaited<ReturnType<AnchoredInvocationHandle['close']>>
        try {
          stopped = await old.close()
        } catch {
          return { unavailable: true } as const
        }
        if (
          !('released' in stopped) ||
          stopped.released !== true ||
          closed ||
          owns(reservation) === undefined ||
          current(ownedKey) !== container ||
          !slot.eligible(old)
        )
          return { unavailable: true } as const
        return slot.replace(old, create)
      },
      updateRequest(request: OpenCallInput): void {
        if (owns(reservation) === undefined) throw new TypeError('reservation released')
        if (closed) throw new TypeError('reservation admission closed')
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
    activeReservations.add(reservation)
    return { reservation } as const
  }

  async function closeOnce(): Promise<RuntimeCloseResult> {
    const pending: Promise<RuntimeCloseResult>[] = []
    for (const session of containers.values()) {
      for (const container of session.values()) {
        try {
          pending.push(container.close())
        } catch {
          pending.push(Promise.resolve({ unavailable: true }))
        }
      }
    }
    await Promise.allSettled(pending)
    for (const [sessionId, session] of containers) {
      for (const [callId, container] of session) {
        if (container.canRemove()) session.delete(callId)
      }
      if (session.size === 0) containers.delete(sessionId)
    }
    return containers.size === 0 && activeReservations.size === 0 && activeWaiters.size === 0
      ? { released: true }
      : { unavailable: true }
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
      if (closed || !validWaitPolicy(policy) || signal.aborted)
        return { unavailable: true } as const
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
      let stopTimer: (() => void) | undefined
      let stopFailed = false
      let notified: Promise<void> = Promise.resolve()
      const waiter = {
        stop() {
          wake?.()
          try {
            stopTimer?.()
          } catch {
            stopFailed = true
          }
        },
      }
      function subscribe(): void {
        notified = new Promise<void>(resolve => {
          wake = resolve
          callbacks.add(resolve)
        })
      }
      subscribe()
      activeWaiters.add(waiter)
      try {
        for (;;) {
          if (closed || signal.aborted) return { unavailable: true } as const
          const attempt = reserve(key)
          if ('reservation' in attempt) return attempt
          if ('closed' in attempt) return { unavailable: true } as const
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
            stopTimer = () => timer.requestStop()
            if (closed) waiter.stop()
            try {
              const result = await Promise.race([
                notified.then(() => 'released' as const),
                timer.completion,
                cancelled,
              ])
              if (result !== 'released') return { unavailable: true } as const
            } finally {
              try {
                timer.requestStop()
                await timer.stopped
              } catch {
                stopFailed = true
                throw new Error('reservation timer did not stop')
              } finally {
                stopTimer = undefined
              }
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
        if (!stopFailed) activeWaiters.delete(waiter)
      }
    },
    insert(reservation: CallReservation<P, R>, prepared: CallContainer<P, R>): boolean {
      const state = owns(reservation)
      if (
        closed ||
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
    close(): Promise<RuntimeCloseResult> {
      if (released) return Promise.resolve({ released: true })
      if (closing !== undefined) return closing
      closed = true
      for (const waiter of activeWaiters) waiter.stop()
      const attempt = closeOnce()
      closing = attempt
        .then(result => {
          if ('released' in result) released = true
          return result
        })
        .catch(() => ({ unavailable: true }) as const)
        .finally(() => {
          closing = undefined
        })
      return closing
    },
  })
}
