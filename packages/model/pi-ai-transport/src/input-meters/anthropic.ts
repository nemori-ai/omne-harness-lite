import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { isJsonNumber, writeJsonLossless, type JsonObject } from '@omne-harness-lite/content-blocks'
import { Tiktoken } from 'js-tiktoken/lite'
import { object } from '../json.ts'
import type { ModelDefinition } from '../definitions.ts'
import type { InputMeter, TokenMeasurement } from '../input-meter.ts'

// This archived Claude BPE is an Anthropic-described *very rough approximation*
// for models since Claude 3. It is not the Claude 4.7+/5 tokenizer.
// https://github.com/anthropics/anthropic-tokenizer-typescript/tree/4d75e64d32fe5cd2b5a24d954242f9fab12e8b4b
const artifactSha256 = '58dad83d85e9cd57be209172449ebfbc395df2b455c11fe8b7e5b661e6f462ad'
const artifact = new URL('../../tokenizers/anthropic-legacy/claude.json', import.meta.url)

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

function supportedTextBody(body: JsonObject, ttlValues: ReadonlySet<string>): boolean {
  if (
    Object.keys(body).some(
      key => key !== 'messages' && key !== 'tools' && !requestControls.has(key),
    )
  )
    return false
  if (
    !object(body.provider) ||
    Object.keys(body.provider).some(
      key => key !== 'order' && key !== 'allow_fallbacks' && key !== 'require_parameters',
    ) ||
    !Array.isArray(body.provider.order) ||
    body.provider.order.length !== 1 ||
    body.provider.order[0] !== 'anthropic' ||
    body.provider.allow_fallbacks !== false ||
    body.provider.require_parameters !== true ||
    (body.stream !== undefined && typeof body.stream !== 'boolean') ||
    (body.store !== undefined && typeof body.store !== 'boolean') ||
    (body.reasoning !== undefined &&
      (!object(body.reasoning) ||
        Object.keys(body.reasoning).some(key => key !== 'effort') ||
        typeof body.reasoning.effort !== 'string')) ||
    (body.max_tokens !== undefined && !isJsonNumber(body.max_tokens)) ||
    (body.stop !== undefined &&
      (!Array.isArray(body.stop) || !body.stop.every(item => typeof item === 'string')))
  )
    return false
  if (!Array.isArray(body.messages)) return false
  if (body.tools !== undefined && !Array.isArray(body.tools)) return false
  if (
    Array.isArray(body.tools) &&
    body.tools.some(
      tool =>
        !object(tool) ||
        Object.keys(tool).some(key => key !== 'type' && key !== 'function') ||
        tool.type !== 'function' ||
        !object(tool.function) ||
        Object.keys(tool.function).some(
          key => key !== 'name' && key !== 'description' && key !== 'parameters',
        ) ||
        typeof tool.function.name !== 'string' ||
        typeof tool.function.description !== 'string' ||
        !object(tool.function.parameters),
    )
  )
    return false
  for (const message of body.messages) {
    if (
      !object(message) ||
      Object.keys(message).some(key => !messageFields.has(key)) ||
      (message.role !== 'system' &&
        message.role !== 'user' &&
        message.role !== 'assistant' &&
        message.role !== 'tool')
    )
      return false
    // Text reasoning remains in the serialized estimate. Encrypted or unknown
    // replay is opaque provider state: its ciphertext length does not measure
    // the model's retained reasoning input.
    if (Object.hasOwn(message, 'reasoning_details')) {
      if (
        !Array.isArray(message.reasoning_details) ||
        !message.reasoning_details.every(
          detail =>
            object(detail) && detail.type === 'reasoning.text' && typeof detail.text === 'string',
        )
      )
        return false
    }
    if (message.reasoning !== undefined && typeof message.reasoning !== 'string') return false
    if (message.tool_call_id !== undefined && typeof message.tool_call_id !== 'string') return false
    if (
      message.tool_calls !== undefined &&
      (!Array.isArray(message.tool_calls) ||
        message.tool_calls.some(
          call =>
            !object(call) ||
            Object.keys(call).some(key => key !== 'id' && key !== 'type' && key !== 'function') ||
            typeof call.id !== 'string' ||
            call.type !== 'function' ||
            !object(call.function) ||
            Object.keys(call.function).some(key => key !== 'name' && key !== 'arguments') ||
            typeof call.function.name !== 'string' ||
            typeof call.function.arguments !== 'string',
        ))
    )
      return false
    if (typeof message.content === 'string') continue
    if (!Array.isArray(message.content)) return false
    for (const part of message.content) {
      if (
        !object(part) ||
        part.type !== 'text' ||
        typeof part.text !== 'string' ||
        Object.keys(part).some(
          key => key !== 'type' && key !== 'text' && key !== 'cache_control',
        ) ||
        (part.cache_control !== undefined &&
          (!object(part.cache_control) ||
            Object.keys(part.cache_control).some(key => key !== 'type' && key !== 'ttl') ||
            part.cache_control.type !== 'ephemeral' ||
            typeof part.cache_control.ttl !== 'string' ||
            !ttlValues.has(part.cache_control.ttl)))
      )
        return false
    }
  }
  return true
}

