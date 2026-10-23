// The fact stream of one started send: SSE events, then protocol frames, then the family decoder,
// and exactly one `ended` at the end, after the exchange has physically stopped.
import type {
  ModelFault,
  ProviderDiagnostic,
  TransportFact,
  TransportTermination,
} from '@omne-harness/model-contract'
import type { CheckedRoute, PiTransportLimits } from './config.ts'
import type { PiResponseDecoder } from './family.ts'
import { readProtocolFrames } from './frames.ts'
import { ResponseBodyReadError, ResponseBodyStoppedError, type HttpExchange } from './http.ts'
import { closeSourceOnEarlyEnd } from './iteration.ts'
import { readSseEvents, SseProtocolError } from './sse.ts'
import { terminationOf, type SendEnd } from './termination.ts'

export type SendInput = Readonly<{
  exchange: HttpExchange
  decoder: PiResponseDecoder
  route: CheckedRoute
  limits: PiTransportLimits
  /** The diagnostics of the encoding of the request that this exchange sent. */
  diagnostics: readonly ProviderDiagnostic[]
}>

/**
 * The facts of a started exchange: the diagnostics of the encoding first, then the facts of the
 * response. A reader that ends the stream early, even before its first `next()`, stops the
 * exchange and waits for its physical stop.
 */
export function factsOfSend(input: SendInput): AsyncGenerator<TransportFact, void, undefined> {
  const { exchange } = input
  return closeSourceOnEarlyEnd(readSend(input), () => {
    exchange.stop()
    return exchange.stopped
  })
}

/** A stream that gives only the termination of a send that never left the transport. */
export async function* endedBeforeSend(
  end: SendEnd,
): AsyncGenerator<TransportFact, void, undefined> {
  yield { kind: 'ended', termination: terminationOf(end) }
}

/** The stream of a repeated start: no fact. */
export async function* noFacts(): AsyncGenerator<TransportFact, void, undefined> {}

/** `true` once the 2xx body was read to its end, so the exchange closes by itself. */
export type Progress = { bodyComplete: boolean }

async function* readSend(input: SendInput): AsyncGenerator<TransportFact, void, undefined> {
  const { exchange } = input
  const progress: Progress = { bodyComplete: false }
  let end: SendEnd
  try {
    for (const value of input.diagnostics) yield { kind: 'diagnostic', value }
    end = yield* decodeSend(input, progress)
  } finally {
    // A body left unread keeps the connection and the slot; only a complete one closes by itself.
    if (!progress.bodyComplete) exchange.stop()
    await exchange.stopped
  }
  yield { kind: 'ended', termination: terminationOf(end) }
}

/** Gives every fact but the termination, and returns how the send ended. */
async function* decodeSend(
  input: SendInput,
  progress: Progress,
): AsyncGenerator<TransportFact, SendEnd, undefined> {
  const { exchange, decoder, route, limits } = input
  const result = await exchange.result
  switch (result.kind) {
    case 'stopped':
      return { kind: 'stopped' }
    case 'connect-failed':
      return { kind: 'connect-failed', timeout: result.timeout }
    case 'http-error':
      return { kind: 'http-error', status: result.status }
    case 'ok':
      break
    default: {
      const _exhaustive: never = result
      return _exhaustive
    }
  }
  const body = result.body.claim()
  if (body === undefined) throw new Error('the response body of a new exchange was claimed')
  return yield* decodeBody({
    body,
    decoder,
    endMarker: route.endMarker,
    limits,
    received: () => result.body.received(),
    progress,
  })
}

export type BodyInput = Readonly<{
  body: AsyncIterable<Uint8Array>
  decoder: PiResponseDecoder
  endMarker: string | null
  limits: Pick<PiTransportLimits, 'maxEventBytes' | 'json'>
  /** `true` when the whole body was already read when the end marker arrived. */
  received(): boolean
  progress: Progress
}>

