import {
  isJsonNumber,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { getEncoding } from 'js-tiktoken'
import { imageSize } from 'image-size'
import { object } from '../json.ts'
import type { ModelDefinition } from '../definitions.ts'
import type { InputMeter, TokenMeasurement } from '../input-meter.ts'

// The OpenAI tiktoken source maps gpt-5* to o200k_base. This exact allowlist
// does not establish a GPT-6 mapping. The separately calibrated GPT-6 path below
// uses this encoding only as a surrogate and never claims tokenizer identity.
// Source: openai/tiktoken 4e71bbe0c078468e00fefbf94b39849389f346e5/model.py.
type ImageRule = 'patch' | 'unknown'
type ImageDetail = 'low' | 'high' | 'original' | 'auto'
const dataUrl =
  /^data:(image\/(?:png|jpeg|webp|gif));base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{4}|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==))$/u
function expectedImageType(mime: string): string | undefined {
  switch (mime) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    default:
      return undefined
  }
}

// OpenAI's vision input list permits GIF only when it has one frame. image-size
// reads GIF dimensions from the header, so inspect the block chain as well.
function singleFrameGif(bytes: Buffer): boolean {
  const version = bytes.toString('ascii', 0, 6)
  if (bytes.length < 14 || (version !== 'GIF87a' && version !== 'GIF89a')) return false
  let offset = 13
  const screenFlags = bytes[10]
  if (screenFlags === undefined) return false
  if (screenFlags & 0x80) offset += 3 * 2 ** ((screenFlags & 0x07) + 1)
  let frames = 0
  function skipSubBlocks(): boolean {
    while (offset < bytes.length) {
      const size = bytes[offset++]
      if (size === undefined) return false
      if (size === 0) return true
      offset += size
      if (offset > bytes.length) return false
    }
    return false
  }
  while (offset < bytes.length) {
    const marker = bytes[offset++]
    if (marker === 0x3b) return frames === 1 && offset === bytes.length
    if (marker === 0x21) {
      if (offset >= bytes.length) return false
      offset++ // extension label; all extension payloads are sub-block chains
      if (!skipSubBlocks()) return false
      continue
    }
    if (marker !== 0x2c || ++frames > 1 || offset + 9 > bytes.length) return false
    const imageFlags = bytes[offset + 8]
    if (imageFlags === undefined) return false
    offset += 9
    if (imageFlags & 0x80) offset += 3 * 2 ** ((imageFlags & 0x07) + 1)
    if (offset >= bytes.length) return false
    offset++ // LZW minimum code size
    if (!skipSubBlocks()) return false
  }
  return false
}

/** Named GPT-5.6 base image rules; private route conversion still makes the total estimated. */
function openAiBaseImageTokens(
  width: number,
  height: number,
  detail: ImageDetail,
): number | undefined {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > 65535 ||
    height > 65535
  )
    return undefined

  const maxDimension = detail === 'low' ? 512 : detail === 'high' ? 2048 : 65535
  const pixelScale = Math.min(1, maxDimension / Math.max(width, height))
  // The guide says to round the first fit to whole pixels without specifying
  // a direction. Floor is this estimator's convention, not an upstream-exact claim.
  let scaledWidth = pixelScale === 1 ? width : Math.floor(width * pixelScale)
  let scaledHeight = pixelScale === 1 ? height : Math.floor(height * pixelScale)
  if (scaledWidth < 1 || scaledHeight < 1) return undefined

  let patches = Math.ceil(scaledWidth / 32) * Math.ceil(scaledHeight / 32)
  if (detail === 'high' && patches > 2500) {
    const shrink = Math.sqrt((32 * 32 * 2500) / (scaledWidth * scaledHeight))
    const adjusted =
      shrink *
      Math.min(
        Math.floor((scaledWidth * shrink) / 32) / ((scaledWidth * shrink) / 32),
        Math.floor((scaledHeight * shrink) / 32) / ((scaledHeight * shrink) / 32),
      )
    scaledWidth = Math.floor(scaledWidth * adjusted)
    scaledHeight = Math.floor(scaledHeight * adjusted)
    if (scaledWidth < 1 || scaledHeight < 1) return undefined
    patches = Math.ceil(scaledWidth / 32) * Math.ceil(scaledHeight / 32)
  }
  if (patches > 30000) return undefined
  return Math.ceil((patches * 6) / 5)
}

