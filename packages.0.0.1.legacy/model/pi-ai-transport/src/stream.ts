// Derived from pi 1.0.0 openai-completions.ts streaming/finishBlock/reasoning_details.
// Copyright (c) 2025 Mario Zechner. MIT: ../LICENSE.pi. Baseline and modifications: provenance.json.
import { createHash } from 'node:crypto'
import {
  LosslessNumber,
  jsonNumberSource,
  writeJsonLossless,
  isNonNegativeJsonInteger,
  toOpaqueJson,
  type JsonNumber,
  type JsonValue,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type { ArrivalEvent, OpenEvent } from '@omne-harness-lite/arrival-events'
import type {
  StreamEnd,
  TransportFailure,
  TransportExecutionDiagnostics,
} from '@omne-harness-lite/model-request-runtime'
import { parseSSE, SseProtocolError } from './sse.ts'
import { strictObject, object } from './json.ts'
import { processedText, processedObject, CredentialProcessingFailure } from './credential-policy.ts'
import { reportDiagnostic, reportExecutionDiagnostic } from './diagnostics.ts'
import { usageScope } from './usage-scope.ts'
import { createReadFactsAccumulator, emptyReadFacts } from './read-facts.ts'
import { claimResponse } from './http.ts'
import { type RawResponse } from '@omne-harness-lite/model-request-runtime'
import { type Diagnostic } from '@omne-harness-lite/model-request-runtime'
import type { PlannedRequest } from '@omne-harness-lite/model-request-runtime'

export function canonicalInteger(value: JsonNumber): string {
  if (!isNonNegativeJsonInteger(value)) throw new TypeError('nonnegative integer required')
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(jsonNumberSource(value))
  if (!match || match[2] === undefined) throw new Error('validated integer codec failed')
  const fraction = match[3] ?? ''
  let coefficient = (match[2] + fraction).replace(/^0+/, '')
  let exponent = BigInt(match[4] ?? '0') - BigInt(fraction.length)
  if (!coefficient) return '0e0'
  while (coefficient.endsWith('0')) {
    coefficient = coefficient.slice(0, -1)
    exponent++
  }
  if (exponent < 0n) throw new Error('validated integer became fractional')
  return `${coefficient}e${exponent}`
}
export function generatedCallId(call: string, dispatch: JsonNumber, index: JsonNumber) {
  const encoded = JSON.stringify([call, canonicalInteger(dispatch), canonicalInteger(index)])
  return unwrap(
    parseOpaqueIdentifier(
      `call_${createHash('sha256').update(encoded).digest('base64url').slice(0, 32)}`,
      'CallId',
    ),
  )
}
interface Block {
  readonly opened: OpenEvent
  text: string
  details: JsonValue[]
}
interface ToolParts {
  name?: string
  readonly pending: string[]
  readonly block?: Block
}
const visibility = Object.freeze({ toHuman: true, toModel: true })

function sameReasoningHead(
  left: JsonObject,
  right: JsonObject,
  ...excluded: readonly string[]
): boolean {
  const head = (value: JsonObject) =>
    Object.fromEntries(
      Object.entries(value)
        .filter(([name]) => !excluded.includes(name))
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    )
  return writeJsonLossless(head(left)) === writeJsonLossless(head(right))
}

const unsignedReasoning = (value: JsonValue | undefined) => value === undefined || value === null
const signedReasoning = (value: JsonValue | undefined): value is string =>
  typeof value === 'string' && value.length > 0

/**
 * One streamed `reasoning.text` detail may arrive as several adjacent fragments. They are
 * joined only when every member except text and signature (type, id, index, format,
 * unknown metadata) is equal and the fragments share one content-block identity:
 * - both carry the same nonempty `id`; or
 * - neither carries an id (absent/null). Unsigned id-less deltas join as before. When a
 *   signature is involved, identity is carried by `index`: both must have the same
 *   nonnegative integer index.
 * Within one identity, signatures may go from absent/null to one nonempty value and then
 * only repeat it. An invalid, empty or conflicting signature stays distinct, and an unsigned
 * fragment after a signed one starts a new entry. A fragment without a `text` member
 * contributes no text and is accepted only when it carries that nonempty signature.
 *
 * Assumption (dispatcher ruling R-L, 2026-09-30): within one response, adjacent id-less
 * fragments with the same index belong to the same upstream content block. This is the
 * Anthropic content-block identity: OpenRouter streams Anthropic thinking_delta and a final
 * signature_delta as id-less, same-index `reasoning.text` fragments, the signature alone in
 * the last one (paid observation, ledger entry cecc12c9-300e-43db-8389-7bb4ac859d4f).
 * Returns the merged detail, or undefined when `next` must stay a separate original entry.
 */
function continueReasoningText(previous: JsonValue | undefined, next: JsonObject) {
  const earlier = object(previous) ? previous.signature : undefined,
    later = next.signature
  const nextText = next.text === undefined && signedReasoning(later) ? '' : next.text
  if (!reasoningTextHead(previous, next, nextText, earlier, later)) return undefined
  if (!sameReasoningIdentity(previous, next, earlier, later)) return undefined
  // After a signature has arrived, only the identical signature may continue the detail.
  if (signedReasoning(earlier) && earlier !== later) return undefined
  const adopt = signedReasoning(later) || (earlier === undefined && later === null)
  return {
    ...previous,
    text: previous.text + nextText,
    ...(adopt ? { signature: later } : {}),
  }
}

function reasoningTextHead(
  previous: JsonValue | undefined,
  next: JsonObject,
  nextText: JsonValue | undefined,
  earlier: JsonValue | undefined,
  later: JsonValue | undefined,
): previous is JsonObject & { text: string } {
  if (
    !object(previous) ||
    previous.type !== 'reasoning.text' ||
    next.type !== 'reasoning.text' ||
    typeof previous.text !== 'string' ||
    typeof nextText !== 'string' ||
    // Includes id and index: both absent/null, or the same value.
    !sameReasoningHead(previous, next, 'text', 'signature') ||
    !(unsignedReasoning(earlier) || signedReasoning(earlier)) ||
    !(unsignedReasoning(later) || signedReasoning(later))
  )
    return false
  return true
}
function sameReasoningIdentity(
  previous: JsonObject,
  next: JsonObject,
  earlier: JsonValue | undefined,
  later: JsonValue | undefined,
): boolean {
  if (unsignedReasoning(previous.id) && unsignedReasoning(next.id)) {
    if (
      (!unsignedReasoning(earlier) || !unsignedReasoning(later)) &&
      (!isNonNegativeJsonInteger(previous.index) || !isNonNegativeJsonInteger(next.index))
    )
      return false
  } else if (typeof previous.id !== 'string' || previous.id.length === 0 || previous.id !== next.id)
    return false
  return true
}

function publicReasoningText(detail: JsonValue): string | undefined {
  if (!object(detail)) return undefined
  const text =
    detail.type === 'reasoning.text'
      ? detail.text
      : detail.type === 'reasoning.summary'
        ? detail.summary
        : undefined
  return typeof text === 'string' && text.length > 0 ? text : undefined
}

type ReasoningSource = 'plain' | 'details'

function selectReasoningSource(
  reasoning: JsonValue | undefined,
  detail: JsonValue | undefined,
): ReasoningSource | undefined {
  if (typeof reasoning === 'string' && reasoning.length > 0) return 'plain'
  if (Array.isArray(detail) && detail.some(value => publicReasoningText(value) !== undefined))
    return 'details'
  return undefined
}

const nonempty = (v: JsonValue | undefined) =>
  v !== undefined && v !== null && v !== '' && (!Array.isArray(v) || v.length > 0)

export async function* readStream(
  response: RawResponse,
  planned: PlannedRequest,
  signal: AbortSignal,
  deps: {
    maxSseEventBytes: number
    diagnostic: (event: Diagnostic) => void
    executionDiagnostics?: TransportExecutionDiagnostics
  },
): AsyncGenerator<ArrivalEvent, StreamEnd> {
  const claimed =
    signal instanceof AbortSignal
      ? claimResponse(response, planned, deps.executionDiagnostics)
      : undefined
  if (!claimed) return { rejected: 'invalidInput', readFacts: emptyReadFacts() }
  const state = claimed
  const blocks: Block[] = []
  const tools = new Map<string, ToolParts>()
  let textBlock: Block | undefined, thinkingBlock: Block | undefined
  let reasoningSource: ReasoningSource | undefined
  const accumulator = createReadFactsAccumulator(
    event => diagnostic(event),
    state.stream.headers['x-openrouter-cache-status'] === 'HIT',
    usageScope(planned.input.routeName),
  )
  let usageReceived = false
  let finish: string | undefined,
    done = false,
    failed: TransportFailure | undefined
  const serving: {
    upstreamModel?: string
    servingProvider?: string
    upstreamRequestId?: string
    stopReason?: string
  } = {}
  const originalServing: typeof serving = {}
  const diagnostic = (event: Diagnostic) => {
    if (!deps.executionDiagnostics) reportDiagnostic(deps.diagnostic, event)
  }
  function block(kind: 'text' | 'thinking'): Block {
    const index = new LosslessNumber(String(blocks.length))
    const opened: OpenEvent = {
      t: 'open',
      index,
      id: unwrap(parseOpaqueIdentifier(`b${blocks.length}`, 'BlockId')),
      kind,
      fill: 'append',
      visibility,
    }
    const result = { opened, text: '', details: [] }
    blocks.push(result)
    return result
  }
  function openTool(name: string): Block {
    const index = new LosslessNumber(String(blocks.length))
    const opened: OpenEvent = {
      t: 'open',
      index,
      id: unwrap(parseOpaqueIdentifier(`b${blocks.length}`, 'BlockId')),
      kind: 'tool_call',
      fill: 'append',
      visibility,
      head: {
        tool: name,
        callId: generatedCallId(planned.input.target.callId, planned.input.target.dispatch, index),
      },
    }
    const result = { opened, text: '', details: [] }
    blocks.push(result)
    return result
  }
  function remember(
    key: 'upstreamModel' | 'servingProvider' | 'upstreamRequestId',
    value: JsonValue | undefined,
  ) {
    if (typeof value !== 'string' || value.length === 0) return
    if (originalServing[key] === undefined) {
      originalServing[key] = value
      serving[key] = processedText(state.credentialPolicy, value, 'serving_text_policy')
      accumulator.remember({ [key]: serving[key] })
    } else if (originalServing[key] !== value) {
      accumulator.inconsistent()
      diagnostic({
        kind:
          key === 'servingProvider'
            ? 'model_transport.serving_provider_changed'
            : `model_transport.${key}_changed`,
        level: 'error',
      })
    }
  }
  const abort = () => response.stop()
  signal.addEventListener('abort', abort, { once: true })
  try {
    if (signal.aborted) response.stop()
    for await (const data of parseSSE(state.stream, deps.maxSseEventBytes)) {
      if (signal.aborted) break
      for (const event of readFrame(data)) yield event
      if (failed) break
    }
    checkTerminalFacts()
  } catch (error) {
    recordReadFailure(error)
  } finally {
    response.stop()
    await response.stopped
    signal.removeEventListener('abort', abort)
  }
  if (signal.aborted) {
    reportExecutionDiagnostic(deps.executionDiagnostics, {
      stage: 'stream_end',
      outcome: 'stopped',
      facts: { kind: 'transport', stream: 'lost' },
    })
    return { aborted: true, ...serving, readFacts: accumulator.read() }
  }
  for (const event of closeBlocks()) yield event
  const readFacts = accumulator.read()
  if (usageReceived) yield { t: 'account', usage: readFacts.usage, cost: readFacts.cost }
  return streamResult(readFacts)

  function* readChoiceDelta(choice: JsonObject): Generator<ArrivalEvent> {
    const delta = choice.delta
    if (delta !== undefined && delta !== null && !object(delta))
      throw new SseProtocolError('malformed delta')
    if (object(delta)) {
      const { content, refusal, reasoning, detail, callParts } = readDeltaFields(delta)
      for (const event of readTextFragments(content, refusal)) yield event
      yield* readThinking(reasoning, detail)
      for (const event of readToolCalls(callParts)) yield event
    }
  }

  function observeFinish(choice: JsonObject): boolean {
    if (choice.finish_reason !== undefined && choice.finish_reason !== null) {
      if (typeof choice.finish_reason !== 'string')
        throw new SseProtocolError('invalid finish_reason')
      if (finish !== undefined && finish !== choice.finish_reason)
        throw new SseProtocolError('finish_reason changed')
      finish = choice.finish_reason
      const abnormal = !['stop', 'tool_calls', 'length'].includes(finish)
      if (abnormal) failed = { source: 'in_band' }
      serving.stopReason = processedText(state.credentialPolicy, finish, 'stop_reason_policy')
      if (abnormal) {
        failed = { source: 'in_band', upstreamError: { code: serving.stopReason } }
        return true
      }
    }
    return false
  }

  function checkTerminalFacts(): void {
    if (!signal.aborted && !failed) {
      if ([...tools.values()].some(t => !t.block))
        failed = { source: 'protocol', localError: 'tool name never arrived' }
      else if (!done || finish === undefined)
        failed = { source: 'stream_broken', localError: 'stream ended before terminal facts' }
    }
  }

  function recordReadFailure(error: unknown): void {
    if (!signal.aborted) {
      if (error instanceof CredentialProcessingFailure) {
        failed = { ...(failed ?? { source: 'local' }), localError: error.stage }
        diagnostic({
          kind: error.rejected
            ? 'model_transport.text_or_json_policy_rejected'
            : 'model_transport.text_or_json_policy_defect',
          level: 'error',
        })
      } else if (error instanceof SseProtocolError)
        failed = { source: 'protocol', localError: error.message }
      else if (
        error instanceof Error &&
        ['ECONNRESET', 'ERR_STREAM_PREMATURE_CLOSE', 'ABORT_ERR'].includes(
          'code' in error ? String(error.code) : '',
        )
      )
        failed = { source: 'stream_broken', localError: 'upstream stream disconnected' }
      else {
        reportExecutionDiagnostic(deps.executionDiagnostics, {
          stage: 'stream_end',
          outcome: 'failed',
          facts: { kind: 'transport', stream: 'lost' },
        })
        failed = { source: 'local', localError: 'reader_failure' }
      }
    }
  }

  function* closeBlocks(): Generator<ArrivalEvent> {
    if (!failed && finish !== 'length') {
      for (const b of blocks) {
        if (b.opened.kind === 'tool_call') yield { t: 'close', index: b.opened.index }
        else if (b.opened.kind === 'text' || b.opened.kind === 'thinking')
          yield {
            t: 'close',
            index: b.opened.index,
            block: {
              id: b.opened.id,
              visibility,
              kind: b.opened.kind,
              text: b.text,
              ...(b.details.length
                ? {
                    opaque: toOpaqueJson({
                      routeName: planned.input.routeName,
                      reasoning_details: b.details,
                    }),
                  }
                : {}),
            },
          }
      }
    }
  }

  function* readFrame(data: string): Generator<ArrivalEvent> {
    if (data === '[DONE]') {
      done = true
      return
    }
    if (done) throw new SseProtocolError('event after DONE')
    const frame = strictObject(data)
    if (!frame) throw new SseProtocolError('invalid SSE JSON')
    // Freeze usage before any subsequent frame member or policy processing can fail.
    if (object(frame.usage)) {
      usageReceived = true
      accumulator.observe(frame.usage)
    }
    if (inBandErrorFrame(frame)) {
      recordInBandError(frame)
      return
    }
    remember('upstreamRequestId', frame.id)
    remember('upstreamModel', frame.model)
    remember('servingProvider', frame.provider)
    if (!Array.isArray(frame.choices) || frame.choices.length === 0) return
    if (frame.choices.length !== 1) throw new SseProtocolError('multiple choices')
    const choice = frame.choices[0]
    if (!object(choice)) throw new SseProtocolError('malformed choice')
    for (const event of readChoiceDelta(choice)) yield event
    observeFinish(choice)
  }

  function recordInBandError(frame: JsonObject & { error: JsonObject }): void {
    // Independent protocol status is obtained before processing its untrusted JSON copy.
    const code = frame.error.code
    failed = isNonNegativeJsonInteger(code)
      ? {
          source: 'in_band',
          ...(state.statusCode === undefined ? {} : { httpStatus: state.statusCode }),
          statusCode: code,
          inBand: true,
        }
      : {
          source: 'in_band',
          ...(state.statusCode === undefined ? {} : { httpStatus: state.statusCode }),
        }
    remember('upstreamRequestId', frame.id)
    remember('upstreamModel', frame.model)
    remember('servingProvider', frame.provider)
    failed = {
      ...failed,
      upstreamError: {
        raw: processedObject(state.credentialPolicy, frame.error, 'in_band_error_policy'),
      },
    }
  }

  function readDeltaFields(delta: JsonObject) {
    for (const key of ['images', 'audio'])
      if (nonempty(delta[key])) throw new SseProtocolError(`unsupported content member: ${key}`)
    // Validate before yielding any content from this frame. Refusal text shares
    // the ordinary text channel; its protocol source does not alter its ending.
    const refusal = delta.refusal
    if (refusal !== undefined && refusal !== null && typeof refusal !== 'string')
      throw new SseProtocolError('invalid refusal')
    const content = delta.content
    const reasoning = readReasoningText(delta)
    const detail = delta.reasoning_details
    const callParts = delta.tool_calls
    if (finish !== undefined && [content, refusal, reasoning, detail, callParts].some(nonempty))
      throw new SseProtocolError('content after finish_reason')
    if (nonempty(content) && typeof content !== 'string')
      throw new SseProtocolError('invalid content')
    return { content, refusal, reasoning, detail, callParts }
  }

  function readReasoningText(delta: JsonObject) {
    for (const key of ['reasoning', 'reasoning_content', 'reasoning_text'])
      if (nonempty(delta[key]) && typeof delta[key] !== 'string')
        throw new SseProtocolError('invalid reasoning')
    return [delta.reasoning, delta.reasoning_content, delta.reasoning_text].find(
      v => typeof v === 'string' && v.length,
    )
  }

  function* readTextFragments(
    content: JsonValue | undefined,
    refusal: JsonValue | undefined,
  ): Generator<ArrivalEvent> {
    for (const fragment of [content, refusal]) {
      if (typeof fragment === 'string' && fragment.length) {
        if (!textBlock) {
          textBlock = block('text')
          yield textBlock.opened
        }
        textBlock.text += fragment
        yield { t: 'fill', index: textBlock.opened.index, payload: fragment }
      }
    }
  }

  function* readThinking(
    reasoning: JsonValue | undefined,
    detail: JsonValue | undefined,
  ): Generator<ArrivalEvent> {
    reasoningSource ??= selectReasoningSource(reasoning, detail)
    if (reasoningSource === 'plain') yield* readThinkingText(reasoning)
    yield* readThinkingDetails(detail)
  }

  function* readThinkingText(reasoning: JsonValue | undefined): Generator<ArrivalEvent> {
    if (typeof reasoning === 'string' && reasoning.length) {
      if (!thinkingBlock) {
        thinkingBlock = block('thinking')
        yield thinkingBlock.opened
      }
      thinkingBlock.text += reasoning
      yield { t: 'fill', index: thinkingBlock.opened.index, payload: reasoning }
    }
  }

  function* readThinkingDetails(detail: JsonValue | undefined): Generator<ArrivalEvent> {
    if (nonempty(detail)) {
      if (!Array.isArray(detail)) throw new SseProtocolError('invalid reasoning_details')
      if (!thinkingBlock) {
        thinkingBlock = block('thinking')
        yield thinkingBlock.opened
      }
      for (const raw of detail) {
        if (!object(raw) || typeof raw.type !== 'string')
          throw new SseProtocolError('invalid reasoning detail')
        const last = thinkingBlock.details.at(-1)
        const continued = continueReasoningDetail(last, raw)
        if (continued) thinkingBlock.details[thinkingBlock.details.length - 1] = continued
        else thinkingBlock.details.push(raw)
        if (reasoningSource === 'details') yield* readThinkingText(publicReasoningText(raw))
      }
    }
  }

  function* readToolCalls(callParts: JsonValue | undefined): Generator<ArrivalEvent> {
    if (nonempty(callParts)) {
      if (!Array.isArray(callParts)) throw new SseProtocolError('invalid tool_calls')
      for (const part of callParts) for (const event of readToolPart(part)) yield event
    }
  }

  function continueReasoningDetail(
    last: JsonValue | undefined,
    raw: JsonObject,
  ): JsonObject | undefined {
    return raw.type === 'reasoning.text'
      ? continueReasoningText(last, raw)
      : raw.type === 'reasoning.summary' &&
          object(last) &&
          last.type === raw.type &&
          typeof last.summary === 'string' &&
          typeof raw.summary === 'string' &&
          sameReasoningHead(last, raw, 'summary')
        ? { ...last, summary: last.summary + raw.summary }
        : undefined
  }

  function streamResult(readFacts: ReturnType<typeof accumulator.read>): StreamEnd {
    reportExecutionDiagnostic(deps.executionDiagnostics, {
      stage: 'stream_end',
      outcome: failed ? 'failed' : 'completed',
      facts: { kind: 'transport', stream: failed ? 'lost' : 'ended' },
    })
    return failed
      ? { failed, ...serving, readFacts }
      : { ended: finish === 'length' ? 'max_tokens' : 'end', ...serving, readFacts }
  }

  function* readToolPart(part: JsonValue): Generator<ArrivalEvent> {
    const { key, previous, name, argumentsText } = toolPartFields(part)
    let current = previous
    if (typeof name === 'string' && name.length) {
      if (previous.name !== undefined && previous.name !== name)
        throw new SseProtocolError('tool name changed')
      if (!previous.block) {
        const opened = openTool(name)
        current = { ...previous, name, block: opened }
        yield opened.opened
        for (const fragment of previous.pending) {
          opened.text += fragment
          yield { t: 'fill', index: opened.opened.index, payload: fragment }
        }
        previous.pending.length = 0
      }
    }
    if (typeof argumentsText === 'string' && argumentsText.length) {
      if (current.block) {
        current.block.text += argumentsText
        yield { t: 'fill', index: current.block.opened.index, payload: argumentsText }
      } else current.pending.push(argumentsText)
    }
    tools.set(key, current)
  }

  function toolPartFields(part: JsonValue) {
    if (
      !object(part) ||
      !isNonNegativeJsonInteger(part.index) ||
      ('type' in part && part.type !== 'function') ||
      !object(part.function)
    )
      throw new SseProtocolError('unsupported tool call')
    const key = canonicalInteger(part.index)
    const previous = tools.get(key) ?? { pending: [] }
    const name = part.function.name,
      argumentsText = part.function.arguments
    if (name !== undefined && typeof name !== 'string')
      throw new SseProtocolError('invalid tool name')
    if (argumentsText !== undefined && typeof argumentsText !== 'string')
      throw new SseProtocolError('invalid tool arguments fragment')
    return { key, previous, name, argumentsText }
  }
}

function inBandErrorFrame(frame: JsonObject): frame is JsonObject & { error: JsonObject } {
  return object(frame.error)
}
