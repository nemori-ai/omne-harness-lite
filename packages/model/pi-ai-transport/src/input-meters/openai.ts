import {
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
// deliberately excludes GPT-6: that source does not provide a GPT-6 mapping.
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

/** A model-specific GPT-5.6 estimator; private OpenRouter/OpenAI formatting remains unknown. */
export function createOpenAiInputMeter(definition: ModelDefinition): InputMeter {
  const imageRule = imageRuleFor(definition.modelId)
  if (
    !imageRule ||
    definition.revision !== '2' ||
    definition.implementation.name !== 'pi-ai:openai' ||
    definition.implementation.revision !== 'mp4-2' ||
    !Object.hasOwn(definition.routes, 'openai')
  )
    throw new TypeError('unsupported OpenAI input-meter binding')
  const tokenizer = encoder()
  const meter: InputMeter = {
    modelId: definition.modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider: 'openai',
    algorithmRevision: 'openai-gpt-5.6-o200k-base-2',
    evidence:
      'openai/tiktoken 4e71bbe0 model.py gpt-5 -> o200k_base; developers.openai.com/api/docs/guides/images-vision GPT-5.6 base detail/patch rules (2026-09-28); OpenRouter/OpenAI private chat formatting estimated',
    measure({ body, serialized }): TokenMeasurement {
      if (writeJsonLossless(body) !== serialized) return { kind: 'unavailable' }
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