function imageTokens(part: JsonObject, rule: ImageRule): number | undefined {
  if (rule !== 'patch') return undefined
  if (Object.keys(part).some(key => key !== 'type' && key !== 'image_url')) return undefined
  const image = part.image_url
  if (!object(image) || Object.keys(image).some(key => key !== 'url' && key !== 'detail'))
    return undefined
  if (
    image.detail !== undefined &&
    image.detail !== 'auto' &&
    image.detail !== 'original' &&
    image.detail !== 'low' &&
    image.detail !== 'high'
  )
    return undefined
  const match = typeof image.url === 'string' ? dataUrl.exec(image.url) : null
  if (!match?.[1] || !match[2]) return undefined
  const decoded = Buffer.from(match[2], 'base64')
  if (!decoded.length || decoded.toString('base64') !== match[2]) return undefined
  if (match[1] === 'image/gif' && !singleFrameGif(decoded)) return undefined
  try {
    const dimensions = imageSize(decoded)
    if (dimensions.type !== expectedImageType(match[1])) return undefined
    return openAiBaseImageTokens(dimensions.width, dimensions.height, image.detail ?? 'auto')
  } catch {
    return undefined
  }
}

function sanitizedBody(
  body: JsonObject,
  rule: ImageRule,
):
  | {
      readonly body: JsonObject
      readonly imageTokens: number
    }
  | undefined {
  if (!Array.isArray(body.messages)) return undefined
  let total = 0
  const messages: JsonValue[] = []
  for (const message of body.messages) {
    if (!object(message)) return undefined
    if (!Array.isArray(message.content)) {
      messages.push(message)
      continue
    }
    const parts: JsonValue[] = []
    for (const part of message.content) {
      if (!object(part)) return undefined
      if (part.type !== 'image_url') {
        parts.push(part)
        continue
      }
      if (message.role !== 'user') return undefined
      const tokens = imageTokens(part, rule)
      if (tokens === undefined) return undefined
      total += tokens
      const image = part.image_url
      if (!object(image)) return undefined
      parts.push({ ...part, image_url: { ...image, url: '[image]' } })
    }
    messages.push({ ...message, content: parts })
  }
  return { body: { ...body, messages }, imageTokens: total }
}

let sharedEncoder: ReturnType<typeof getEncoding> | undefined
function encoder(): ReturnType<typeof getEncoding> {
  sharedEncoder ??= getEncoding('o200k_base')
  return sharedEncoder
}

function imageRuleFor(modelId: string): ImageRule | undefined {
  switch (modelId) {
    case 'openai/gpt-5.6-sol':
    case 'openai/gpt-5.6-terra':
    case 'openai/gpt-5.6-luna':
      return 'patch'
    case 'openai/gpt-5.6-sol-pro':
    case 'openai/gpt-5.6-terra-pro':
    case 'openai/gpt-5.6-luna-pro':
      return 'unknown'
    default:
      return undefined
  }
}

