import type { Ack } from '@omne-harness/operation-result'

/**
 * `held`: granted and not yet used. `consumed`: an exchange owns it until its physical end.
 * `released`: the slot is back in the capacity. Only `held` can become `consumed`.
 */
export type ReservationState = 'held' | 'consumed' | 'released'

/** Why a reservation cannot be consumed: it is already consumed or already released. */
export type ConsumeRefusal = Exclude<ReservationState, 'held'>

/**
 * One granted connection slot. It never expires: it stays valid until `release()`. A consumer
 * calls `consume()` once before it sends and `release()` after the physical end of its work.
 */
export interface ConnectionReservation {
  readonly state: ReservationState
  /** Moves `held` to `consumed`. Any other state refuses with the current state, without a throw. */
  consume(): Ack<ConsumeRefusal>
  /** Returns the slot from `held` or `consumed` and grants the next waiter. Idempotent. */
  release(): void
}

export interface ConnectionCapacity {
  /**
   * Grants a reservation in FIFO order. Resolves `undefined` when the signal aborts before the
   * grant, or when the capacity is or becomes closed. A cancelled waiter takes no slot.
   */
  reserve(signal: AbortSignal): Promise<ConnectionReservation | undefined>
  /** Ends every waiter with `undefined` and refuses new reservations. Granted ones still return. */
  close(): void
}

interface Waiter {
  readonly grant: (reservation: ConnectionReservation) => void
  readonly cancel: () => void
}

/** A FIFO admission of at most `maximum` granted reservations at the same time. */
export function createConnectionCapacity(maximum: number): ConnectionCapacity {
  if (!Number.isSafeInteger(maximum) || maximum < 1)
    throw new RangeError('connection capacity must be a positive integer')
  const waiting: Waiter[] = []
  let granted = 0
  let closed = false

  function grantWaiters(): void {
    while (!closed && granted < maximum) {
      const waiter = waiting.shift()
      if (waiter === undefined) return
      granted += 1
      waiter.grant(createReservation(returnSlot))
    }
  }

  function returnSlot(): void {
    granted -= 1
    grantWaiters()
  }

  return {
    reserve(signal) {
      if (closed || signal.aborted) return Promise.resolve(undefined)
      return new Promise(resolve => {
        const waiter: Waiter = {
          grant: reservation => {
            signal.removeEventListener('abort', waiter.cancel)
            resolve(reservation)
          },
          cancel: () => {
            const index = waiting.indexOf(waiter)
            if (index >= 0) waiting.splice(index, 1)
            signal.removeEventListener('abort', waiter.cancel)
            resolve(undefined)
          },
        }
        waiting.push(waiter)
        signal.addEventListener('abort', waiter.cancel, { once: true })
        grantWaiters()
      })
    },
    close() {
      closed = true
      for (const waiter of waiting.splice(0)) waiter.cancel()
    },
  }
}

function createReservation(returnSlot: () => void): ConnectionReservation {
  let state: ReservationState = 'held'
  return {
    get state() {
      return state
    },
    consume() {
      if (state !== 'held') return { failure: state }
      state = 'consumed'
      return { ok: true }
    },
    release() {
      if (state === 'released') return
      state = 'released'
      returnSlot()
    },
  }
}
