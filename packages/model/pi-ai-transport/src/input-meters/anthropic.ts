import { unsupportedToolCall, unsupportedTool } from './wire-validation.ts'
import { fullOutputHistory, newOutputHistory, replayOutputHistory } from './output-history.ts'
import {
  anthropicOutputHistoryPolicy,
  anthropicReplayModels,
  ANTHROPIC_HISTORY_ALGORITHM,
  ANTHROPIC_REPLAY_REVISION,
  ANTHROPIC_TOKENIZER_REVISION,
} from './anthropic-replay.ts'
import { defineInputMeter } from '../input-meter.ts'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  isJsonNumber,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { imageSize } from 'image-size'
import { Tiktoken } from 'js-tiktoken/lite'
import { object } from '../json.ts'
import type {ModelDefinition} from '@omne-harness-lite/model-request-runtime'
import type { FullMeterInput, InputMeter, TokenMeasurement } from '@omne-harness-lite/model-request-runtime'

// This archived Claude BPE is an Anthropic-described *very rough approximation*
// for models since Claude 3. It is not the Claude 4.7+/5 tokenizer.
// https://github.com/anthropics/anthropic-tokenizer-typescript/tree/4d75e64d32fe5cd2b5a24d954242f9fab12e8b4b
const artifactSha256 = '58dad83d85e9cd57be209172449ebfbc395df2b455c11fe8b7e5b661e6f462ad'
const artifact = new URL('../../tokenizers/anthropic-legacy/claude.json', import.meta.url)
const dataUrl =
  /^data:(image\/(?:png|jpeg|webp|gif));base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{4}|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==))$/u
const highResolutionEdge = 2576
const highResolutionVisualTokens = 4784

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

function visualTokens(width: number, height: number): number | undefined {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1)
    return undefined
  const patchTokens = (w: number, h: number): number => Math.ceil(w / 28) * Math.ceil(h / 28)
  const fits = (w: number, h: number): boolean =>
    Math.ceil(w / 28) * 28 <= highResolutionEdge &&
    Math.ceil(h / 28) * 28 <= highResolutionEdge &&
    patchTokens(w, h) <= highResolutionVisualTokens
  if (fits(width, height)) return patchTokens(width, height)

  // Anthropic's published resize reference searches the longest edge for the
  // largest aspect-preserving size satisfying both limits. Its private image
  // preprocessing and OpenRouter conversion still make this an estimate.
  const longEdge = Math.max(width, height)
  const shortEdge = Math.min(width, height)
  const aspect = longEdge / shortEdge
  let lo = 1,
    hi = longEdge
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (fits(mid, Math.max(Math.round(mid / aspect), 1))) lo = mid
    else hi = mid
  }
  const resized = Math.max(Math.round(lo / aspect), 1)
  return patchTokens(lo, resized)
}

function imageTokens(part: JsonObject): number | undefined {
  if (Object.keys(part).some(key => key !== 'type' && key !== 'image_url')) return undefined
  const image = part.image_url
  if (!object(image) || Object.keys(image).some(key => key !== 'url')) return undefined
  const match = typeof image.url === 'string' ? dataUrl.exec(image.url) : null
  if (!match?.[1] || !match[2]) return undefined
  const decoded = Buffer.from(match[2], 'base64')
  if (!decoded.length || decoded.toString('base64') !== match[2]) return undefined
  try {
    const dimensions = imageSize(decoded)
    if (dimensions.type !== expectedImageType(match[1])) return undefined
    return visualTokens(dimensions.width, dimensions.height)
  } catch {
    return undefined
  }
}

function legacyEncoder(): Tiktoken {
  const bytes = readFileSync(artifact)
  if (createHash('sha256').update(bytes).digest('hex') !== artifactSha256)
    throw new Error('Anthropic legacy tokenizer artifact digest mismatch')
  const parsed: unknown = JSON.parse(bytes.toString('utf8'))
  if (
    !object(parsed) ||
    typeof parsed.pat_str !== 'string' ||
    typeof parsed.bpe_ranks !== 'string' ||
    !object(parsed.special_tokens)
  )
    throw new Error('invalid Anthropic legacy tokenizer artifact')
  const specialTokens: Record<string, number> = {}
  for (const [token, id] of Object.entries(parsed.special_tokens)) {
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 0)
      throw new Error('invalid Anthropic legacy tokenizer special token')
    specialTokens[token] = id
  }
  return new Tiktoken({
    pat_str: parsed.pat_str,
    bpe_ranks: parsed.bpe_ranks,
    special_tokens: specialTokens,
  })
}

