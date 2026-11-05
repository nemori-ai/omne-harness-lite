// The in-flight table of calls (SPEC S2, MC-12): keyed by tenant, principal and correlation key.
// The reservation is the duplicate check and the placeholder in one step, and it hands out the
// one stop signal of the call: the caller's signal and this table's `cancel`, as one. The call
// port waits under it from the reservation to the answer and concludes the key once, by the phase
// the call reached: a sent call has ended; a call not sent has ended when its stop signal fired,
// else it gives its place back. Entries stay for the run; an ended key is not deleted. The call
// port keeps the request identifier itself; the table only answers whether a sent call is still
// current.
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

/** How far a call got when it concludes: not sent, or sent to the peer. */
export type CallPhase = 'unsent' | 'sent'

/** The stop signal of a call, and the controller `cancel` fires into it. */
type Stopping = Readonly<{ stop: AbortSignal; cancel: AbortController }>

type Entry =
  | (Readonly<{ phase: 'reserved' }> & Stopping)
  | (Readonly<{ phase: 'sent'; generation: Generation; connection: ConnectionView }> & Stopping)
  | Readonly<{ phase: 'ended' }>

function textOf(key: InFlightKey): string {
  return JSON.stringify([tenantTextOf(key.tenant), key.principalKey, key.correlationKey])
}

export class InFlightCalls {
  readonly #entries = new Map<string, Entry>()

  /**
   * Checks for a duplicate and takes the place in one step; an ended key is free again. Answers
   * the stop signal of the call: the caller's `signal` and this table's `cancel`, as one.
   */
  reserve(key: InFlightKey, signal: AbortSignal): AbortSignal | 'in-use' {
    const text = textOf(key)
    const existing = this.#entries.get(text)
    if (existing !== undefined && existing.phase !== 'ended') return 'in-use'
    const cancel = new AbortController()
    const stop = AbortSignal.any([signal, cancel.signal])
    this.#entries.set(text, { phase: 'reserved', stop, cancel })
    return stop
  }

  /** The call left on `connection` at `generation`: the generation the request was sent on. */
  markSent(key: InFlightKey, connection: ConnectionView, generation: Generation): void {
    const text = textOf(key)
    const entry = this.#entries.get(text)
    if (entry?.phase !== 'reserved')
      throw new TypeError('markSent needs a reserved key; reserve it first')
    const { stop, cancel } = entry
    this.#entries.set(text, { phase: 'sent', generation, connection, stop, cancel })
  }

  /**
   * The one conclusion of a call (MC-16 step 13). A sent call has ended. A call not sent has
   * ended when its stop signal fired: the call existed and was cancelled, so a later `cancel`
   * answers `no-call-in-flight`. A call not sent otherwise gives its place back: a later `cancel`
   * answers `unknown`. A key that is not in flight is left as it is.
   */
  conclude(key: InFlightKey, phase: CallPhase): void {
    const text = textOf(key)
    const entry = this.#entries.get(text)
    if (entry === undefined || entry.phase === 'ended') return
    if (phase === 'sent' || entry.stop.aborted) this.#entries.set(text, { phase: 'ended' })
    else this.#entries.delete(text)
  }

  /**
   * Finds the call by its key only; no adoption or eligibility is asked. A key not in the table is
   * `unknown`: the table cannot tell "never sent" from "sent before a restart". A sent call whose
   * connection generation is not current any more is `unknown` too. A signalled call's stop
   * signal fires: a reserved call is not sent, a sent call stops waiting for the peer.
   */
  cancel(key: InFlightKey): CancelAnswer {
    const entry = this.#entries.get(textOf(key))
    if (entry === undefined) return 'unknown'
    switch (entry.phase) {
      case 'ended':
        return 'no-call-in-flight'
      case 'reserved':
        entry.cancel.abort()
        return 'signalled'
      case 'sent':
        if (!entry.connection.isCurrent(entry.generation)) return 'unknown'
        entry.cancel.abort()
        return 'signalled'
      default: {
        const exhaustive: never = entry
        return exhaustive
      }
    }
  }
}
