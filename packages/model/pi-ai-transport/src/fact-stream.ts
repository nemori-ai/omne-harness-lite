import type { ModelFault } from '@omne-harness/model-contract'
import type {
  ProviderDiagnostic,
  TransportFact,
  TransportTermination,
} from '@omne-harness/model-contract/provider'
import type { CheckedRoute, PiTransportLimits } from './config.ts'
import type { PiResponseDecoder } from './family.ts'
import { readProtocolFrames } from './frames.ts'
import {
  ResponseBodyReadError,
  ResponseBodyStalledError,
  ResponseBodyStoppedError,
  type HttpExchange,
} from './http.ts'
import { closeSourceOnEarlyEnd } from './iteration.ts'
import { readSseEvents, SseProtocolError } from './sse.ts'
import { terminationOf, type SendEnd } from './termination.ts'

export type SendInput = Readonly<{
  exchange: HttpExchange
  decoder: PiResponseDecoder
  route: CheckedRoute
  limits: PiTransportLimits
  diagnostics: readonly ProviderDiagnostic[]
}>

export function factsOfSend(input: SendInput): AsyncGenerator<TransportFact, void, undefined> {
  const { exchange } = input
  return closeSourceOnEarlyEnd(readSend(input), () => {
    exchange.stop()
    return exchange.stopped
  })
}

export async function* endedBeforeSend(
  end: SendEnd,
): AsyncGenerator<TransportFact, void, undefined> {
  yield { kind: 'ended', termination: terminationOf(end) }
}

export async function* noFacts(): AsyncGenerator<TransportFact, void, undefined> {}

export type Progress = { bodyComplete: boolean }

async function* readSend(input: SendInput): AsyncGenerator<TransportFact, void, undefined> {
  const { exchange } = input
  const progress: Progress = { bodyComplete: false }
  let end: SendEnd
  try {
    for (const value of input.diagnostics) yield { kind: 'diagnostic', value }
    end = yield* decodeSend(input, progress)
  } finally {
    if (!progress.bodyComplete) exchange.stop()
    await exchange.stopped
  }
  yield { kind: 'ended', termination: terminationOf(end) }
}

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
    case 'stalled':
      return STALLED_BEFORE_RESPONSE
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
  received(): boolean
  progress: Progress
}>

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

async function* readBody(
  input: BodyInput,
  held: Held,
): AsyncGenerator<TransportFact, SendEnd | null, undefined> {
  const { body, decoder, endMarker, limits, progress } = input
  const frames = readProtocolFrames(readSseEvents(body, limits.maxEventBytes), {
    endMarker,
    json: limits.json,
  })
  let bodyComplete = true
  try {
    for await (const frame of frames) {
      if (!('ok' in frame)) return { kind: 'frame-failed', reason: frame.failure }
      const accepted = decoder.accept(frame.ok)
      if (!('ok' in accepted)) return { kind: 'decoder-fault', fault: accepted.failure }
      const fault = yield* passFacts(accepted.ok, held)
      if (fault !== null) return { kind: 'decoder-fault', fault }
      if (frame.ok.kind === 'end-marker') {
        bodyComplete = input.received()
        break
      }
    }
  } catch (error) {
    if (error instanceof ResponseBodyStoppedError) return { kind: 'stopped' }
    if (error instanceof ResponseBodyStalledError) return STALLED_AFTER_RESPONSE
    if (error instanceof ResponseBodyReadError) return { kind: 'body-lost' }
    if (error instanceof SseProtocolError) return { kind: 'sse-failed', reason: error.reason }
    throw error
  }
  progress.bodyComplete = bodyComplete
  return null
}

async function* settleAfterFailure(
  decoder: PiResponseDecoder,
): AsyncGenerator<TransportFact, void, undefined> {
  const settled = decoder.end()
  if (!('ok' in settled)) return
  for (const fact of settled.ok) if (fact.kind !== 'ended') yield fact
}

type Held = { termination: TransportTermination | null }

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

const STALLED_BEFORE_RESPONSE: SendEnd = Object.freeze({
  kind: 'decoder-fault',
  fault: Object.freeze({
    cause: 'upstream-unavailable',
    diagnostic: 'stream-stall',
    upstreamStatus: null,
  }),
})

const STALLED_AFTER_RESPONSE: SendEnd = Object.freeze({
  kind: 'decoder-fault',
  fault: Object.freeze({ cause: 'stream-lost', diagnostic: 'stream-stall', upstreamStatus: null }),
})

const SECOND_TERMINATION: ModelFault = Object.freeze({
  cause: 'upstream-protocol',
  diagnostic: 'decoder-ended-twice',
  upstreamStatus: null,
})
