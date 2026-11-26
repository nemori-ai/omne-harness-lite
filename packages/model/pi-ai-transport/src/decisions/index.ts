import type { Outcome } from '@omne-harness/operation-result'
import { readJsonBytes, type JsonLimits } from '@omne-harness/json-text'
import { checkJsonLimits, type PiCredentialSlot, type PiRoute } from '../config.ts'
import {
  isPlainHttpsUrl,
  ResponseBodyStalledError,
  startExchange,
  type HttpExchange,
} from '../http.ts'
import { isPositiveInteger, isTimerDuration } from '../limits.ts'
import { networkInternalsOf, type NetworkResources } from '../network.ts'
import { isDecisionResponse, prepareDecision } from './codec.ts'
import type { DecisionFailure, DecisionRequest, DecisionResponse } from './contract.ts'

export { OPENROUTER_DECISION_MODELS } from './contract.ts'
export {
  DECISIONS_OWNER,
  decisionSupplierOf,
  isDecisionSupplier,
  type DecisionSupplier,
} from './binding.ts'
export type * from './contract.ts'

export type OpenRouterDecisionsConfig = Readonly<{
  network: NetworkResources
  credential: PiCredentialSlot
  /** The provider asset supplies the endpoint and the bearer item. */
  route: PiRoute
  timeoutMs: number
  maxRequestBytes: number
  responseLimits: JsonLimits
}>

export interface OpenRouterDecisions {
  decide(
    request: DecisionRequest,
    signal: AbortSignal,
  ): Promise<Outcome<DecisionResponse, DecisionFailure>>
}
type DecisionReply = Outcome<DecisionResponse, DecisionFailure>
function failure(
  kind: DecisionFailure['kind'],
  dispatch: DecisionFailure['dispatch'],
): DecisionReply {
  return { failure: { kind, dispatch } }
}

/** Credential providers may throw; diagnostics must never contain their exception text. */
function bearer(slot: PiCredentialSlot, item: string): string | undefined {
  try {
    return slot.read()?.get(item)
  } catch {
    return undefined
  }
}

async function readAnswer(
  exchange: HttpExchange,
  questions: DecisionRequest['questions'],
  limits: JsonLimits,
  signal: AbortSignal,
): Promise<DecisionReply> {
  const result = await exchange.result
  const sent = exchange.requestMaySent() ? 'possibly-sent' : 'not-sent'
  switch (result.kind) {
    case 'connect-failed':
      return failure(result.timeout ? 'timeout' : 'unavailable', sent)
    case 'stalled':
      return failure('timeout', sent)
    case 'stopped':
      return failure(
        signal.aborted ? 'cancelled' : 'unavailable',
        result.responded ? 'responded' : sent,
      )
    case 'http-error':
      return { failure: { kind: 'http-error', status: result.status, dispatch: 'responded' } }
    case 'ok':
      break
  }
  const stream = result.body.claim()
  if (stream === undefined) return failure('unavailable', 'responded')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for await (const chunk of stream) {
      size += chunk.byteLength
      if (size > limits.maxBytes) return failure('response-too-large', 'responded')
      chunks.push(chunk)
    }
  } catch (error) {
    if (signal.aborted) return failure('cancelled', 'responded')
    return failure(
      error instanceof ResponseBodyStalledError ? 'timeout' : 'unavailable',
      'responded',
    )
  }
  const bytes = Buffer.concat(chunks)
  const parsed = readJsonBytes(bytes, limits)
  if (parsed.kind !== 'ok') return failure('invalid-response', 'responded')
  const value: unknown = JSON.parse(bytes.toString('utf8'))
  return isDecisionResponse(value, questions)
    ? { ok: value }
    : failure('invalid-response', 'responded')
}

/** One authorized dispatch through the caller's network pool. Never retries after an uncertain send. */
export function createOpenRouterDecisions(config: OpenRouterDecisionsConfig): OpenRouterDecisions {
  const network = networkInternalsOf(config.network)
  const endpoint = config.route.endpoints.decisions
  if (endpoint === undefined || endpoint.endMarker !== null || config.route.auth?.kind !== 'bearer')
    throw new RangeError('a Decisions JSON endpoint with bearer credentials is required')
  const url = new URL(endpoint.url)
  const item = config.route.auth.item
  const { timeoutMs: timeout, maxRequestBytes: requestLimit, credential } = config
  const limits = checkJsonLimits(config.responseLimits)
  if (
    !isPlainHttpsUrl(url) ||
    !item ||
    !isTimerDuration(timeout) ||
    !isPositiveInteger(requestLimit) ||
    typeof credential?.read !== 'function'
  )
    throw new RangeError('invalid OpenRouter Decisions configuration')
  return {
    async decide(request, signal) {
      if (signal.aborted) return failure('cancelled', 'not-sent')
      if (network.closed) return failure('unavailable', 'not-sent')
      const fixed = prepareDecision(request, requestLimit)
      if (fixed === null) return failure('invalid-request', 'not-sent')
      const deadline = AbortSignal.timeout(timeout)
      const until = AbortSignal.any([signal, deadline])
      const seat = await network.capacity.reserve(until)
      if (seat === undefined)
        return failure(
          signal.aborted ? 'cancelled' : deadline.aborted ? 'timeout' : 'unavailable',
          'not-sent',
        )
      let active: HttpExchange | undefined
      try {
        const secret = bearer(credential, item)
        if (!secret || !/^[\x21-\x7e]+$/.test(secret))
          return failure('credential-unavailable', 'not-sent')
        const started = startExchange(
          network,
          {
            url,
            headers: {
              authorization: `Bearer ${secret}`,
              'content-type': 'application/json',
              accept: 'application/json',
            },
            body: fixed.body,
            reservation: seat,
            connectTimeoutMs: timeout,
            maxErrorBodyBytes: limits.maxBytes,
          },
          until,
        )
        if (started.kind !== 'started')
          return failure(
            signal.aborted ? 'cancelled' : deadline.aborted ? 'timeout' : 'unavailable',
            'not-sent',
          )
        active = started.exchange
        const answer = await readAnswer(active, fixed.questions, limits, until)
        if (
          'failure' in answer &&
          answer.failure.kind === 'cancelled' &&
          deadline.aborted &&
          !signal.aborted
        )
          return failure('timeout', answer.failure.dispatch)
        return answer
      } finally {
        if (active !== undefined) {
          active.stop()
          await active.stopped
        } else seat.release()
      }
    },
  }
}
