import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type { PlannedSemantics } from './types.ts'
import type {
  CallContainer,
  CallContainerStore,
  CallContainerView,
  CallKey,
  CallOperationState,
  CallReservation,
  CreateCallContainerInput,
  RuntimeCloseResult,
} from './service-types.ts'

function sameKey(left: CallKey, right: CallKey): boolean {
  return left.session === right.session && left.callId === right.callId
}

/** Captures process resources only. Log facts and authorization remain with their providers. */
export function createCallContainer<P extends PlannedSemantics, R>(
  input: CreateCallContainerInput<P, R>,
): CallContainer<P, R> {
  const { key, session, binding, request, owner, coordinator } = input
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
  }

  return Object.freeze({
    find: current,
    reserve(key: CallKey) {
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
        release(): void {
          const state = reservations.get(reservation)
          if (state !== undefined) unlock(state)
        },
      })
      reservations.set(reservation, { key: ownedKey, reservation, active: true })
      return { reservation } as const
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
