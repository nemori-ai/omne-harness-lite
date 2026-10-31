// One send of the pi transport: materialize fixes the payload under a capacity reservation, and
// the materialized transport holds that reservation until start consumes it or close returns it.
import type {
  FixedModelRequest,
  MaterializationReceipt,
  ReplayDeclaration,
  Supplier,
  TransportFailure,
} from '@omne-harness/model-contract'
import type {
  MaterializedTransport,
  ProviderDiagnostic,
  TransportDispatch,
  TransportFact,
} from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import type { ConnectionReservation } from './capacity.ts'
import type { CheckedConfig, CheckedRoute } from './config.ts'
import type { PiFamilyBinding } from './family.ts'
import { startExchange, type ExchangeRefusal, type HttpExchange } from './http.ts'
import { endedBeforeSend, factsOfSend, noFacts } from './fact-stream.ts'
import { digestOf, firstModelVisibleReference, serializeBody } from './payload.ts'
import type { SendEnd } from './termination.ts'

export type MaterializedHandle = MaterializedTransport

export type MaterializeInput = Readonly<{
  config: CheckedConfig
  route: CheckedRoute
  request: FixedModelRequest
  supplier: Supplier
  /** The replay declaration that the request fixes for the supplier. */
  declaration: ReplayDeclaration
  /** The messages that this dispatch must treat as unable to continue. */
  resent: TransportDispatch['resent']
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
 * through the family, and fixes the bytes and their digest in the receipt, and the diagnostics of
 * the encoding for the facts of the send. Every failure, a thrown one included, returns the
 * reservation. Nothing is sent.
 */
export async function materialize(
  input: MaterializeInput,
): Promise<Outcome<MaterializedHandle, TransportFailure>> {
  const { config, request, supplier, declaration, resent, binding, signal } = input
  const reservation = await config.network.capacity.reserve(signal)
  if (reservation === undefined)
    return { failure: capacityUnavailable(signal.aborted ? 'cancelled' : 'network-closed') }
  let handedOver = false
  try {
    if (signal.aborted) return { failure: capacityUnavailable('cancelled') }
    const reference = firstModelVisibleReference(request)
    if (reference !== null)
      return { failure: { kind: 'unsupported', field: reference, adapter: binding.adoption } }
    const encoded = binding.encode({ request, media: [], declaration, resent })
    if (!('ok' in encoded)) return encoded
    const body = serializeBody(encoded.ok.body)
    const diagnostics = Object.freeze([...encoded.ok.diagnostics])
    const { replayFormat } = binding
    const receipt: MaterializationReceipt = Object.freeze({
      supplier: supplier.adoption,
      representation: request.representation,
      payloadDigest: digestOf(body),
      ...(replayFormat === null ? {} : { replayFormat }),
    })
    const materialized = createMaterialized({
      ...input,
      reservation,
      body,
      receipt,
      diagnostics,
    })
    handedOver = true
    return { ok: materialized }
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
      diagnostics: readonly ProviderDiagnostic[]
    }>,
): MaterializedHandle {
  let phase: MaterializedPhase = {
    kind: 'held',
    reservation: input.reservation,
    body: input.body,
  }

  /**
   * Reads the credential and sends at once, inside this synchronous call. A send that does not
   * leave the transport returns the reservation and gives a stream with only its termination.
   */
  function send(
    held: Extract<MaterializedPhase, Readonly<{ kind: 'held' }>>,
    signal: AbortSignal,
  ): AsyncIterable<TransportFact> {
    const { config, route } = input
    // A cancel or a closed network wins over a missing credential: nothing could be sent.
    if (signal.aborted || config.network.closed) return refusedBeforeSend(held, { kind: 'stopped' })
    const secret = config.credential.read()
    if (secret === undefined) return refusedBeforeSend(held, { kind: 'credential-missing' })
    const decoder = input.binding.createDecoder()
    const started = startExchange(
      config.network,
      {
        url: route.url,
        headers: {
          authorization: `Bearer ${secret}`,
          'content-type': 'application/json',
          accept: 'text/event-stream',
        },
        body: held.body,
        reservation: held.reservation,
        connectTimeoutMs: config.limits.connectTimeoutMs,
        maxErrorBodyBytes: config.limits.maxErrorBodyBytes,
      },
      signal,
    )
    // startExchange returned the reservation for a refusal.
    if (started.kind === 'refused') return endedBeforeSend(endOfRefusal(started.reason))
    phase = { kind: 'started', exchange: started.exchange }
    return factsOfSend({
      exchange: started.exchange,
      decoder,
      route,
      limits: config.limits,
      diagnostics: input.diagnostics,
    })
  }

  function refusedBeforeSend(
    held: Extract<MaterializedPhase, Readonly<{ kind: 'held' }>>,
    end: SendEnd,
  ): AsyncIterable<TransportFact> {
    held.reservation.release()
    return endedBeforeSend(end)
  }

  async function stopExchange(exchange: HttpExchange | null): Promise<void> {
    if (exchange === null) return
    exchange.stop()
    await exchange.stopped
  }

  return {
    receipt: input.receipt,
    start(signal: AbortSignal): AsyncIterable<TransportFact> {
      const current = phase
      switch (current.kind) {
        case 'held':
          break
        // A repeated start is a usage error: nothing is sent and nothing ends.
        case 'started':
          return noFacts()
        // Every close stops the send before it leaves, as the close of the network does.
        case 'closed':
          return endedBeforeSend({ kind: 'stopped' })
        default: {
          const _exhaustive: never = current
          return _exhaustive
        }
      }
      phase = { kind: 'started', exchange: null }
      try {
        return send(current, signal)
      } catch (error) {
        current.reservation.release()
        throw error
      }
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

/**
 * The end of a send that `startExchange` refused. The headers other than the credential are
 * fixed, so an invalid header is the credential. The route, the body, the limits and the
 * reservation were checked before: their refusal is a defect of this package.
 */
function endOfRefusal(reason: ExchangeRefusal): SendEnd {
  switch (reason) {
    case 'cancelled':
    case 'resources-closed':
      return { kind: 'stopped' }
    case 'invalid-header':
      return { kind: 'credential-unusable' }
    case 'invalid-url':
    case 'invalid-body':
    case 'invalid-limit':
    case 'reservation-unusable':
      throw new Error(`the exchange of a checked send was refused as ${reason}`)
    default: {
      const _exhaustive: never = reason
      return _exhaustive
    }
  }
}