let sharedEncoder: Tiktoken | undefined
function encoder(): Tiktoken {
  sharedEncoder ??= legacyEncoder()
  return sharedEncoder
}

const requestControls = new Set([
  'model',
  'provider',
  'stream',
  'store',
  'reasoning',
  'max_tokens',
  'stop',
])
const messageFields = new Set([
  'role',
  'content',
  'tool_calls',
  'tool_call_id',
  'reasoning',
  'reasoning_details',
])

function supportedInputBody(
  body: JsonObject,
  ttlValues: ReadonlySet<string>,
  images: Map<JsonObject, number>,
): boolean {
  const unsupportedField = (key: string): boolean =>
    key !== 'messages' && key !== 'tools' && !requestControls.has(key)
  if (Object.keys(body).some(unsupportedField)) return false
  function providerSupported(): boolean {
    return !(
      !object(body.provider) ||
      Object.keys(body.provider).some(
        key => key !== 'order' && key !== 'allow_fallbacks' && key !== 'require_parameters',
      ) ||
      !Array.isArray(body.provider.order) ||
      body.provider.order.length !== 1 ||
      body.provider.order[0] !== 'anthropic' ||
      body.provider.allow_fallbacks !== false ||
      body.provider.require_parameters !== true
    )
  }
  function controlsSupported(): boolean {
    return !(
      (body.stream !== undefined && typeof body.stream !== 'boolean') ||
      (body.store !== undefined && typeof body.store !== 'boolean') ||
      !reasoningSupported() ||
      (body.max_tokens !== undefined && !isJsonNumber(body.max_tokens)) ||
      (body.stop !== undefined &&
        (!Array.isArray(body.stop) || !body.stop.every(item => typeof item === 'string')))
    )
  }
  function reasoningSupported(): boolean {
    return !(
      body.reasoning !== undefined &&
      (!object(body.reasoning) ||
        Object.keys(body.reasoning).some(key => key !== 'effort') ||
        typeof body.reasoning.effort !== 'string')
    )
  }
  if (!providerSupported() || !controlsSupported()) return false
  if (!Array.isArray(body.messages)) return false
  if (body.tools !== undefined && !Array.isArray(body.tools)) return false
  if (Array.isArray(body.tools) && body.tools.some(unsupportedTool)) return false
  for (const message of body.messages) {
    if (!supportedMessage(message, ttlValues, images)) return false
  }
  return true
}

function supportedMessage(
  message: JsonValue,
  ttlValues: ReadonlySet<string>,
  images: Map<JsonObject, number>,
): boolean {
  if (!object(message)) return false
  if (!supportedMessageFields(message)) return false
  if (!supportedToolCalls(message)) return false
  return supportedContent(message, ttlValues, images)
}

function supportedMessageFields(message: JsonObject): boolean {
  if (
    Object.keys(message).some(key => !messageFields.has(key)) ||
    (message.role !== 'system' &&
      message.role !== 'user' &&
      message.role !== 'assistant' &&
      message.role !== 'tool')
  )
    return false
  // Signed text can be a display summary. Only the shared complete-group
  // contribution may account for replay details, never this visible counter.
  if (Object.hasOwn(message, 'reasoning_details')) return false
  if (message.reasoning !== undefined && typeof message.reasoning !== 'string') return false
  if (message.tool_call_id !== undefined && typeof message.tool_call_id !== 'string') return false
  return true
}

function supportedContent(
  message: JsonObject,
  ttlValues: ReadonlySet<string>,
  images: Map<JsonObject, number>,
): boolean {
  if (typeof message.content === 'string') return true
  if (!Array.isArray(message.content)) return false
  for (const part of message.content) {
    if (object(part) && part.type === 'image_url') {
      const tokens = message.role === 'user' ? imageTokens(part) : undefined
      if (tokens === undefined) return false
      images.set(part, tokens)
      continue
    }
    if (!supportedTextPart(part, ttlValues)) return false
  }
  return true
}

function supportedToolCalls(message: JsonObject): boolean {
  return !(
    message.tool_calls !== undefined &&
    (!Array.isArray(message.tool_calls) || message.tool_calls.some(unsupportedToolCall))
  )
}

function supportedTextPart(part: JsonValue, ttlValues: ReadonlySet<string>): boolean {
  return !(
    !object(part) ||
    part.type !== 'text' ||
    typeof part.text !== 'string' ||
    Object.keys(part).some(key => key !== 'type' && key !== 'text' && key !== 'cache_control') ||
    !supportedCacheControl(part, ttlValues)
  )
}

