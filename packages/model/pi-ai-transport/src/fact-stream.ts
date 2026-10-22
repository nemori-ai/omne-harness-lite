// The fact stream of one started send: SSE events, then protocol frames, then the family decoder,
// and exactly one `ended` at the end, after the exchange has physically stopped.
import type { ModelFault, TransportFact, TransportTermination } from '@omne-harness/model-contract'
import type { CheckedRoute, PiTransportLimits } from './config.ts'
import type { PiResponseDecoder } from './family.ts'
import { readProtocolFrames, type ProtocolFrames } from './frames.ts'
import { ResponseBodyReadError, ResponseBodyStoppedError, type HttpExchange } from './http.ts'
import { closeSourceOnEarlyEnd } from './iteration.ts'
import { readSseEvents, SseProtocolError } from './sse.ts'
import { terminationOf, type SendEnd } from './termination.ts'

export type SendInput = Readonly<{
  exchange: HttpExchange
  decoder: PiResponseDecoder
  route: CheckedRoute
  limits: PiTransportLimits
}>

/**
 * The facts of a started exchange. A reader that ends the stream early, even before its first
 * `next()`, stops the exchange and waits for its physical stop.
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
type Progress = { bodyComplete: boolean }

async function* readSend(input: SendInput): AsyncGenerator<TransportFact, void, undefined> {
  const { exchange } = input
  const progress: Progress = { bodyComplete: false }
  let end: SendEnd
  try {
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
  const frames = readProtocolFrames(readSseEvents(body, limits.maxEventBytes), {
    endMarker: route.endMarker,
    json: limits.json,
  })
  const held: Held = { termination: null }
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
        // A body that Node already holds whole is read to its end, so the connection stays pooled.
        bodyComplete = result.body.received() && (await endsAfterMarker(frames))
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
  const ending = decoder.end()
  if (!('ok' in ending)) return { kind: 'decoder-fault', fault: ending.failure }
  const fault = yield* passFacts(ending.ok, held)
  if (fault !== null) return { kind: 'decoder-fault', fault }
  return { kind: 'decoded', termination: held.termination }
}

/**
 * Reads the rest of a body that Node has received whole, without decoding it. `true`: the body
 * ended right after the marker. `false`: an event or a failure followed; the frames are closed.
 */
async function endsAfterMarker(frames: ProtocolFrames): Promise<boolean> {
  try {
    const step = await frames.next()
    if (step.done === true) return true
    await frames.return(undefined)
    return false
  } catch (error) {
    if (
      error instanceof ResponseBodyStoppedError ||
      error instanceof ResponseBodyReadError ||
      error instanceof SseProtocolError
    )
      return false
    throw error
  }
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
