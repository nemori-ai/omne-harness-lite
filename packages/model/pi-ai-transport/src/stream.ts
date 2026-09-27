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
import type { StreamEnd, TransportFailure } from '@omne-harness-lite/model-request-runtime'
import { parseSSE, SseProtocolError } from './sse.ts'
import { strictObject, object } from './json.ts'
import { accountFromUsage } from './accounts.ts'
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
  deps: { maxSseEventBytes: number; diagnostic: (event: Diagnostic) => void },
): AsyncGenerator<ArrivalEvent, StreamEnd> {
  if (!(signal instanceof AbortSignal) || !claimResponse(response, planned))
    return { rejected: 'invalidInput' }
  const blocks: Block[] = []
  const tools = new Map<string, ToolParts>()
  let textBlock: Block | undefined, thinkingBlock: Block | undefined
  let usage: JsonObject | undefined,
    finish: string | undefined,
    done = false,
    failed: TransportFailure | undefined
  const serving: {
    upstreamModel?: string
    servingProvider?: string
    upstreamRequestId?: string
    stopReason?: string
  } = {}
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
    if (typeof value !== 'string') return
    if (serving[key] === undefined) serving[key] = value
    else if (serving[key] !== value)
      deps.diagnostic({
        kind:
          key === 'servingProvider'
            ? 'model_transport.serving_provider_changed'
            : `model_transport.${key}_changed`,
        level: 'error',
      })
  }
  const abort = () => response.stop()
  signal.addEventListener('abort', abort, { once: true })
  try {
    if (signal.aborted) response.stop()
    for await (const data of parseSSE(response.stream, deps.maxSseEventBytes)) {
      if (signal.aborted) break
      if (data === '[DONE]') {
        done = true
        continue
      }
      if (done) throw new SseProtocolError('event after DONE')
      const frame = strictObject(data)
      if (!frame) throw new SseProtocolError('invalid SSE JSON')
      remember('upstreamRequestId', frame.id)
      remember('upstreamModel', frame.model)
      remember('servingProvider', frame.provider)
      if (object(frame.error)) {
        const error = strictObject(response.redact(writeJsonLossless(frame.error))) ?? {
          message: 'upstream stream error',
        }
        const code = frame.error.code
        failed = isNonNegativeJsonInteger(code)
          ? {
              source: 'in_band',
              httpStatus: response.statusCode,
              statusCode: code,
              inBand: true,
              upstreamError: { raw: error },
            }
          : { source: 'in_band', httpStatus: response.statusCode, upstreamError: { raw: error } }
        break
      }
      if (object(frame.usage)) {
        if (usage) deps.diagnostic({ kind: 'model_transport.usage_repeated', level: 'info' })
        usage = frame.usage
      }
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
        for (const key of ['images', 'audio', 'refusal'])
          if (nonempty(delta[key])) throw new SseProtocolError('unsupported content member')
        const content = delta.content
        for (const key of ['reasoning', 'reasoning_content', 'reasoning_text'])
          if (nonempty(delta[key]) && typeof delta[key] !== 'string')
            throw new SseProtocolError('invalid reasoning')
        const reasoning = [delta.reasoning, delta.reasoning_content, delta.reasoning_text].find(
          v => typeof v === 'string' && v.length,
        )
        const detail = delta.reasoning_details
        const callParts = delta.tool_calls
        if (finish !== undefined && [content, reasoning, detail, callParts].some(nonempty))
          throw new SseProtocolError('content after finish_reason')
        if (nonempty(content) && typeof content !== 'string')
          throw new SseProtocolError('invalid content')
        if (typeof content === 'string' && content.length) {
          if (!textBlock) {
            textBlock = block('text')
            yield textBlock.opened
          }
          textBlock.text += content
          yield { t: 'fill', index: textBlock.opened.index, payload: content }
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
        serving.stopReason = finish
        if (!['stop', 'tool_calls', 'length'].includes(finish)) {
          failed = { source: 'in_band', upstreamError: { code: finish } }
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
      if (error instanceof SseProtocolError)
        failed = { source: 'protocol', localError: error.message }
      else if (
        error instanceof Error &&
        ['ECONNRESET', 'ERR_STREAM_PREMATURE_CLOSE', 'ABORT_ERR'].includes(
          'code' in error ? String(error.code) : '',
        )
      )
        failed = { source: 'stream_broken', localError: 'upstream stream disconnected' }
      else throw error
    }
  } finally {
    response.stop()
    await response.stopped
    signal.removeEventListener('abort', abort)
  }
  if (signal.aborted) return { aborted: true, ...serving }
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
  if (usage) yield { t: 'account', ...accountFromUsage(usage, deps.diagnostic) }
  return failed
    ? { failed, ...serving }
    : { ended: finish === 'length' ? 'max_tokens' : 'end', ...serving }
}
