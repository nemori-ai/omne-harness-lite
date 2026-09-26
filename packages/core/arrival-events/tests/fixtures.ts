import { readJsonStrict, type JsonValue } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import type { ImageBlock } from '@omne-harness-lite/content-blocks'
import type { OpenEvent } from '../src/index.ts'

export const visibility = Object.freeze({ toHuman: true, toModel: true })
export const frameVisibility = Object.freeze({ toHuman: true, toModel: false })
export const modelTarget = Object.freeze({ kind: 'model_call', callId: 'mc_1', dispatch: 1 })
export const frameTarget = Object.freeze({ kind: 'tool_execution', callId: 'call_1' })
export function json(text: string): JsonValue {
  const parsed = readJsonStrict(text)
  if ('failed' in parsed) throw new Error('invalid test JSON')
  return parsed.ok
}
function blockId() {
  const parsed = parseOpaqueIdentifier('b_1', 'BlockId')
  if ('invalidInput' in parsed) throw new Error('invalid test id')
  return parsed.ok
}
export function opened(
  kind: 'text' | 'thinking' | 'voice',
  fill: 'append' | 'replace',
  frame = false,
): OpenEvent {
  const common = {
    t: 'open',
    index: 0,
    id: blockId(),
    visibility: frame ? frameVisibility : visibility,
  } as const
  return kind === 'voice'
    ? { ...common, kind, fill, head: { mediaType: 'audio/pcm' } }
    : { ...common, kind, fill }
}
export function image(frame = false): ImageBlock {
  return {
    kind: 'image',
    id: blockId(),
    visibility: frame ? frameVisibility : visibility,
    mediaType: 'image/png',
    data: { storage: 's', key: 'k', mediaType: 'image/png' },
  }
}
export const usage = Object.freeze({
  input_tokens: 1,
  output_tokens: 2,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  source: 'upstream',
})
export const cost = Object.freeze({ cost_usd: 0.1, source: 'upstream_usage' })
