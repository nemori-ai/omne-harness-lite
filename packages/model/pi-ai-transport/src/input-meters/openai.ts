import { withEstimatedJsonMarginals, fullJsonMarginal } from './marginal.ts'
import { defineInputMeter } from '../input-meter.ts'
import {
  isJsonNumber,
  isNonNegativeJsonInteger,
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
    // The tokenizer basis covers visible reasoning text/summary and their
    // protocol metadata, not the context represented by encrypted payloads.
    // Keep the final wire intact: an unsupported detail makes the whole input
    // unavailable rather than dropping it or counting its ciphertext bytes.
    if (Object.hasOwn(message, 'reasoning_details')) {
      if (!Array.isArray(message.reasoning_details)) return undefined
      for (const detail of message.reasoning_details) {
        if (!object(detail)) return undefined
        const textKey =
          detail.type === 'reasoning.text'
            ? 'text'
            : detail.type === 'reasoning.summary'
              ? 'summary'
              : undefined
        if (
          textKey === undefined ||
          typeof detail[textKey] !== 'string' ||
          (detail.id !== undefined && detail.id !== null && typeof detail.id !== 'string') ||
          (detail.format !== undefined && typeof detail.format !== 'string') ||
          (detail.index !== undefined && !isNonNegativeJsonInteger(detail.index)) ||
          Object.keys(detail).some(key => !['type', textKey, 'id', 'index', 'format'].includes(key))
        )
          return undefined
      }
    }
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

function onlyKeys(value: JsonObject, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key))
}

function visibleTextParts(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      part =>
        object(part) &&
        onlyKeys(part, ['type', 'text']) &&
        part.type === 'text' &&
        typeof part.text === 'string',
    )
  )
}

/** Shared visible-history estimator; adoption remains scoped to each model binding. */
function visibleHistoryTokens(
  body: JsonObject,
  modelId: string,
  tokenizer: ReturnType<typeof encoder>,
): number | undefined {
  // Only Sol's new exact binding adopts all of its declared effort values.
  // Include the final controls in its surrogate, without inventing defaults.
  // Luna retains its published low-effort/messages+tools algorithm unchanged.
  const solFinal = modelId === 'openai/gpt-6-sol'
  const reasoningValid = solFinal
    ? body.reasoning === undefined ||
      (object(body.reasoning) &&
        onlyKeys(body.reasoning, ['effort']) &&
        ['none', 'low', 'medium', 'high', 'max'].includes(String(body.reasoning.effort)))
    : object(body.reasoning) &&
      onlyKeys(body.reasoning, ['effort']) &&
      body.reasoning.effort === 'low'
  if (
    body.model !== modelId ||
    !onlyKeys(body, [
      'model',
      'provider',
      'stream',
      'store',
      'messages',
      'tools',
      'reasoning',
      'max_tokens',
    ]) ||
    !object(body.provider) ||
    !onlyKeys(body.provider, ['order', 'allow_fallbacks', 'require_parameters']) ||
    !Array.isArray(body.provider.order) ||
    body.provider.order.length !== 1 ||
    body.provider.order[0] !== 'openai' ||
    body.provider.allow_fallbacks !== false ||
    body.provider.require_parameters !== true ||
    body.stream !== true ||
    body.store !== false ||
    !reasoningValid ||
    (body.max_tokens !== undefined && !isJsonNumber(body.max_tokens)) ||
    !Array.isArray(body.messages) ||
    !body.messages.length ||
    (body.tools !== undefined && (!Array.isArray(body.tools) || !body.tools.length))
  )
    return undefined

  for (const message of body.messages) {
    if (!object(message) || typeof message.role !== 'string') return undefined
    switch (message.role) {
      case 'system':
      case 'developer':
      case 'user':
        if (!onlyKeys(message, ['role', 'content']) || !visibleTextParts(message.content))
          return undefined
        break
      case 'assistant':
        if (
          !onlyKeys(message, ['role', 'content', 'tool_calls', 'reasoning']) ||
          typeof message.content !== 'string' ||
          (message.reasoning !== undefined && typeof message.reasoning !== 'string') ||
          (message.tool_calls !== undefined &&
            (!Array.isArray(message.tool_calls) ||
              !message.tool_calls.length ||
              !message.tool_calls.every(
                call =>
                  object(call) &&
                  onlyKeys(call, ['id', 'type', 'function']) &&
                  typeof call.id === 'string' &&
                  call.type === 'function' &&
                  object(call.function) &&
                  onlyKeys(call.function, ['name', 'arguments']) &&
                  typeof call.function.name === 'string' &&
                  typeof call.function.arguments === 'string',
              )))
        )
          return undefined
        break
      case 'tool':
        if (
          !onlyKeys(message, ['role', 'tool_call_id', 'content']) ||
          typeof message.tool_call_id !== 'string' ||
          typeof message.content !== 'string'
        )
          return undefined
        break
      default:
        return undefined
    }
  }

  if (Array.isArray(body.tools))
    for (const tool of body.tools) {
      if (
        !object(tool) ||
        !onlyKeys(tool, ['type', 'function']) ||
        tool.type !== 'function' ||
        !object(tool.function) ||
        !onlyKeys(tool.function, ['name', 'description', 'parameters']) ||
        typeof tool.function.name !== 'string' ||
        typeof tool.function.description !== 'string' ||
        !object(tool.function.parameters)
      )
        return undefined
    }

  const visible: JsonObject = {
    messages: body.messages,
    ...(body.tools === undefined ? {} : { tools: body.tools }),
  }
  return tokenizer.encode(writeJsonLossless(solFinal ? body : visible)).length
}

