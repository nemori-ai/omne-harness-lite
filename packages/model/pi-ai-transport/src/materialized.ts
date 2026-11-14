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
import { retryBeforeRequestSent } from './retry.ts'
import { digestOf, firstModelVisibleReference, serializeBody } from './payload.ts'
import type { SendEnd } from './termination.ts'

export type MaterializedHandle = MaterializedTransport

export type MaterializeInput = Readonly<{
  config: CheckedConfig
  route: CheckedRoute
  request: FixedModelRequest
  supplier: Supplier
  declaration: ReplayDeclaration
  resent: TransportDispatch['resent']
  binding: PiFamilyBinding
  signal: AbortSignal
}>

type MaterializedPhase =
  | Readonly<{ kind: 'held'; reservation: ConnectionReservation; body: Uint8Array }>
  | Readonly<{ kind: 'started'; exchange: HttpExchange | null }>
  | Readonly<{ kind: 'closed'; done: Promise<void> }>

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

function tell(
  observer: CheckedConfig['onConnectRetry'],
  event: Parameters<NonNullable<CheckedConfig['onConnectRetry']>>[0],
): void {
  try {
    observer?.(Object.freeze({ ...event }))
  } catch {}
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

  function send(
    held: Extract<MaterializedPhase, Readonly<{ kind: 'held' }>>,
    signal: AbortSignal,
  ): AsyncIterable<TransportFact> {
    const { config, route } = input
    if (signal.aborted || config.network.closed) return refusedBeforeSend(held, { kind: 'stopped' })
    const secrets = config.credential.read()
    const secret = route.auth === null ? null : secrets?.get(route.auth.item)
    if (secrets === undefined || secret === undefined)
      return refusedBeforeSend(held, { kind: 'credential-missing' })
    const decoder = input.binding.createDecoder({
      request: input.request,
      accounting: route.accounting,
    })
    const exchangeInput = {
      url: route.url,
      headers: {
        ...(secret !== null && { authorization: `Bearer ${secret}` }),
        'content-type': 'application/json',
        accept: 'text/event-stream',
      },
      body: held.body,
      connectTimeoutMs: config.limits.connectTimeoutMs,
      streamStallTimeoutMs: config.limits.streamStallTimeoutMs,
      maxErrorBodyBytes: config.limits.maxErrorBodyBytes,
    }
    const started = startExchange(
      config.network,
      { ...exchangeInput, reservation: held.reservation },
      signal,
    )
    if (started.kind === 'refused') return endedBeforeSend(endOfRefusal(started.reason))
    const exchange =
      config.limits.connectRetry === undefined || config.limits.connectRetry.backoffMs.length === 0
        ? started.exchange
        : retryBeforeRequestSent({
            capacity: config.network.capacity,
            diagnostics: {
              emit: event => {
                config.network.diagnostics.emit(event)
                if (event.kind === 'connect-retry') tell(config.onConnectRetry, event)
              },
            },
            closed: () => config.network.closed,
            first: started.exchange,
            startAgain: (reservation, again) =>
              startExchange(config.network, { ...exchangeInput, reservation }, again),
            backoffMs: config.limits.connectRetry.backoffMs,
            signal,
          })
    phase = { kind: 'started', exchange }
    return factsOfSend({
      exchange,
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
        case 'started':
          return noFacts()
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
