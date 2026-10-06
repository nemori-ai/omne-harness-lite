import { fullOutputHistory, newOutputHistory, replayOutputHistory } from './output-history.ts'
import {
  classifyOpenAiDetail,
  openAiEnvelopeApplies,
  openAiFamilyRecord,
  openAiOutputHistoryPolicy,
  OPENAI_FAMILY_ALGORITHM,
  OPENAI_FAMILY_EVIDENCE,
  OPENAI_FAMILY_IMPLEMENTATION,
  OPENAI_FAMILY_REPLAY,
  type OpenAiFamilyRecord,
} from './openai-family-policy.ts'
import { defineInputMeter } from '../input-meter.ts'
import {
  isJsonNumber,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { getEncoding } from 'js-tiktoken'
import { imageTokens, type ImageRule } from './openai-images.ts'
import { object } from '../json.ts'
import type { ModelDefinition } from '@omne-harness-lite/model-request-runtime'
import type {
  FullMeterInput,
  InputMeter,
  TokenMeasurement,
} from '@omne-harness-lite/model-request-runtime'

// The OpenAI tiktoken source maps gpt-5* to o200k_base. This exact allowlist
// does not establish a GPT-6 mapping. The separately calibrated GPT-6 path below
// uses this encoding only as a surrogate and never claims tokenizer identity.
// Source: openai/tiktoken 4e71bbe0c078468e00fefbf94b39849389f346e5/model.py.
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
    const sanitized = sanitizeMessage(message)
    if (!sanitized) return undefined
    messages.push(sanitized)
  }
  return { body: { ...body, messages }, imageTokens: total }

  function sanitizeMessage(message: JsonObject): JsonObject | undefined {
    // The tokenizer basis covers visible reasoning text/summary and their
    // protocol metadata, not the context represented by encrypted payloads.
    // Keep the final wire intact: an unsupported detail makes the whole input
    // unavailable rather than dropping it or counting its ciphertext bytes.
    if (Object.hasOwn(message, 'reasoning_details')) {
      if (!Array.isArray(message.reasoning_details)) return undefined
      for (const detail of message.reasoning_details)
        if (classifyOpenAiDetail(detail) !== 'visible') return undefined
    }
    if (!Array.isArray(message.content)) {
      return message
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
    return { ...message, content: parts }
  }
}

let sharedEncoder: ReturnType<typeof getEncoding> | undefined
function encoder(): ReturnType<typeof getEncoding> {
  sharedEncoder ??= getEncoding('o200k_base')
  return sharedEncoder
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
function finalVisibleBodyValid(body: JsonObject, row: OpenAiFamilyRecord): boolean {
  if (
    !openAiEnvelopeApplies(body, row) ||
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
    body.stream !== true ||
    body.store !== false ||
    (body.max_tokens !== undefined && !isJsonNumber(body.max_tokens)) ||
    !Array.isArray(body.messages) ||
    (body.tools !== undefined && (!Array.isArray(body.tools) || !body.tools.length))
  )
    return false

  if (!visibleMessagesValid(body.messages as JsonValue[])) return false
  return visibleToolsValid(body)
}

function visibleMessagesValid(messages: readonly JsonValue[]): boolean {
  for (const message of messages) {
    if (!object(message) || typeof message.role !== 'string') return false
    if (!visibleMessageValid(message)) return false
  }
  return true
}

function visibleMessageValid(message: JsonObject): boolean {
  switch (message.role) {
    case 'system':
    case 'developer':
      if (!onlyKeys(message, ['role', 'content']) || !visibleTextParts(message.content))
        return false
      return true
    case 'user':
      return visibleUserValid(message)
    case 'assistant':
      return visibleAssistantValid(message)
    case 'tool':
      if (
        !onlyKeys(message, ['role', 'tool_call_id', 'content']) ||
        typeof message.tool_call_id !== 'string' ||
        typeof message.content !== 'string'
      )
        return false
      return true
    default:
      return false
  }
}

function visibleUserValid(message: JsonObject): boolean {
  return !(
    !onlyKeys(message, ['role', 'content']) ||
    !Array.isArray(message.content) ||
    !message.content.every(
      part => visibleTextParts([part]) || (object(part) && part.type === 'image_url'),
    )
  )
}

function visibleAssistantValid(message: JsonObject): boolean {
  return !(
    !onlyKeys(message, ['role', 'content', 'tool_calls', 'reasoning', 'reasoning_details']) ||
    typeof message.content !== 'string' ||
    (message.reasoning !== undefined && typeof message.reasoning !== 'string') ||
    !visibleCallsValid(message)
  )
}

function visibleCallsValid(message: JsonObject): boolean {
  return !(
    message.tool_calls !== undefined &&
    (!Array.isArray(message.tool_calls) ||
      !message.tool_calls.length ||
      !message.tool_calls.every(visibleCallValid))
  )
}

function visibleCallValid(call: JsonValue): boolean {
  return (
    object(call) &&
    onlyKeys(call, ['id', 'type', 'function']) &&
    typeof call.id === 'string' &&
    call.type === 'function' &&
    object(call.function) &&
    onlyKeys(call.function, ['name', 'arguments']) &&
    typeof call.function.name === 'string' &&
    typeof call.function.arguments === 'string'
  )
}

function visibleToolsValid(body: JsonObject): boolean {
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
        return false
    }

  return true
}

/** One family counter and one complete-output contribution path for all twelve leaves. */
export function createOpenAiInputMeter(definition: ModelDefinition): InputMeter {
  const row = openAiFamilyRecord(definition.modelId)
  if (
    !row ||
    definition.revision !== row.definitionRevision ||
    definition.implementation.name !== 'pi-ai:openai' ||
    definition.implementation.revision !== OPENAI_FAMILY_IMPLEMENTATION ||
    !Object.hasOwn(definition.routes, 'openai')
  )
    throw new TypeError('unsupported OpenAI input-meter binding')
  const tokenizer = encoder()
  const countBody = ({
    body,
    serialized,
  }: Pick<FullMeterInput, 'body' | 'serialized'>): TokenMeasurement => {
    try {
      if (
        writeJsonLossless(body) !== serialized ||
        (row.visibleDomain === 'finalRequest' && !finalVisibleBodyValid(body, row))
      )
        return { kind: 'unavailable' }
      const projected = sanitizedBody(body, row.imageRule)
      return projected
        ? {
            kind: 'estimated',
            tokens:
              tokenizer.encode(writeJsonLossless(projected.body)).length + projected.imageTokens,
          }
        : { kind: 'unavailable' }
    } catch {
      return { kind: 'unavailable' }
    }
  }
  const meter: InputMeter = defineInputMeter({
    modelId: row.modelId,
    definitionRevision: row.definitionRevision,
    implementation: definition.implementation,
    provider: 'openai',
    transformRevision: row.transformRevision,
    algorithmRevision: OPENAI_FAMILY_ALGORITHM,
    tokenizerRevision: row.tokenizerRevision,
    replayRevision: OPENAI_FAMILY_REPLAY,
    evidence: OPENAI_FAMILY_EVIDENCE,
    measureFull: input => fullOutputHistory(input, meter, countBody, openAiOutputHistoryPolicy),
    measureNew: input => newOutputHistory(input, meter, countBody, openAiOutputHistoryPolicy),
    measureReplay: input => replayOutputHistory(input, meter, countBody, openAiOutputHistoryPolicy),
  })
  return meter
}
