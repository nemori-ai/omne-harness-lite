// The in-flight table of calls (SPEC S2): keyed by tenant, principal and correlation key. The
// reservation is the duplicate check and the placeholder in one step. Entries stay for the run;
// an ended key is not deleted. Each reservation carries the signal that a `cancel` fires, so the
// call port stops waiting for the peer when the call is cancelled; the call port keeps the
// request identifier itself, the table only answers whether the call is still current.
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

type Entry =
  | Readonly<{ phase: 'reserved'; cancelled: boolean; stop: AbortController }>
  | Readonly<{
      phase: 'sent'
      generation: Generation
      connection: ConnectionView
      stop: AbortController
    }>
  | Readonly<{ phase: 'ended' }>

function textOf(key: InFlightKey): string {
  return JSON.stringify([tenantTextOf(key.tenant), key.principalKey, key.correlationKey])
}

export class InFlightCalls {
  readonly #entries = new Map<string, Entry>()

  /** Checks for a duplicate and takes the place in one step. An ended key is free again. */
  reserve(key: InFlightKey): 'reserved' | 'in-use' {
    const text = textOf(key)
    const existing = this.#entries.get(text)
    if (existing !== undefined && existing.phase !== 'ended') return 'in-use'
    this.#entries.set(text, { phase: 'reserved', cancelled: false, stop: new AbortController() })
    return 'reserved'
  }

  /**
   * The signal that `cancel` fires for a reserved or sent call: the call port waits under it.
   * Undefined for a key that is not in flight.
   */
  stopOf(key: InFlightKey): AbortSignal | undefined {
    const entry = this.#entries.get(textOf(key))
    return entry === undefined || entry.phase === 'ended' ? undefined : entry.stop.signal
  }

  /**
   * The call left on `connection`, at its generation of this moment. A cancel that came while the
   * key was only reserved makes the answer `cancelled`: the call is on the wire, and the caller
   * treats it as cancelled after the send; the key ends.
   */
  markSent(key: InFlightKey, connection: ConnectionView): 'sent' | 'cancelled' {
    const text = textOf(key)
    const entry = this.#entries.get(text)
    if (entry?.phase !== 'reserved')
      throw new TypeError('markSent needs a reserved key; reserve it first')
    if (entry.cancelled) {
      this.#entries.set(text, { phase: 'ended' })
      return 'cancelled'
    }
    this.#entries.set(text, {
      phase: 'sent',
      generation: connection.generation,
      connection,
      stop: entry.stop,
    })
    return 'sent'
  }

  /** The call has its outcome. The key stays, as ended, for the rest of the run. */
  markEnded(key: InFlightKey): void {
    this.#entries.set(textOf(key), { phase: 'ended' })
  }

  /** Withdraws a reservation that a check before the send refused. A sent entry stays. */
  release(key: InFlightKey): void {
    const text = textOf(key)
    if (this.#entries.get(text)?.phase === 'reserved') this.#entries.delete(text)
  }

  /**
   * Finds the call by its key only; no adoption or eligibility is asked. A key not in the table is
   * `unknown`: the table cannot tell "never sent" from "sent before a restart". A sent call whose
   * connection generation is not current any more is `unknown` too. A signalled call's stop
   * signal fires: a reserved call is not sent, a sent call stops waiting for the peer.
   */
  cancel(key: InFlightKey): CancelAnswer {
    const text = textOf(key)
    const entry = this.#entries.get(text)
    if (entry === undefined) return 'unknown'
    switch (entry.phase) {
      case 'ended':
        return 'no-call-in-flight'
      case 'reserved':
        this.#entries.set(text, { ...entry, cancelled: true })
        entry.stop.abort()
        return 'signalled'
      case 'sent':
        if (!entry.connection.isCurrent(entry.generation)) return 'unknown'
        entry.stop.abort()
        return 'signalled'
      default: {
        const exhaustive: never = entry
        return exhaustive
      }
    }
  }
}
