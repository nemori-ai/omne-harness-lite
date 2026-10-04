import { defineInputMeter } from '../input-meter.ts'
import {
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { object } from '../json.ts'
import type {ModelDefinition} from '@omne-harness-lite/model-request-runtime'
import type { FullMeterInput, InputMeter, TokenMeasurement } from '@omne-harness-lite/model-request-runtime'
import { createXaiInputMeter, createXaiVisibleBodyCounter } from './xai.ts'

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
  if (!object(value) || !projectedFieldsValid(value)) return undefined
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
    if (!projectImage(part, value)) return undefined
  }
  return { message: { ...value, content: parts }, images }

  function projectImage(part: JsonObject, value: JsonObject): boolean {
    if (
      part.type !== 'image_url' ||
      value.role !== 'user' ||
      Object.keys(part).some(key => key !== 'type' && key !== 'image_url')
    )
      return false
    const image = part.image_url
    if (!candidateImageValid(image)) return false
    images++
    parts.push({ ...part, image_url: { ...image, url: '[image]' } })
    return true
  }
}

function projectedFieldsValid(value: JsonObject): boolean {
  if (Object.keys(value).some(key => !messageFields.has(key))) return false
  if (!['system', 'user', 'assistant', 'tool'].includes(String(value.role))) return false
  if (Object.hasOwn(value, 'reasoning_details')) return false // opaque replay is not text
  if (value.reasoning !== undefined && typeof value.reasoning !== 'string') return false
  if (value.tool_call_id !== undefined && typeof value.tool_call_id !== 'string') return false
  if (value.tool_calls !== undefined && !Array.isArray(value.tool_calls)) return false
  return true
}

function candidateImageValid(image: unknown): image is JsonObject {
  if (
    !object(image) ||
    Object.keys(image).some(key => key !== 'url' && key !== 'detail') ||
    typeof image.url !== 'string'
  )
    return false
  const match = imageUrl.exec(image.url)
  if (!match?.[1]) return false
  const decoded = Buffer.from(match[1], 'base64')
  if (!decoded.length || decoded.toString('base64') !== match[1]) return false
  return true
}

function candidateProviderSupported(body: JsonObject): boolean {
  return !(
    !object(body.provider) ||
    !Array.isArray(body.provider.order) ||
    body.provider.order.length !== 1 ||
    body.provider.order[0] !== 'xai' ||
    body.provider.allow_fallbacks !== false ||
    body.provider.require_parameters !== true
  )
}

