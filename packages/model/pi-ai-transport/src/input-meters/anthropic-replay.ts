import { isNonNegativeJsonInteger, type JsonValue } from '@omne-harness-lite/content-blocks'
import { object } from '../json.ts'

export const ANTHROPIC_HISTORY_ALGORITHM =
  'anthropic-legacy-bpe-plus-vision-patches-complete-output-5'
export const ANTHROPIC_TOKENIZER_REVISION =
  'tokenizer-basis/anthropic-legacy-bpe-plus-vision-patches-4'
export const ANTHROPIC_REPLAY_REVISION =
  'anthropic-complete-signed-encrypted-output-zero-framing-estimated/1'

/** Original facts, not executable old factory aliases. D107 priority-family revision 5. */
export const anthropicOriginalMeter = Object.freeze({
  definitionRevision: '3',
  implementationRevision: 'mp4-17',
  algorithmRevision: 'anthropic-legacy-bpe-plus-vision-patches-4/response-calibration-1',
  tokenizerRevision: ANTHROPIC_TOKENIZER_REVISION,
  replayRevision: 'visible-final-units-json-net-estimated/1',
  transformRevision: 'openrouter-wire/2',
  projectionRevision: 'openrouter-input-projection/2',
})

/** All four leaves share one contribution formula; only the prefix obligation differs. */
export const anthropicReplayModels = Object.freeze([
  Object.freeze({ modelId: 'anthropic/claude-opus-5.5', requiresSignedPrefix: true }),
  Object.freeze({ modelId: 'anthropic/claude-opus-5', requiresSignedPrefix: false }),
  Object.freeze({ modelId: 'anthropic/claude-sonnet-5', requiresSignedPrefix: false }),
  Object.freeze({ modelId: 'anthropic/claude-fable-5.1', requiresSignedPrefix: true }),
])

export const anthropicReplayEfforts = Object.freeze(['low', 'medium', 'high', 'max'])

/**
 * Called only on owned JSON. Anthropic text is a display summary; its signature
 * carries opaque thinking. Unknown/unsigned details never become visible BPE.
 * Unknown JSON members are retained by the wire projector, not removed here.
 */
export function classifyAnthropicReasoning(
  details: JsonValue | undefined,
): 'visible' | 'wholeGroup' | 'unavailable' {
  if (details === undefined) return 'visible'
  if (!Array.isArray(details) || details.length === 0) return 'unavailable'
  for (const detail of details) {
    if (
      !object(detail) ||
      detail.format !== 'anthropic-claude-v1' ||
      (detail.id !== undefined && detail.id !== null && typeof detail.id !== 'string') ||
      (detail.index !== undefined && !isNonNegativeJsonInteger(detail.index))
    )
      return 'unavailable'
    if (detail.type === 'reasoning.text') {
      if (
        typeof detail.text !== 'string' ||
        typeof detail.signature !== 'string' ||
        detail.signature.length === 0
      )
        return 'unavailable'
    } else if (detail.type === 'reasoning.encrypted') {
      if (typeof detail.data !== 'string' || detail.data.length === 0) return 'unavailable'
    } else return 'unavailable'
  }
  return 'wholeGroup'
}
