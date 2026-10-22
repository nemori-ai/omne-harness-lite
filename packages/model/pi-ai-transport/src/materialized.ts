// One send of the pi transport: materialize fixes the payload under a capacity reservation, and
// the materialized transport holds that reservation until start consumes it or close returns it.
import type {
  FixedModelRequest,
  MaterializationReceipt,
  MaterializedTransport,
  Supplier,
  TransportFact,
  TransportFailure,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type { ConnectionReservation } from './capacity.ts'
import type { CheckedConfig, CheckedRoute } from './config.ts'
import type { PiFamilyBinding } from './family.ts'
import type { HttpExchange } from './http.ts'
import { digestOf, firstModelVisibleReference, serializeBody } from './payload.ts'

export type MaterializedHandle = MaterializedTransport

export type MaterializeInput = Readonly<{
  config: CheckedConfig
  route: CheckedRoute
  request: FixedModelRequest
  supplier: Supplier
  binding: PiFamilyBinding
  /** The caller's signal, joined with the close of the prepared transport. */
  signal: AbortSignal
}>

/**
 * `held`: owns the reservation and the encoded body; nothing was sent. `started`: start ran
 * once; the exchange, if one started, owns the slot. `closed`: the reservation is back or the
 * exchange has physically stopped once `done` resolves.
 */
type MaterializedPhase =
  | Readonly<{ kind: 'held'; reservation: ConnectionReservation; body: Uint8Array }>
  | Readonly<{ kind: 'started'; exchange: HttpExchange | null }>
  | Readonly<{ kind: 'closed'; done: Promise<void> }>

/**
 * Reserves a connection slot, refuses a request with a content reference, encodes the request
 * through the family, and fixes the bytes and their digest in the receipt. Every failure, a
 * thrown one included, returns the reservation. Nothing is sent.
 */
export async function materialize(
  input: MaterializeInput,
): Promise<Outcome<MaterializedHandle, TransportFailure>> {
  const { config, request, supplier, binding, signal } = input
  const reservation = await config.network.capacity.reserve(signal)
  if (reservation === undefined)
    return { failure: capacityUnavailable(signal.aborted ? 'cancelled' : 'network-closed') }
  let handedOver = false
  try {
    if (signal.aborted) return { failure: capacityUnavailable('cancelled') }
    const reference = firstModelVisibleReference(request)
    if (reference !== null)
      return { failure: { kind: 'unsupported', field: reference, adapter: binding.adoption } }
    const encoded = binding.encode({ request, media: [] })
    if (!('ok' in encoded)) return encoded
    const body = serializeBody(encoded.ok.body)
    const receipt: MaterializationReceipt = Object.freeze({
      supplier: supplier.adoption,
      representation: request.representation,
      payloadDigest: digestOf(body),
    })
    handedOver = true
    return { ok: createMaterialized({ ...input, reservation, body, receipt }) }
  } finally {
    if (!handedOver) reservation.release()
  }
}

function capacityUnavailable(diagnostic: 'cancelled' | 'network-closed'): TransportFailure {
  return { kind: 'unavailable', dependency: 'connection-capacity', diagnostic }
}

function createMaterialized(
  input: MaterializeInput &
    Readonly<{
      reservation: ConnectionReservation
      body: Uint8Array
      receipt: MaterializationReceipt
    }>,
): MaterializedHandle {
  let phase: MaterializedPhase = {
    kind: 'held',
    reservation: input.reservation,
    body: input.body,
  }

  async function stopExchange(exchange: HttpExchange | null): Promise<void> {
    if (exchange === null) return
    exchange.stop()
    await exchange.stopped
  }

  return {
    receipt: input.receipt,
    start(_signal: AbortSignal): AsyncIterable<TransportFact> {
      throw new Error('start is not implemented yet')
    },
    close() {
      const current = phase
      switch (current.kind) {
        case 'closed':
          return current.done
        case 'held':
          current.reservation.release()
          phase = { kind: 'closed', done: Promise.resolve() }
          return phase.done
        case 'started': {
          const done = stopExchange(current.exchange)
          phase = { kind: 'closed', done }
          return done
        }
        default: {
          const _exhaustive: never = current
          return _exhaustive
        }
      }
    },
  }
}
