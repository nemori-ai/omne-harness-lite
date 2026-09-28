import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { writeJsonLossless, type JsonObject } from '@omne-harness-lite/content-blocks'
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

function supportedTextBody(body: JsonObject): boolean {
  if (!Array.isArray(body.messages)) return false
  for (const message of body.messages) {
    if (
      !object(message) ||
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
    if (typeof message.content === 'string') continue
    if (!Array.isArray(message.content)) return false
    for (const part of message.content) {
      if (
        !object(part) ||
        part.type !== 'text' ||
        typeof part.text !== 'string' ||
        Object.keys(part).some(key => key !== 'type' && key !== 'text' && key !== 'cache_control')
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
    definition.implementation.revision !== 'mp4-2' ||
    !Object.hasOwn(definition.routes, 'anthropic')
  )
    throw new TypeError('unsupported Anthropic input-meter binding')
  const tokenizer = encoder()
  const meter: InputMeter = {
    modelId: definition.modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider: 'anthropic',
    algorithmRevision: 'anthropic-legacy-claude-bpe-rough-text-only-2',
    evidence:
      'anthropics/anthropic-tokenizer-typescript 4d75e64 legacy Claude BPE very rough approximation; Claude 4.7+ tokenizer and OpenRouter private chat formatting differ; text-only estimate, encrypted reasoning replay unavailable',
    measure({ body, serialized }): TokenMeasurement {
      if (body.model !== definition.modelId || writeJsonLossless(body) !== serialized)
        return { kind: 'unavailable' }
      if (!supportedTextBody(body)) return { kind: 'unavailable' }
      try {
        // The archived first-party implementation applies NFKC and permits its
        // own special tokens. Include the complete final JSON, not just chat text.
        const tokens = tokenizer.encode(serialized.normalize('NFKC'), 'all').length
        return { kind: 'estimated', tokens }
      } catch {
        return { kind: 'unavailable' }
      }
    },
  }
  return Object.freeze(meter)
}