function supportedModel(modelId: string): boolean {
  switch (modelId) {
    case 'anthropic/claude-opus-5.5':
    case 'anthropic/claude-opus-5':
    case 'anthropic/claude-sonnet-5':
    case 'anthropic/claude-fable-5.1':
      return true
    default:
      return false
  }
}

/** Four exact Anthropic routes share one legacy Claude BPE, strictly as a rough estimate. */
export function createAnthropicInputMeter(definition: ModelDefinition): InputMeter {
  if (
    !supportedModel(definition.modelId) ||
    definition.revision !== '1' ||
    definition.implementation.name !== 'pi-ai:anthropic' ||
    definition.implementation.revision !== 'mp4-3' ||
    !Object.hasOwn(definition.routes, 'anthropic')
  )
    throw new TypeError('unsupported Anthropic input-meter binding')
  const cache = definition.routes.anthropic?.cache
  if (cache?.mode !== 'explicit') throw new TypeError('unsupported Anthropic cache declaration')
  const ttlValues = new Set(cache.ttlValues)
  const tokenizer = encoder()
  const meter: InputMeter = {
    modelId: definition.modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider: 'anthropic',
    algorithmRevision: 'anthropic-legacy-claude-bpe-input-projection-3',
    evidence:
      'anthropics/anthropic-tokenizer-typescript 4d75e64 legacy Claude BPE very rough approximation; final OpenRouter messages/tool input projected without routing/generation/cache controls; Claude 5 and private chat formatting remain uncertain; image and encrypted reasoning replay unavailable',
    measure({ body, serialized }): TokenMeasurement {
      if (body.model !== definition.modelId || writeJsonLossless(body) !== serialized)
        return { kind: 'unavailable' }
      if (!Array.isArray(body.messages) || !supportedTextBody(body, ttlValues))
        return { kind: 'unavailable' }
      try {
        // The archived first-party implementation applies NFKC and permits its
        // own special tokens. Keep all supported input-bearing final-wire fields.
        // Cache markers select reuse of the same text; their TTL is not prompt
        // text. This JSON shape approximates the private prompt format.
        const messages = body.messages.map(message => {
          if (!object(message) || !Array.isArray(message.content)) return message
          return {
            ...message,
            content: message.content.map(part =>
              object(part) && part.type === 'text' && typeof part.text === 'string'
                ? { type: 'text', text: part.text }
                : part,
            ),
          }
        })
        const projected = {
          messages,
          ...(body.tools === undefined ? {} : { tools: body.tools }),
        }
        const tokens = tokenizer.encode(
          writeJsonLossless(projected).normalize('NFKC'),
          'all',
        ).length
        return { kind: 'estimated', tokens }
      } catch {
        return { kind: 'unavailable' }
      }
    },
  }
  return Object.freeze(meter)
}
