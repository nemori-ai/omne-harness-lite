import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Tokenizer } from '@huggingface/tokenizers'
import {
  copyJsonValue,
  isJsonNumber,
  writeJsonLossless,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import { object } from '../json.ts'
import { jsonEqual } from '../definitions.ts'
import type { ModelDefinition } from '../definitions.ts'
import type { InputMeter, TokenMeasurement } from '../input-meter.ts'
import { googleDefinitions } from '../official-models/google.ts'
import { estimateGoogleCandidate, googleCandidateFeatures } from './google-candidate.ts'

const tokenizerHash = 'cc8d3a0ce36466ccc1278bf987df5f71db1719b9ca6b4118264f45cb627bfe0f'
const configHash = '9f4fec4b1dc6ecddf8f4a92e9caea5971c0e67d81309f3f9066a2bee8c362633'
const algorithmRevision = 'gemma4-visible-text-tools-offset6-1'
const modelIds = new Set(['google/gemini-3.7-flash', 'google/gemini-3.8-flash'])

function verifiedFile(name: string, hash: string): Buffer {
  const content = readFileSync(new URL(`../../tokenizers/google-gemma4/${name}`, import.meta.url))
  if (createHash('sha256').update(content).digest('hex') !== hash)
    throw new TypeError(`Google comparator ${name} digest mismatch`)
  return content
}

let sharedTokenizer: Tokenizer | undefined
function encoder(): Tokenizer {
  sharedTokenizer ??= new Tokenizer(
    JSON.parse(verifiedFile('tokenizer.json', tokenizerHash).toString('utf8')),
    JSON.parse(verifiedFile('tokenizer_config.json', configHash).toString('utf8')),
  )
  return sharedTokenizer
}

function supported(body: JsonObject, modelId: string): boolean {
  if (
    body.model !== modelId ||
    !modelIds.has(modelId) ||
    Object.keys(body).some(
      key =>
        key !== 'model' &&
        key !== 'provider' &&
        key !== 'stream' &&
        key !== 'store' &&
        key !== 'messages' &&
        key !== 'tools' &&
        key !== 'max_tokens',
    ) ||
    !object(body.provider) ||
    Object.keys(body.provider).some(
      key => key !== 'order' && key !== 'allow_fallbacks' && key !== 'require_parameters',
    ) ||
    !Array.isArray(body.provider.order) ||
    body.provider.order.length !== 1 ||
    body.provider.order[0] !== 'google-ai-studio' ||
    body.provider.allow_fallbacks !== false ||
    body.provider.require_parameters !== true ||
    body.stream !== true ||
    body.store !== false ||
    (body.max_tokens !== undefined && !isJsonNumber(body.max_tokens)) ||
    !Array.isArray(body.messages) ||
    body.messages.length === 0 ||
    (body.tools !== undefined && !Array.isArray(body.tools))
  )
    return false
  for (const message of body.messages) {
    if (
      !object(message) ||
      Object.keys(message).some(
        key =>
          key !== 'role' &&
          key !== 'content' &&
          key !== 'tool_calls' &&
          key !== 'tool_call_id' &&
          key !== 'reasoning',
      ) ||
      (message.role !== 'system' &&
        message.role !== 'user' &&
        message.role !== 'assistant' &&
        message.role !== 'tool') ||
      (message.reasoning !== undefined && typeof message.reasoning !== 'string') ||
      (message.tool_call_id !== undefined && typeof message.tool_call_id !== 'string')
    )
      return false
    if (typeof message.content !== 'string') {
      if (!Array.isArray(message.content)) return false
      for (const part of message.content)
        if (
          !object(part) ||
          Object.keys(part).some(key => key !== 'type' && key !== 'text') ||
          part.type !== 'text' ||
          typeof part.text !== 'string'
        )
          return false
    }
    if (message.tool_calls !== undefined) {
      if (!Array.isArray(message.tool_calls)) return false
      for (const call of message.tool_calls)
        if (
          !object(call) ||
          Object.keys(call).some(key => key !== 'id' && key !== 'type' && key !== 'function') ||
          typeof call.id !== 'string' ||
          call.type !== 'function' ||
          !object(call.function) ||
          Object.keys(call.function).some(key => key !== 'name' && key !== 'arguments') ||
          typeof call.function.name !== 'string' ||
          typeof call.function.arguments !== 'string'
        )
          return false
    }
  }
  if (body.tools !== undefined)
    for (const tool of body.tools)
      if (
        !object(tool) ||
        Object.keys(tool).some(key => key !== 'type' && key !== 'function') ||
        tool.type !== 'function' ||
        !object(tool.function) ||
        Object.keys(tool.function).some(
          key => key !== 'name' && key !== 'description' && key !== 'parameters',
        ) ||
        typeof tool.function.name !== 'string' ||
        typeof tool.function.description !== 'string' ||
        !object(tool.function.parameters)
      )
        return false
  return true
}

/** Rough text/tool estimate for the two measured AI Studio routes only. */
export function createGoogleInputMeter(definition: ModelDefinition): InputMeter | undefined {
  const canonical = googleDefinitions.find(item => item.modelId === definition.modelId)
  const left = copyJsonValue(definition)
  const right = copyJsonValue(canonical)
  if (
    !canonical ||
    !('ok' in left) ||
    !('ok' in right) ||
    !jsonEqual(left.ok, right.ok) ||
    definition.revision !== '1' ||
    definition.implementation.name !== 'pi-ai:google' ||
    definition.implementation.revision !== 'mp4-2' ||
    !Object.hasOwn(definition.routes, 'google-ai-studio')
  )
    return undefined
  const tokenizer = encoder()
  return Object.freeze({
    modelId: definition.modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider: 'google-ai-studio',
    algorithmRevision,
    evidence: 'google-gemma4-pilot-2026-09-28:fit-F1-F2/holdout-H1-H2;rough-estimated',
    measure({
      body,
      serialized,
    }: Readonly<{ body: JsonObject; serialized: string }>): TokenMeasurement {
      if (writeJsonLossless(body) !== serialized || !supported(body, definition.modelId))
        return { kind: 'unavailable' }
      const features = googleCandidateFeatures(
        body,
        text => tokenizer.encode(text, { add_special_tokens: false }).ids.length,
      )
      if (!features) return { kind: 'unavailable' }
      return {
        kind: 'estimated',
        tokens: estimateGoogleCandidate(
          {
            revision: 'google-gemma4-experimental-1',
            modelId: definition.modelId,
            offset: 6,
            fitCaseIds: ['F1', 'F2'],
          },
          features,
        ),
      }
    },
  })
}