function supportedCacheControl(part: JsonObject, ttlValues: ReadonlySet<string>): boolean {
  return !(
    part.cache_control !== undefined &&
    (!object(part.cache_control) ||
      Object.keys(part.cache_control).some(key => key !== 'type' && key !== 'ttl') ||
      part.cache_control.type !== 'ephemeral' ||
      typeof part.cache_control.ttl !== 'string' ||
      !ttlValues.has(part.cache_control.ttl))
  )
}

/** Four exact Anthropic routes share one narrow estimated-input implementation. */
export function createAnthropicInputMeter(definition: ModelDefinition): InputMeter {
  if (
    !anthropicReplayModels.some(row => row.modelId === definition.modelId) ||
    definition.revision !== '4' ||
    definition.implementation.name !== 'pi-ai:anthropic' ||
    definition.implementation.revision !== 'mp4-18' ||
    !Object.hasOwn(definition.routes, 'anthropic')
  )
    throw new TypeError('unsupported Anthropic input-meter binding')
  const cache = definition.routes.anthropic?.cache
  if (cache?.mode !== 'explicit') throw new TypeError('unsupported Anthropic cache declaration')
  const ttlValues = new Set(cache.ttlValues)
  const tokenizer = encoder()
  const countBody = ({
    body,
    serialized,
  }: Pick<FullMeterInput, 'body' | 'serialized'>): TokenMeasurement => {
    if (body.model !== definition.modelId || writeJsonLossless(body) !== serialized)
      return { kind: 'unavailable' }
    const images = new Map<JsonObject, number>()
    if (!Array.isArray(body.messages) || !supportedInputBody(body, ttlValues, images))
      return { kind: 'unavailable' }
    try {
      // Archived NFKC BPE is a rough surrogate. Cache markers select reuse, not prompt text.
      let visualTotal = 0
      const projectMessage = (message: JsonValue): JsonValue => {
        if (!object(message) || !Array.isArray(message.content)) return message
        return {
          ...message,
          content: message.content.map(part => {
            if (!object(part)) return part
            if (part.type === 'text' && typeof part.text === 'string')
              return { type: 'text', text: part.text }
            if (part.type === 'image_url') {
              const tokens = images.get(part)
              if (tokens === undefined) throw new Error('validated Anthropic image missing')
              visualTotal += tokens
              return { type: 'image_url', image_url: { url: '[image]' } }
            }
            return part
          }),
        }
      }
      const messages = body.messages.map(projectMessage)
      const projected = { messages, ...(body.tools === undefined ? {} : { tools: body.tools }) }
      const tokens =
        tokenizer.encode(writeJsonLossless(projected).normalize('NFKC'), 'all').length + visualTotal
      if (!Number.isSafeInteger(tokens)) return { kind: 'unavailable' }
      return { kind: 'estimated', tokens }
    } catch {
      return { kind: 'unavailable' }
    }
  }
  const meter: InputMeter = defineInputMeter({
    modelId: definition.modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider: 'anthropic',
    algorithmRevision: ANTHROPIC_HISTORY_ALGORITHM,
    tokenizerRevision: ANTHROPIC_TOKENIZER_REVISION,
    replayRevision: ANTHROPIC_REPLAY_REVISION,
    evidence:
      'anthropics/anthropic-tokenizer-typescript 4d75e64 legacy Claude BPE very rough approximation for text; Anthropic Vision https://platform.claude.com/docs/en/build-with-claude/vision high-resolution 28px patches / 2576px edge / 4784 visual-token ceiling for Claude 4.7+; final OpenRouter input-bearing projection; complete same-model signed/encrypted groups use upstream O plus zero net framing as estimated under D107 priority-family revision 5; https://platform.claude.com/docs/en/build-with-claude/thinking keep-all and encrypted signatures establish correlation, not exact input equality; Opus5.5/Fable5.1 require original unchanged prefix facts; unknown details and incomplete sources unavailable',
    measureFull: input => fullOutputHistory(input, meter, countBody, anthropicOutputHistoryPolicy),
    measureReplay: input =>
      replayOutputHistory(input, meter, countBody, anthropicOutputHistoryPolicy),
    measureNew: input => newOutputHistory(input, meter, countBody, anthropicOutputHistoryPolicy),
  })
  return meter
}
