import type { Outcome } from '@omne-harness/operation-result'

export type ReservationState = 'held' | 'consumed' | 'released'

export type ConsumeRefusal = Exclude<ReservationState, 'held'>

export interface ConsumedSeat {
  release(): void
}

export interface ConnectionReservation {
  readonly state: ReservationState
  consume(): Outcome<ConsumedSeat, ConsumeRefusal>
  release(): void
}

export interface ConnectionCapacity {
  reserve(signal: AbortSignal): Promise<ConnectionReservation | undefined>
  owns(candidate: unknown): candidate is ConnectionReservation
  close(): void
}

interface Waiter {
  readonly grant: (reservation: ConnectionReservation) => void
  readonly cancel: () => void
}

export function createConnectionCapacity(maximum: number): ConnectionCapacity {
  if (!Number.isSafeInteger(maximum) || maximum < 1)
    throw new RangeError('connection capacity must be a positive integer')
  const waiting: Waiter[] = []
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
