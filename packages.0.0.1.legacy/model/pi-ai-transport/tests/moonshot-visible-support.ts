// Archived-shape SSE for the adopted visible reasoning estimates (Moonshot and Qwen open
// leaves, both revision 2). The fragments come from 2026-09-27 raw streams (fixtures/
// <family>/visible-reasoning-fragments.json); frames are rebuilt in that exact delta shape
// and the real reader merges them. Every response is a controlled local TLS stand-in.
import { readFileSync } from 'node:fs'
import {
  readJsonStrict,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { object } from '../src/json.ts'
import { lookupTool } from './moonshot-support.ts'
import { sse } from './support.ts'

export interface ArchivedStream {
  readonly member: string
  readonly sha256: string
  readonly model: string
  readonly provider: string
  readonly effort: string | null
  readonly fragments: readonly string[]
}

/** Only the model identity selects archives and labels frames. */
export interface ArchivedModel {
  readonly modelId: string
}

export function loadArchivedStreams(fixture: URL): readonly ArchivedStream[] {
  const parsed = readJsonStrict(readFileSync(fixture, 'utf8'))
  if (!('ok' in parsed) || !object(parsed.ok) || !Array.isArray(parsed.ok.streams))
    throw new Error('invalid archived fragment fixture')
  return parsed.ok.streams.map(item => {
    if (
      !object(item) ||
      typeof item.member !== 'string' ||
      typeof item.sha256 !== 'string' ||
      typeof item.model !== 'string' ||
      typeof item.provider !== 'string' ||
      (item.effort !== null && typeof item.effort !== 'string') ||
      !Array.isArray(item.fragments) ||
      !item.fragments.every(fragment => typeof fragment === 'string')
    )
      throw new Error('invalid archived stream')
    return {
      member: item.member,
      sha256: item.sha256,
      model: item.model,
      provider: item.provider,
      effort: item.effort,
      fragments: item.fragments.filter(
        (fragment): fragment is string => typeof fragment === 'string',
      ),
    }
  })
}

export const archivedStreams = loadArchivedStreams(
  new URL('./fixtures/moonshot/visible-reasoning-fragments.json', import.meta.url),
)

export function archivedFor(
  model: ArchivedModel,
  streams: readonly ArchivedStream[] = archivedStreams,
): readonly ArchivedStream[] {
  return streams.filter(stream => stream.model === model.modelId)
}

export function archivedText(stream: ArchivedStream): string {
  return stream.fragments.join('')
}

/** The archived detail entry: exactly type/text/format/index, no id, no signature. */
export function visibleDetail(text: string): JsonObject {
  return { type: 'reasoning.text', text, format: 'unknown', index: 0 }
}

export interface ArchivedReplyOptions {
  readonly servingProvider?: string | undefined
  readonly toolCall?: boolean
  /** Negative controls: replace one fragment's delta (default: the archived shape). */
  readonly delta?: (fragment: string, index: number, count: number) => JsonObject
}

/** One archived-shape SSE response: every reasoning frame carries `reasoning` + one detail. */
export function archivedReply(
  model: ArchivedModel,
  round: number,
  stream: ArchivedStream,
  options: ArchivedReplyOptions = {},
): string {
  const head = {
    id: `gen-local-${round}`,
    object: 'chat.completion.chunk',
    created: 1790481755,
    model: model.modelId,
    ...(options.servingProvider === undefined ? {} : { provider: options.servingProvider }),
  }
  const frame = (delta: JsonValue, finishReason: string | null, extra: JsonObject = {}) =>
    sse({
      ...head,
      choices: [
        { index: 0, delta, finish_reason: finishReason, native_finish_reason: finishReason },
      ],
      ...extra,
    })
  const archived = (fragment: string): JsonObject => ({
    content: '',
    role: 'assistant',
    reasoning: fragment,
    reasoning_details: [visibleDetail(fragment)],
  })
  const count = stream.fragments.length
  const reasoning = stream.fragments
    .map((fragment, index) =>
      frame(options.delta ? options.delta(fragment, index, count) : archived(fragment), null),
    )
    .join('')
  const answer = options.toolCall
    ? frame(
        {
          role: 'assistant',
          tool_calls: [
            {
              index: 0,
              id: `call_upstream_${round}`,
              type: 'function',
              function: { name: lookupTool.name, arguments: '{"query":"value"}' },
            },
          ],
        },
        null,
      )
    : frame({ content: `Answer ${round}.`, role: 'assistant' }, null)
  const reason = options.toolCall ? 'tool_calls' : 'stop'
  return (
    reasoning +
    answer +
    frame({ content: '', role: 'assistant', reasoning: null }, reason) +
    frame({ content: '', role: 'assistant' }, reason, {
      usage: {
        prompt_tokens: 5888 + round,
        completion_tokens: 59,
        total_tokens: 5947 + round,
        cost: 0.018549,
        prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
        completion_tokens_details: { reasoning_tokens: 43 },
      },
    }) +
    sse('[DONE]')
  )
}

/** Wire → same wire with each assistant's details replaced by `reasoning: text`. */
export function asReasoningString(body: JsonObject): JsonObject {
  if (!Array.isArray(body.messages)) throw new Error('messages required')
  return {
    ...body,
    messages: body.messages.map(item => {
      if (!object(item) || !Array.isArray(item.reasoning_details)) return item
      const detail = item.reasoning_details[0]
      if (!object(detail) || typeof detail.text !== 'string') throw new Error('detail text')
      const rest = Object.fromEntries(
        Object.entries(item).filter(([name]) => name !== 'reasoning_details'),
      )
      return { ...rest, reasoning: detail.text }
    }),
  }
}

export function serialized(body: JsonObject) {
  return { body, serialized: writeJsonLossless(body) }
}