/** Unbound, first-party-sourced candidate for the two fixed Grok routes. */
export function createXaiCandidateInputMeter(definition: ModelDefinition): InputMeter {
  if (
    (definition.modelId !== 'x-ai/grok-4.6' && definition.modelId !== 'x-ai/grok-4.7') ||
    definition.revision !== '3' ||
    definition.implementation.name !== 'pi-ai:xai' ||
    definition.implementation.revision !== 'mp4-17' ||
    !Object.hasOwn(definition.routes, 'xai')
  )
    throw new TypeError('unsupported xAI candidate binding')
  const meter = defineInputMeter({
    modelId: definition.modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider: 'xai',
    algorithmRevision: 'grok-build-wire-projection-candidate-1',
    evidence:
      'xai-org/grok-build f0e3be1100ef5252488e3be8bb0e91cf68d8c305 xai-token-estimation/src/lib.rs and xai-chat-state/src/actor/state.rs; OpenRouter wire projection and image constant require per-route calibration',
    measureFull({ body, serialized }): TokenMeasurement {
      if (
        body.model !== definition.modelId ||
        writeJsonLossless(body) !== serialized ||
        Object.keys(body).some(key => !bodyFields.has(key)) ||
        !candidateProviderSupported(body) ||
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
  })
  return Object.freeze(meter)
}

/**
 * Unbound same-route history candidate. A single OpenRouter xai-responses-v1
 * summary followed by its encrypted item projects to one native reasoning item;
 * the ordinary JSON envelope remains in the established visible-wire estimate.
 * The ciphertext and order in the owned send body are never changed.
 */
export function createXaiHistoryCandidateInputMeter(
  definition: ModelDefinition,
): InputMeter | undefined {
  const visible = createXaiInputMeter(definition)
  const countVisible = createXaiVisibleBodyCounter(definition)
  if (!visible || !countVisible) return undefined
  const meter = defineInputMeter({
    modelId: visible.modelId,
    definitionRevision: visible.definitionRevision,
    implementation: visible.implementation,
    provider: visible.provider,
    algorithmRevision: `${visible.algorithmRevision}-xai-responses-v1-history-candidate-1`,
    evidence:
      'xai-org/grok-build f0e3be1100ef5252488e3be8bb0e91cf68d8c305 state.rs:87-92; OpenRouter xai-responses-v1 summary/encrypted replay; final-wire envelope plus existing visible calibration, estimated only',
    measureFull({ body, serialized }): TokenMeasurement {
      if (
        writeJsonLossless(body) !== serialized ||
        !Array.isArray(body.messages) ||
        body.messages.length === 0
      )
        return { kind: 'unavailable' }
      const messages: JsonValue[] = []
      let encodedPayloadBytes = 0
      let nativeReasoningTokens = 0
      let sawHistory = false
      for (const raw of body.messages) {
        if (!object(raw)) return { kind: 'unavailable' }
        if (!projectHistoryMessage(raw)) return { kind: 'unavailable' }
      }
      if (!sawHistory) return countVisible({ body, serialized })
      return historyMeasurement(countVisible)

      function projectHistoryMessage(raw: JsonObject): boolean {
        if (!Object.hasOwn(raw, 'reasoning_details')) {
          messages.push(raw)
          return true
        }
        const reasoning = historyReasoning(raw)
        if (!reasoning) return false
        const { summary, encrypted } = reasoning
        const summaryText = summary && typeof summary.summary === 'string' ? summary.summary : ''
        const summaryBytes = Buffer.byteLength(summaryText, 'utf8')
        const ciphertextBytes = Buffer.byteLength(encrypted.data, 'utf8')
        // Grok Build counts visible and encrypted representations as the same
        // reasoning, using max(text bytes, encrypted bytes * 3/4) / 4.
        nativeReasoningTokens += Math.floor(
          Math.max(summaryBytes, Math.floor((ciphertextBytes * 3) / 4)) / bytesPerToken,
        )
        encodedPayloadBytes += Buffer.byteLength(writeJsonLossless(encrypted.data), 'utf8')
        if (summary)
          encodedPayloadBytes += Buffer.byteLength(writeJsonLossless(summaryText), 'utf8')
        const { reasoning_details: _details, ...rest } = raw
        messages.push(rest)
        sawHistory = true
        return true
      }

      function historyMeasurement(
        count: (input: Pick<FullMeterInput, 'body' | 'serialized'>) => TokenMeasurement,
      ): TokenMeasurement {
        const visibleBody = { ...body, messages }
        const visibleSerialized = writeJsonLossless(visibleBody)
        const base = count({ body: visibleBody, serialized: visibleSerialized })
        if (base.kind !== 'estimated' || typeof base.tokens !== 'number')
          return { kind: 'unavailable' }
        const visibleBytes = Buffer.byteLength(visibleSerialized, 'utf8')
        const envelopeBytes =
          Buffer.byteLength(serialized, 'utf8') - visibleBytes - encodedPayloadBytes
        if (!Number.isSafeInteger(envelopeBytes) || envelopeBytes < 0)
          return { kind: 'unavailable' }
        const offset = base.tokens - Math.floor(visibleBytes / bytesPerToken)
        const tokens =
          Math.floor((visibleBytes + envelopeBytes) / bytesPerToken) +
          offset +
          nativeReasoningTokens
        return Number.isSafeInteger(tokens) && tokens >= 0
          ? { kind: 'estimated', tokens }
          : { kind: 'unavailable' }
      }
    },
  })
  return Object.freeze(meter)
}

function historyReasoning(raw: JsonObject):
  | {
      readonly summary: JsonObject | undefined
      readonly encrypted: JsonObject & { readonly data: string }
    }
  | undefined {
  if (raw.role !== 'assistant' || raw.reasoning !== undefined) return undefined
  const details = raw.reasoning_details
  if (!Array.isArray(details) || (details.length !== 1 && details.length !== 2)) return undefined
  const summary = details.length === 2 ? details[0] : undefined
  const encrypted = details[details.length - 1]
  if (!historySummaryValid(summary) || !historyEncryptedValid(encrypted, summary)) return undefined
  return { summary, encrypted }
}

function historySummaryValid(summary: unknown): summary is JsonObject | undefined {
  return !(
    summary !== undefined &&
    (!object(summary) ||
      Object.keys(summary).some(key => !['type', 'summary', 'format', 'index'].includes(key)) ||
      summary.type !== 'reasoning.summary' ||
      summary.format !== 'xai-responses-v1' ||
      summary.index !== 0 ||
      typeof summary.summary !== 'string')
  )
}

function historyEncryptedValid(
  encrypted: unknown,
  summary: JsonObject | undefined,
): encrypted is JsonObject & { readonly data: string } {
  return !(
    !object(encrypted) ||
    Object.keys(encrypted).some(key => !['type', 'data', 'format', 'id', 'index'].includes(key)) ||
    encrypted.type !== 'reasoning.encrypted' ||
    encrypted.format !== 'xai-responses-v1' ||
    encrypted.index !== (summary ? 1 : 0) ||
    typeof encrypted.id !== 'string' ||
    encrypted.id.length === 0 ||
    typeof encrypted.data !== 'string' ||
    encrypted.data.length === 0 ||
    !/^[A-Za-z0-9+/_=-]+\.[A-Za-z0-9+/_=-]+$/u.test(encrypted.data)
  )
}