// Calibrated independently for GPT-6 Sol and Luna on the fixed OpenAI route:
// baseline, length perturbation and untouched CJK/code holdout. The fixed +14
// matched those observations, not a proof of exact framing or an error bound.
function threeMessageTextTokens(
  body: JsonObject,
  modelId: string,
  tokenizer: ReturnType<typeof encoder>,
): number | undefined {
  if (
    body.model !== modelId ||
    Object.keys(body).some(
      key =>
        !['model', 'provider', 'stream', 'store', 'messages', 'reasoning', 'max_tokens'].includes(
          key,
        ),
    ) ||
    !object(body.provider) ||
    Object.keys(body.provider).some(
      key => !['order', 'allow_fallbacks', 'require_parameters'].includes(key),
    ) ||
    !Array.isArray(body.provider.order) ||
    body.provider.order.length !== 1 ||
    body.provider.order[0] !== 'openai' ||
    body.provider.allow_fallbacks !== false ||
    body.provider.require_parameters !== true ||
    body.stream !== true ||
    body.store !== false ||
    !object(body.reasoning) ||
    Object.keys(body.reasoning).length !== 1 ||
    body.reasoning.effort !== 'low' ||
    (body.max_tokens !== undefined && !isJsonNumber(body.max_tokens)) ||
    !Array.isArray(body.messages) ||
    body.messages.length !== 3
  )
    return undefined
  let tokens = 14
  for (const [index, message] of body.messages.entries()) {
    if (
      !object(message) ||
      Object.keys(message).some(key => key !== 'role' && key !== 'content') ||
      message.role !== ['system', 'developer', 'user'][index] ||
      !Array.isArray(message.content) ||
      message.content.length !== [1, 2, 1][index]
    )
      return undefined
    for (const part of message.content) {
      if (
        !object(part) ||
        Object.keys(part).some(key => key !== 'type' && key !== 'text') ||
        part.type !== 'text' ||
        typeof part.text !== 'string'
      )
        return undefined
      tokens += tokenizer.encode(part.text).length
    }
  }
  return tokens
}

/** Model-specific estimates; private OpenRouter/OpenAI formatting remains uncertain. */
export function createOpenAiInputMeter(definition: ModelDefinition): InputMeter {
  const gpt6Text =
    definition.modelId === 'openai/gpt-6-sol' || definition.modelId === 'openai/gpt-6-luna'
  const imageRule = imageRuleFor(definition.modelId)
  if (
    (!gpt6Text && !imageRule) ||
    definition.revision !== (gpt6Text ? '2' : '3') ||
    definition.implementation.name !== 'pi-ai:openai' ||
    definition.implementation.revision !== (gpt6Text ? 'mp4-2' : 'mp4-3') ||
    !Object.hasOwn(definition.routes, 'openai')
  )
    throw new TypeError('unsupported OpenAI input-meter binding')
  const tokenizer = encoder()
  const meter: InputMeter = {
    modelId: definition.modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider: 'openai',
    algorithmRevision: gpt6Text
      ? 'openai-gpt-6-text-three-message-o200k-surrogate-1'
      : 'openai-gpt-5.6-o200k-base-3',
    evidence: gpt6Text
      ? 'OpenRouter OpenAI GPT-6 Sol/Luna separate low-effort three-message baseline/fit/holdout, frozen o200k text surrogate +14; openai-v2-sol-luna-80fe189b-8a59-4d1b-89da-02cd553c97e8 (2026-09-28); exact tokenizer and whole-domain error unknown'
      : 'openai/tiktoken 4e71bbe0 model.py gpt-5 -> o200k_base; developers.openai.com/api/docs/guides/images-vision GPT-5.6 base detail/patch rules (2026-09-28); OpenRouter/OpenAI private chat formatting estimated',
    measure({ body, serialized }): TokenMeasurement {
      if (writeJsonLossless(body) !== serialized) return { kind: 'unavailable' }
      if (gpt6Text) {
        try {
          const tokens = threeMessageTextTokens(body, definition.modelId, tokenizer)
          return tokens === undefined ? { kind: 'unavailable' } : { kind: 'estimated', tokens }
        } catch {
          return { kind: 'unavailable' }
        }
      }
      if (!imageRule) return { kind: 'unavailable' }
      const projected = sanitizedBody(body, imageRule)
      if (!projected) return { kind: 'unavailable' }
      try {
        const textTokens = tokenizer.encode(writeJsonLossless(projected.body)).length
        return { kind: 'estimated', tokens: textTokens + projected.imageTokens }
      } catch {
        return { kind: 'unavailable' }
      }
    },
  }
  return Object.freeze(meter)
}