/** Model-specific estimates; private OpenRouter/OpenAI formatting remains uncertain. */
export function createOpenAiInputMeter(definition: ModelDefinition): InputMeter {
  const gpt6SolVisibleHistory = definition.modelId === 'openai/gpt-6-sol'
  const gpt6LunaVisibleHistory = definition.modelId === 'openai/gpt-6-luna'
  const imageRule = imageRuleFor(definition.modelId)
  const revision = gpt6SolVisibleHistory || gpt6LunaVisibleHistory ? '3' : '4'
  const implementationRevision = gpt6SolVisibleHistory
    ? 'mp4-6'
    : gpt6LunaVisibleHistory
      ? 'mp4-4'
      : 'mp4-5'
  if (
    (!gpt6SolVisibleHistory && !gpt6LunaVisibleHistory && !imageRule) ||
    definition.revision !== revision ||
    definition.implementation.name !== 'pi-ai:openai' ||
    definition.implementation.revision !== implementationRevision ||
    !Object.hasOwn(definition.routes, 'openai')
  )
    throw new TypeError('unsupported OpenAI input-meter binding')
  const tokenizer = encoder()
  const meter = defineInputMeter({
    modelId: definition.modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider: 'openai',
    algorithmRevision: gpt6SolVisibleHistory
      ? 'openai-gpt-6-sol-final-visible-json-o200k-1'
      : gpt6LunaVisibleHistory
        ? 'openai-gpt-6-luna-visible-history-json-o200k-1'
        : 'openai-gpt-5.6-o200k-base-4',
    evidence: gpt6SolVisibleHistory
      ? 'OpenRouter OpenAI GPT-6 Sol low-effort o200k text surrogate baseline/length/CJK-code holdout (2026-09-28); complete visible final-request JSON includes controls and extends the surrogate to protocol framing as an estimate; OpenAI reasoning guide separates mode/effort (2026-09-29), declared Sol efforts and absent effort counted as sent; live multi-turn/effort errors and private framing remain unverified'
      : gpt6LunaVisibleHistory
        ? 'OpenRouter OpenAI GPT-6 Luna low-effort visible text/tool/reminder history: three frozen full-wire live requests and independent generation GET (2026-09-28), estimated 126/302/410 versus actual input 70/178/236; error outside these samples and private framing unknown'
        : 'openai/tiktoken 4e71bbe0 model.py gpt-5 -> o200k_base; developers.openai.com/api/docs/guides/images-vision GPT-5.6 base detail/patch rules (2026-09-28); OpenRouter/OpenAI private chat formatting estimated; reasoning replay limited to visible text/summary, encrypted or unknown details have no applicable token basis',
    ...(gpt6SolVisibleHistory
      ? { tokenizerRevision: 'js-tiktoken-1.0.21/o200k-base-gpt6-sol-surrogate/1' }
      : {}),
    measureFull({ body, serialized }): TokenMeasurement {
      if (writeJsonLossless(body) !== serialized) return { kind: 'unavailable' }
      if (gpt6SolVisibleHistory || gpt6LunaVisibleHistory) {
        try {
          const tokens = visibleHistoryTokens(body, definition.modelId, tokenizer)
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
  })
  return withEstimatedJsonMarginals(meter, input => {
    if (!gpt6SolVisibleHistory && !gpt6LunaVisibleHistory) return fullJsonMarginal(meter, input)
    if (!input.units.length) return { kind: 'exact', tokens: 0 }
    const { tools: _tools, ...envelope } = input.envelope
    const tokens = visibleHistoryTokens(
      { ...envelope, messages: input.units },
      definition.modelId,
      tokenizer,
    )
    return tokens === undefined
      ? { kind: 'unavailable' }
      : {
          kind: 'estimated',
          tokens:
            tokens -
            tokenizer.encode(
              writeJsonLossless(
                gpt6SolVisibleHistory ? { ...envelope, messages: [] } : { messages: [] },
              ),
            ).length,
        }
  })
}
