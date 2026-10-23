import type { Outcome } from '@omne-harness/operation-result'

/**
 * `held`: granted and not yet used. `consumed`: an exchange owns it until its physical end.
 * `released`: the slot is back in the capacity. Only `held` can become `consumed`.
 */
export type ReservationState = 'held' | 'consumed' | 'released'

/** Why a reservation cannot be consumed: it is already consumed or already released. */
export type ConsumeRefusal = Exclude<ReservationState, 'held'>

/**
 * The only way back for a consumed slot. The exchange that consumed the reservation keeps the
 * seat and releases it after its physical end; nobody else can return the slot earlier.
 */
export interface ConsumedSeat {
  /** Returns the slot and grants the next waiter. Idempotent. */
  release(): void
}

/**
 * One granted connection slot. It never expires: it stays valid until it is released. A
 * consumer calls `consume()` once before it sends; the seat it gets back returns the slot.
 */
export interface ConnectionReservation {
  readonly state: ReservationState
  /** Moves `held` to `consumed`. Any other state refuses with the current state, without a throw. */
  consume(): Outcome<ConsumedSeat, ConsumeRefusal>
  /**
   * Returns a `held` slot and grants the next waiter. Does nothing once the reservation is
   * consumed: only the seat returns that slot. Idempotent after release.
   */
  release(): void
}

export interface ConnectionCapacity {
  /**
   * Grants a reservation in FIFO order. Resolves `undefined` when the signal aborts before the
   * grant, or when the capacity is or becomes closed. A cancelled waiter takes no slot.
   */
  reserve(signal: AbortSignal): Promise<ConnectionReservation | undefined>
  /**
   * `true` only for a reservation this capacity granted, whatever its state. The mark cannot
   * be forged: a look-alike object or a reservation of another capacity is not owned.
   */
  owns(candidate: unknown): candidate is ConnectionReservation
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
  /** Every reservation this capacity granted; membership is the ownership mark. */
  const owned = new WeakSet<object>()
  let granted = 0
  let closed = false

  function grantWaiters(): void {
    while (!closed && granted < maximum) {
      const waiter = waiting.shift()
      if (waiter === undefined) return
      granted += 1
      const reservation = createReservation(returnSlot)
      owned.add(reservation)
      waiter.grant(reservation)
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
    owns(candidate): candidate is ConnectionReservation {
      return (
        (typeof candidate === 'object' || typeof candidate === 'function') &&
        candidate !== null &&
        owned.has(candidate)
      )
    },
    close() {
      closed = true
      for (const waiter of waiting.splice(0)) waiter.cancel()
    },
  }
}

function createReservation(returnSlot: () => void): ConnectionReservation {
  let state: ReservationState = 'held'
  const seat: ConsumedSeat = {
    release() {
      if (state !== 'consumed') return
      state = 'released'
      returnSlot()
    },
  }
  return {
    get state() {
      return state
    },
    consume() {
      if (state !== 'held') return { failure: state }
      state = 'consumed'
      return { ok: seat }
    },
    release() {
      if (state !== 'held') return
      state = 'released'
      returnSlot()
    },
  }
}
