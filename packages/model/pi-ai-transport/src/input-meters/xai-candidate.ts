import {
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { object } from '../json.ts'
import type { ModelDefinition } from '../definitions.ts'
import type { InputMeter, TokenMeasurement } from '../input-meter.ts'

// xAI grok-build f0e3be1 uses UTF-8 bytes / 4 and 765 per image for its own
// compaction estimate. This projection counts final OpenRouter JSON framing too;
// that extrapolation is deliberately a calibration candidate, not a route claim.
const bytesPerToken = 4
const imageTokens = 765
const imageUrl =
  /^data:image\/(?:png|jpeg);base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==))$/u
const bodyFields = new Set([
  'model',
  'provider',
  'messages',
  'tools',
  'stream',
  'store',
  'reasoning',
  'max_tokens',
])
const messageFields = new Set([
  'role',
  'content',
  'tool_calls',
  'tool_call_id',
  'reasoning',
  'reasoning_details',
])

function projectedMessage(value: JsonValue): { message: JsonObject; images: number } | undefined {
  if (!object(value) || Object.keys(value).some(key => !messageFields.has(key))) return undefined
  if (!['system', 'user', 'assistant', 'tool'].includes(String(value.role))) return undefined
  if (Object.hasOwn(value, 'reasoning_details')) return undefined // opaque replay is not text
  if (value.reasoning !== undefined && typeof value.reasoning !== 'string') return undefined
  if (value.tool_call_id !== undefined && typeof value.tool_call_id !== 'string') return undefined
  if (value.tool_calls !== undefined && !Array.isArray(value.tool_calls)) return undefined
  if (typeof value.content === 'string') return { message: value, images: 0 }
  if (!Array.isArray(value.content)) return undefined
  let images = 0
  const parts: JsonValue[] = []
  for (const part of value.content) {
    if (!object(part)) return undefined
    if (
      part.type === 'text' &&
      typeof part.text === 'string' &&
      Object.keys(part).every(key => key === 'type' || key === 'text')
    ) {
      parts.push(part)
      continue
    }
    if (
      part.type !== 'image_url' ||
      value.role !== 'user' ||
      Object.keys(part).some(key => key !== 'type' && key !== 'image_url')
    )
      return undefined
    const image = part.image_url
    if (
      !object(image) ||
      Object.keys(image).some(key => key !== 'url' && key !== 'detail') ||
      typeof image.url !== 'string'
    )
      return undefined
    const match = imageUrl.exec(image.url)
    if (!match?.[1]) return undefined
    const decoded = Buffer.from(match[1], 'base64')
    if (!decoded.length || decoded.toString('base64') !== match[1]) return undefined
    images++
    parts.push({ ...part, image_url: { ...image, url: '[image]' } })
  }
  return { message: { ...value, content: parts }, images }
}

/** Unbound, first-party-sourced candidate for the two fixed Grok routes. */
export function createXaiCandidateInputMeter(definition: ModelDefinition): InputMeter {
  if (
    (definition.modelId !== 'x-ai/grok-4.6' && definition.modelId !== 'x-ai/grok-4.7') ||
    definition.revision !== '1' ||
    definition.implementation.name !== 'pi-ai:xai' ||
    definition.implementation.revision !== 'mp4-1' ||
    !Object.hasOwn(definition.routes, 'xai')
  )
    throw new TypeError('unsupported xAI candidate binding')
  const meter: InputMeter = {
    modelId: definition.modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider: 'xai',
    algorithmRevision: 'grok-build-wire-projection-candidate-1',
    evidence:
      'xai-org/grok-build f0e3be1100ef5252488e3be8bb0e91cf68d8c305 xai-token-estimation/src/lib.rs and xai-chat-state/src/actor/state.rs; OpenRouter wire projection and image constant require per-route calibration',
    measure({ body, serialized }): TokenMeasurement {
      if (
        body.model !== definition.modelId ||
        writeJsonLossless(body) !== serialized ||
        Object.keys(body).some(key => !bodyFields.has(key)) ||
        !object(body.provider) ||
        !Array.isArray(body.provider.order) ||
        body.provider.order.length !== 1 ||
        body.provider.order[0] !== 'xai' ||
        body.provider.allow_fallbacks !== false ||
        body.provider.require_parameters !== true ||
        !Array.isArray(body.messages) ||
        (body.tools !== undefined && !Array.isArray(body.tools))
      )
        return { kind: 'unavailable' }
      const messages: JsonValue[] = []
      let images = 0
      for (const raw of body.messages) {
        const projected = projectedMessage(raw)
        if (!projected) return { kind: 'unavailable' }
        messages.push(projected.message)
        images += projected.images
      }
      const projected = { ...body, messages }
      const tokens =
        Math.floor(Buffer.byteLength(writeJsonLossless(projected), 'utf8') / bytesPerToken) +
        images * imageTokens
      return Number.isSafeInteger(tokens) ? { kind: 'estimated', tokens } : { kind: 'unavailable' }
    },
  }
  return Object.freeze(meter)
}
