// The in-flight table of calls (SPEC S2): keyed by tenant, principal and correlation key. The
// reservation is the duplicate check and the placeholder in one step. Entries stay for the run;
// an ended key is not deleted. This wave builds the table; the call port of the next wave uses it.
import type { TenantId } from '@omne-harness/legal-identity'
import type { CancelAnswer, CorrelationKey, Generation } from '@omne-harness/mcp-contract'
import { tenantTextOf } from './text.ts'

export type InFlightKey = Readonly<{
  tenant: TenantId
  /** The text of the principal, from `McpConfig.principalKey`. */
  principalKey: string
  correlationKey: CorrelationKey
}>

type Entry =
  | Readonly<{ phase: 'reserved'; cancelled: boolean }>
  | Readonly<{ phase: 'sent'; requestId: string; generation: Generation }>
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
    this.#entries.set(text, { phase: 'reserved', cancelled: false })
    return 'reserved'
  }

  /**
   * The call left on `generation` as `requestId`. A cancel that came while the key was only
   * reserved makes the answer `cancelled`: the caller answers "not sent" and the key ends.
   */
  markSent(key: InFlightKey, requestId: string, generation: Generation): 'sent' | 'cancelled' {
    const text = textOf(key)
    const entry = this.#entries.get(text)
    if (entry?.phase !== 'reserved')
      throw new TypeError('markSent needs a reserved key; reserve it first')
    if (entry.cancelled) {
      this.#entries.set(text, { phase: 'ended' })
      return 'cancelled'
    }
    this.#entries.set(text, { phase: 'sent', requestId, generation })
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
   * generation is not `currentGeneration` is `unknown` too.
   */
  cancel(key: InFlightKey, currentGeneration: Generation): CancelAnswer {
    const text = textOf(key)
    const entry = this.#entries.get(text)
    if (entry === undefined) return 'unknown'
    switch (entry.phase) {
      case 'ended':
        return 'no-call-in-flight'
      case 'reserved':
        this.#entries.set(text, { phase: 'reserved', cancelled: true })
        return 'signalled'
      case 'sent':
        return entry.generation === currentGeneration ? 'signalled' : 'unknown'
      default: {
        const exhaustive: never = entry
        return exhaustive
      }
    }
  }

  /** The request identifier of a sent call, for the cancel notification. */
  requestIdOf(key: InFlightKey): string | undefined {
    const entry = this.#entries.get(textOf(key))
    return entry?.phase === 'sent' ? entry.requestId : undefined
  }
}
