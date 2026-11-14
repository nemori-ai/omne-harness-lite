import type { TenantId } from '@omne-harness/legal-identity'
import type { CancelAnswer, CorrelationKey, Generation } from '@omne-harness/mcp-contract'
import type { ConnectionView } from './entry.ts'
import { tenantTextOf } from './text.ts'

export type InFlightKey = Readonly<{
  tenant: TenantId
  principalKey: string
  correlationKey: CorrelationKey
}>

export type Reservation = Readonly<{
  stop: AbortSignal
  recordSent(connection: ConnectionView, generation: Generation): void
  conclude(): void
}>

type Stopping = Readonly<{ stop: AbortSignal; cancel: AbortController }>

type Place =
  | (Readonly<{ phase: 'reserved' }> & Stopping)
  | (Readonly<{ phase: 'sent'; generation: Generation; connection: ConnectionView }> & Stopping)
  | Readonly<{ phase: 'ended' }>

type Cell = { place: Place }

const ENDED: Place = { phase: 'ended' }

function textOf(key: InFlightKey): string {
  return JSON.stringify([tenantTextOf(key.tenant), key.principalKey, key.correlationKey])
}

export class InFlightCalls {
  readonly #cells = new Map<string, Cell>()

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
        if (cell.place.phase === 'ended') return
        if (cell.place.phase === 'reserved' && !stop.aborted) this.#cells.delete(text)
        cell.place = ENDED
      },
    }
  }

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
