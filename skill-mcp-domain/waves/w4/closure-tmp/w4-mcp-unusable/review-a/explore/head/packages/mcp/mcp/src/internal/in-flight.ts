// The in-flight table of calls (SPEC S2, MC-12): keyed by tenant, principal and correlation key.
// The reservation is the duplicate check and the placeholder in one step, and it hands out the
// one stop signal of the call: the caller's signal and this table's `cancel`, as one. The call
// port holds the place through the handle `reserve` answers, waits under its stop signal from
// the reservation to the answer, and concludes the place once, by the phase the table recorded:
// a sent call has ended; a call not sent has ended when its stop signal fired, else it gives its
// place back. The phase lives in the table only. Entries stay for the run; an ended key is not
// deleted. The call port keeps the request identifier itself; the table only answers whether a
// sent call is still current.
import type { TenantId } from '@omne-harness/legal-identity'
import type { CancelAnswer, CorrelationKey, Generation } from '@omne-harness/mcp-contract'
import type { ConnectionView } from './entry.ts'
import { tenantTextOf } from './text.ts'

export type InFlightKey = Readonly<{
  tenant: TenantId
  /** The text of the principal, from `McpConfig.principalKey`. */
  principalKey: string
  correlationKey: CorrelationKey
}>

/**
 * The place of one call, held from `reserve` to `conclude`: its stop signal, the record of its
 * send, and its one conclusion.
 */
export type Reservation = Readonly<{
  /** The stop signal of the call: the caller's `signal` and this table's `cancel`, as one. */
  stop: AbortSignal
  /**
   * The call left on `connection` at `generation`: the generation the request was sent on
   * (MC-16 step 10). A `call` that breached its contract counts as sent (T9). Only a place still
   * reserved records it; after the conclusion it changes nothing.
   */
  recordSent(connection: ConnectionView, generation: Generation): void
  /**
   * The one conclusion of the call (MC-16 step 13). A sent call has ended. A call not sent has
   * ended when its stop signal fired: the call existed and was cancelled, so a later `cancel`
   * answers `no-call-in-flight`. A call not sent otherwise gives its place back: a later
   * `cancel` answers `unknown`. Either way the handle's place is ended from then on.
   */
  conclude(): void
}>

/** The stop signal of a call, and the controller `cancel` fires into it. */
type Stopping = Readonly<{ stop: AbortSignal; cancel: AbortController }>

type Place =
  | (Readonly<{ phase: 'reserved' }> & Stopping)
  | (Readonly<{ phase: 'sent'; generation: Generation; connection: ConnectionView }> & Stopping)
  | Readonly<{ phase: 'ended' }>

/** The place of a key as the table and the reservation that holds it both see it. */
type Cell = { place: Place }

const ENDED: Place = { phase: 'ended' }

function textOf(key: InFlightKey): string {
  return JSON.stringify([tenantTextOf(key.tenant), key.principalKey, key.correlationKey])
}

export class InFlightCalls {
  readonly #cells = new Map<string, Cell>()

  /**
   * Checks for a duplicate and takes the place in one step; an ended key is free again. Answers
   * the reservation, with the stop signal of the call.
   */
  reserve(key: InFlightKey, signal: AbortSignal): Reservation | 'in-use' {
    const text = textOf(key)
    const existing = this.#cells.get(text)
    if (existing !== undefined && existing.place.phase !== 'ended') return 'in-use'
    const cancel = new AbortController()
    const stop = AbortSignal.any([signal, cancel.signal])
    const cell: Cell = { place: { phase: 'reserved', stop, cancel } }
    this.#cells.set(text, cell)
    return {
      stop,
      recordSent: (connection, generation) => {
        if (cell.place.phase !== 'reserved') return
        cell.place = { phase: 'sent', generation, connection, stop, cancel }
      },
      conclude: () => {
        // A cell not ended is the one its key holds: `reserve` replaces ended cells only.
        if (cell.place.phase === 'ended') return
        if (cell.place.phase === 'reserved' && !stop.aborted) this.#cells.delete(text)
        cell.place = ENDED
      },
    }
  }

  /**
   * Finds the call by its key only; no adoption or eligibility is asked. A key not in the table is
   * `unknown`: the table cannot tell "never sent" from "sent before a restart". A sent call whose
   * connection generation is not current any more is `unknown` too. A signalled call's stop
   * signal fires: a reserved call is not sent, a sent call stops waiting for the peer.
   */
  cancel(key: InFlightKey): CancelAnswer {
    const cell = this.#cells.get(textOf(key))
    if (cell === undefined) return 'unknown'
    const { place } = cell
    switch (place.phase) {
      case 'ended':
        return 'no-call-in-flight'
      case 'reserved':
        place.cancel.abort()
        return 'signalled'
      case 'sent':
        if (!place.connection.isCurrent(place.generation)) return 'unknown'
        place.cancel.abort()
        return 'signalled'
      default: {
        const exhaustive: never = place
        return exhaustive
      }
    }
  }
}
