// Derived from pi 0.86.1 openai-completions.ts streaming/finishBlock/reasoning_details.
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
import { claimResponse, type RawResponse, type Diagnostic } from './http.ts'
import type { PlannedRequest } from './plan.ts'

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

function sameReasoningHead(left: JsonObject, right: JsonObject, textKey: string): boolean {
  const head = (value: JsonObject) =>
    Object.fromEntries(
      Object.entries(value)
        .filter(([name]) => name !== textKey)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    )
  return writeJsonLossless(head(left)) === writeJsonLossless(head(right))
}

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
      if (data === '[DONE]') {
        done = true
        continue
      }
      if (done) throw new SseProtocolError('event after DONE')
      const frame = strictObject(data)
      if (!frame) throw new SseProtocolError('invalid SSE JSON')
      // Freeze usage before any subsequent frame member or policy processing can fail.
      if (object(frame.usage)) {
        usageReceived = true
        accumulator.observe(frame.usage)
      }
      if (object(frame.error)) {
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
        break
      }
      remember('upstreamRequestId', frame.id)
      remember('upstreamModel', frame.model)
      remember('servingProvider', frame.provider)
      if (!Array.isArray(frame.choices) || frame.choices.length === 0) continue
      if (frame.choices.length !== 1) throw new SseProtocolError('multiple choices')
      const choice = frame.choices[0]
      if (!object(choice)) throw new SseProtocolError('malformed choice')
      const delta = choice.delta
      if (delta !== undefined && delta !== null && !object(delta))
        throw new SseProtocolError('malformed delta')
      if (object(delta)) {
        const nonempty = (v: JsonValue | undefined) =>
          v !== undefined && v !== null && v !== '' && (!Array.isArray(v) || v.length > 0)
        for (const key of ['images', 'audio'])
          if (nonempty(delta[key])) throw new SseProtocolError(`unsupported content member: ${key}`)
        // Validate before yielding any content from this frame. Refusal text shares
        // the ordinary text channel; its protocol source does not alter its ending.
        const refusal = delta.refusal
        if (refusal !== undefined && refusal !== null && typeof refusal !== 'string')
          throw new SseProtocolError('invalid refusal')
        const content = delta.content
        for (const key of ['reasoning', 'reasoning_content', 'reasoning_text'])
          if (nonempty(delta[key]) && typeof delta[key] !== 'string')
            throw new SseProtocolError('invalid reasoning')
        const reasoning = [delta.reasoning, delta.reasoning_content, delta.reasoning_text].find(
          v => typeof v === 'string' && v.length,
        )
        const detail = delta.reasoning_details
        const callParts = delta.tool_calls
        if (finish !== undefined && [content, refusal, reasoning, detail, callParts].some(nonempty))
          throw new SseProtocolError('content after finish_reason')
        if (nonempty(content) && typeof content !== 'string')
          throw new SseProtocolError('invalid content')
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
        if (typeof reasoning === 'string' && reasoning.length) {
          if (!thinkingBlock) {
            thinkingBlock = block('thinking')
            yield thinkingBlock.opened
          }
          thinkingBlock.text += reasoning
          yield { t: 'fill', index: thinkingBlock.opened.index, payload: reasoning }
        }
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
            const key =
              raw.type === 'reasoning.text'
                ? 'text'
                : raw.type === 'reasoning.summary'
                  ? 'summary'
                  : undefined
            if (
              key &&
              object(last) &&
              last.type === raw.type &&
              typeof last[key] === 'string' &&
              typeof raw[key] === 'string' &&
              sameReasoningHead(last, raw, key)
            ) {
              thinkingBlock.details[thinkingBlock.details.length - 1] = {
                ...last,
                [key]: last[key] + raw[key],
              }
            } else thinkingBlock.details.push(raw)
          }
        }
        if (nonempty(callParts)) {
          if (!Array.isArray(callParts)) throw new SseProtocolError('invalid tool_calls')
          for (const part of callParts) {
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
        }
      }
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
          break
        }
      }
    }
    if (!signal.aborted && !failed) {
      if ([...tools.values()].some(t => !t.block))
        failed = { source: 'protocol', localError: 'tool name never arrived' }
      else if (!done || finish === undefined)
        failed = { source: 'stream_broken', localError: 'stream ended before terminal facts' }
    }
  } catch (error) {
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
  const readFacts = accumulator.read()
  if (usageReceived) yield { t: 'account', usage: readFacts.usage, cost: readFacts.cost }
  reportExecutionDiagnostic(deps.executionDiagnostics, {
    stage: 'stream_end',
    outcome: failed ? 'failed' : 'completed',
    facts: { kind: 'transport', stream: failed ? 'lost' : 'ended' },
  })
  return failed
    ? { failed, ...serving, readFacts }
    : { ended: finish === 'length' ? 'max_tokens' : 'end', ...serving, readFacts }
}
