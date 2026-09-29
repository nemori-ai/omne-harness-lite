import { createHash } from 'node:crypto'
import {
  readOpaqueJson,
  writeJsonLossless,
  type ContentBlock,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { object } from './json.ts'

export function normalizeToolCallId(id: string): string {
  return /^[A-Za-z0-9_-]{1,64}$/.test(id)
    ? id
    : `call_${createHash('sha256').update(id).digest('base64url').slice(0, 32)}`
}

/** The one assistant wire projection, shared by planning and source verification. */
export function projectAssistant(
  blocks: readonly ContentBlock[],
  routeName: string,
  stableTextArrays: boolean,
):
  | { readonly message: JsonObject; readonly callIds: readonly string[] }
  | { readonly rejected: 'unavailable' | 'modality_not_carried' } {
  const content: string[] = [],
    thinking: string[] = [],
    tools: JsonObject[] = [],
    details: JsonValue[] = [],
    callIds: string[] = []
  let independentPlainThinking = false
  for (const block of blocks) {
    if (!block.visibility.toModel) continue
    if (block.kind === 'text') content.push(block.text)
    else if (block.kind === 'thinking') {
      thinking.push(block.text)
      const opaque = block.opaque === undefined ? undefined : readOpaqueJson(block.opaque)
      const replayed =
        object(opaque) && opaque.routeName === routeName && Array.isArray(opaque.reasoning_details)
          ? opaque.reasoning_details
          : undefined
      if (replayed) details.push(...replayed)
      if (!replayed?.length && block.text.length > 0) independentPlainThinking = true
    } else if (block.kind === 'tool_call' && block.complete) {
      callIds.push(block.callId)
      tools.push({
        id: normalizeToolCallId(block.callId),
        type: 'function',
        function: {
          name: block.tool,
          arguments: block.unparseable ? block.rawArguments : writeJsonLossless(block.arguments),
        },
      })
    } else return { rejected: 'modality_not_carried' }
  }
  if (details.length && independentPlainThinking) return { rejected: 'unavailable' }
  const text = content.join('')
  return {
    message: {
      role: 'assistant',
      content: stableTextArrays && text.length ? [{ type: 'text', text }] : text,
      ...(tools.length ? { tool_calls: tools } : {}),
      ...(details.length
        ? { reasoning_details: details }
        : thinking.some(Boolean)
          ? { reasoning: thinking.join('') }
          : {}),
    },
    callIds,
  }
}