/**
 * Gives every fact of a 2xx body but the termination, and returns how the send ended. The frames
 * of the body go through the decoder; the decoder's `ended` is kept and checked to be the only one.
 * When the body, a frame or the decoder fails, the decoder still ends once, so that a response that
 * reached its finish gives the account of the usage it received before the failed `ended`.
 */
export async function* decodeBody(
  input: BodyInput,
): AsyncGenerator<TransportFact, SendEnd, undefined> {
  const { decoder } = input
  const held: Held = { termination: null }
  const failed = yield* readBody(input, held)
  if (failed !== null) {
    yield* settleAfterFailure(decoder)
    return failed
  }
  const ending = decoder.end()
  if (!('ok' in ending)) return { kind: 'decoder-fault', fault: ending.failure }
  const fault = yield* passFacts(ending.ok, held)
  if (fault !== null) return { kind: 'decoder-fault', fault }
  return { kind: 'decoded', termination: held.termination }
}

/** Reads the body until the protocol ends. Returns how it failed, or `null` when it ended. */
async function* readBody(
  input: BodyInput,
  held: Held,
): AsyncGenerator<TransportFact, SendEnd | null, undefined> {
  const { body, decoder, endMarker, limits, progress } = input
  const frames = readProtocolFrames(readSseEvents(body, limits.maxEventBytes), {
    endMarker,
    json: limits.json,
  })
  // The frames end at the end of the body, unless the end marker stops the reading first.
  let bodyComplete = true
  try {
    for await (const frame of frames) {
      if (!('ok' in frame)) return { kind: 'frame-failed', reason: frame.failure }
      const accepted = decoder.accept(frame.ok)
      if (!('ok' in accepted)) return { kind: 'decoder-fault', fault: accepted.failure }
      const fault = yield* passFacts(accepted.ok, held)
      if (fault !== null) return { kind: 'decoder-fault', fault }
      if (frame.ok.kind === 'end-marker') {
        // The protocol ended: nothing after the marker is decoded and the body end is not awaited.
        // `received()` alone decides: `Readable.read()` hands over the whole buffered body in one
        // chunk, so a body that Node holds whole was consumed with the marker's frame and the
        // connection stays pooled. A body still open is stopped.
        bodyComplete = input.received()
        break
      }
    }
  } catch (error) {
    if (error instanceof ResponseBodyStoppedError) return { kind: 'stopped' }
    if (error instanceof ResponseBodyReadError) return { kind: 'body-lost' }
    if (error instanceof SseProtocolError) return { kind: 'sse-failed', reason: error.reason }
    throw error
  }
  progress.bodyComplete = bodyComplete
  return null
}

/**
 * Ends the decoder after a failed read and gives its facts but its `ended`: the failure decides
 * the termination. A decoder that had not finished, or whose end fails, gives nothing.
 */
async function* settleAfterFailure(
  decoder: PiResponseDecoder,
): AsyncGenerator<TransportFact, void, undefined> {
  const settled = decoder.end()
  if (!('ok' in settled)) return
  for (const fact of settled.ok) if (fact.kind !== 'ended') yield fact
}

/** The decoder's termination, kept until the body has ended so that it is the last fact. */
type Held = { termination: TransportTermination | null }

/** Gives the facts and keeps the decoder's `ended`. A second `ended` is a fault of the protocol. */
async function* passFacts(
  facts: readonly TransportFact[],
  held: Held,
): AsyncGenerator<TransportFact, ModelFault | null, undefined> {
  for (const fact of facts) {
    if (fact.kind !== 'ended') {
      yield fact
      continue
    }
    if (held.termination !== null) return SECOND_TERMINATION
    held.termination = fact.termination
  }
  return null
}

const SECOND_TERMINATION: ModelFault = Object.freeze({
  cause: 'upstream-protocol',
  diagnostic: 'decoder-ended-twice',
  upstreamStatus: null,
})
