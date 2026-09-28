import {
  copyJsonValue,
  isNonNegativeJsonInteger,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { jsonEqual, type ModelDefinition } from '../definitions.ts'
import { object } from '../json.ts'
import type { InputMeter, TokenMeasurement } from '../input-meter.ts'
import { xaiDefinitions } from '../official-models/xai.ts'

const bodyKeys = new Set([
  'model',
  'provider',
  'messages',
  'tools',
  'stream',
  'store',
  'reasoning',
  'max_tokens',
])
const messageKeys = new Set(['role', 'content', 'tool_calls', 'tool_call_id', 'reasoning'])
function functionCall(value: JsonValue): boolean {
  return (
    object(value) &&
    Object.keys(value).every(key => ['id', 'type', 'function'].includes(key)) &&
    typeof value.id === 'string' &&
    value.type === 'function' &&
    object(value.function) &&
    Object.keys(value.function).every(key => key === 'name' || key === 'arguments') &&
    typeof value.function.name === 'string' &&
    typeof value.function.arguments === 'string'
  )
}
function supported(body: JsonObject): boolean {
  if (
    body.model !== 'x-ai/grok-4.6' ||
    Object.keys(body).some(key => !bodyKeys.has(key)) ||
    body.stream !== true ||
    body.store !== false ||
    !object(body.provider) ||
    Object.keys(body.provider).some(
      key => !['order', 'allow_fallbacks', 'require_parameters'].includes(key),
    ) ||
    !Array.isArray(body.provider.order) ||
    body.provider.order.length !== 1 ||
    body.provider.order[0] !== 'xai' ||
    body.provider.allow_fallbacks !== false ||
    body.provider.require_parameters !== true ||
    !Array.isArray(body.messages) ||
    body.messages.length === 0 ||
    (body.max_tokens !== undefined && !isNonNegativeJsonInteger(body.max_tokens)) ||
    (body.reasoning !== undefined &&
      (!object(body.reasoning) ||
        Object.keys(body.reasoning).length !== 1 ||
        body.reasoning.effort !== 'high'))
  )
    return false
  for (const message of body.messages) {
    if (
      !object(message) ||
      Object.keys(message).some(key => !messageKeys.has(key)) ||
      !['system', 'user', 'assistant', 'tool'].includes(String(message.role)) ||
      (message.reasoning !== undefined && typeof message.reasoning !== 'string') ||
      (message.tool_call_id !== undefined && typeof message.tool_call_id !== 'string') ||
      (message.tool_calls !== undefined &&
        (!Array.isArray(message.tool_calls) || !message.tool_calls.every(functionCall)))
    )
      return false
    if (
      typeof message.content !== 'string' &&
      (!Array.isArray(message.content) ||
        !message.content.every(
          part =>
            object(part) &&
            Object.keys(part).every(key => key === 'type' || key === 'text') &&
            part.type === 'text' &&
            typeof part.text === 'string',
        ))
    )
      return false
  }
  if (
    body.tools !== undefined &&
    (!Array.isArray(body.tools) ||
      !body.tools.every(
        tool =>
          object(tool) &&
          Object.keys(tool).every(key => key === 'type' || key === 'function') &&
          tool.type === 'function' &&
          object(tool.function) &&
          Object.keys(tool.function).every(key =>
            ['name', 'description', 'parameters'].includes(key),
          ) &&
          typeof tool.function.name === 'string' &&
          typeof tool.function.description === 'string' &&
          object(tool.function.parameters),
      ))
  )
    return false
  return true
}

/** Limited rough estimator: visible text/tools, no opaque or media history. */
export function createXaiInputMeter(definition: ModelDefinition): InputMeter | undefined {
  const canonical = xaiDefinitions.find(item => item.modelId === 'x-ai/grok-4.6')
  const candidate = copyJsonValue(definition)
  const expected = copyJsonValue(canonical)
  if (
    !('ok' in candidate) ||
    !('ok' in expected) ||
    !jsonEqual(candidate.ok, expected.ok) ||
    definition.implementation.revision !== 'mp4-2'
  )
    return undefined
  return Object.freeze({
    modelId: definition.modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider: 'xai',
    algorithmRevision: 'grok-build-visible-text-tools-offset141-1',
    evidence:
      'xai-org/grok-build f0e3be1 bytes/4; 2026-09-28 grok-4.6 complete prompt fit219/240, independent tool holdout334; rough estimate, no error bound',
    measure({
      body,
      serialized,
    }: {
      readonly body: JsonObject
      readonly serialized: string
    }): TokenMeasurement {
      if (writeJsonLossless(body) !== serialized || !supported(body)) return { kind: 'unavailable' }
      // First-party byte estimate projected onto final wire; fixed offset derived
      // only from two fit cases: max(219 - 78, 240 - 100). No holdout fitting.
      const tokens = Math.floor(Buffer.byteLength(serialized, 'utf8') / 4) + 141
      return Number.isSafeInteger(tokens) ? { kind: 'estimated', tokens } : { kind: 'unavailable' }
    },
  })
}
