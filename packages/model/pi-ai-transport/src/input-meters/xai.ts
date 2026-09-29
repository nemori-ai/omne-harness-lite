import { defineInputMeter } from '../input-meter.ts'
import {
  copyJsonValue,
  isNonNegativeJsonInteger,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { jsonEqual, ruleAccepts, type ModelDefinition } from '../definitions.ts'
import { object } from '../json.ts'
import type { FullMeterInput, InputMeter, TokenMeasurement } from '../input-meter.ts'
import { xaiDefinitions } from '../official-models/xai.ts'

// Per-model fit-only offsets; shared wire algorithm and scope below.
const calibrations: Readonly<
  Record<string, { readonly offset: number; readonly evidence: string }>
> = {
  'x-ai/grok-4.6': {
    offset: 141,
    evidence: '2026-09-28 complete prompt fit219/240, independent tool holdout334',
  },
  'x-ai/grok-4.7': {
    offset: 1181,
    evidence: '2026-09-28 nonce complete prompt fit1274/1297, independent tool holdout1392',
  },
}
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
function supported(body: JsonObject, definition: ModelDefinition): boolean {
  const effortRule = definition.routes.xai?.parameters.reasoningEffort
  if (!effortRule) return false
  if (
    body.model !== definition.modelId ||
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
        typeof body.reasoning.effort !== 'string' ||
        !ruleAccepts(effortRule, body.reasoning.effort)))
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

function fixedCalibration(definition: ModelDefinition) {
  const calibration = calibrations[definition.modelId]
  const canonical = xaiDefinitions.find(item => item.modelId === definition.modelId)
  const candidate = copyJsonValue(definition)
  const expected = copyJsonValue(canonical)
  if (
    !calibration ||
    !('ok' in candidate) ||
    !('ok' in expected) ||
    !jsonEqual(candidate.ok, expected.ok) ||
    definition.implementation.revision !== 'mp4-3'
  )
    return undefined
  return calibration
}

/** Package-local visible-body counter; internal stripped bodies are not public full inputs. */
export function createXaiVisibleBodyCounter(
  definition: ModelDefinition,
): ((input: Pick<FullMeterInput, 'body' | 'serialized'>) => TokenMeasurement) | undefined {
  const calibration = fixedCalibration(definition)
  if (!calibration) return undefined
  return ({ body, serialized }) => {
    if (writeJsonLossless(body) !== serialized || !supported(body, definition))
      return { kind: 'unavailable' }
    const tokens = Math.floor(Buffer.byteLength(serialized, 'utf8') / 4) + calibration.offset
    return Number.isSafeInteger(tokens) ? { kind: 'estimated', tokens } : { kind: 'unavailable' }
  }
}

/** Limited rough estimator: visible text/tools, no opaque or media history. */
export function createXaiInputMeter(definition: ModelDefinition): InputMeter | undefined {
  const calibration = fixedCalibration(definition)
  const countBody = createXaiVisibleBodyCounter(definition)
  if (!calibration || !countBody) return undefined
  return defineInputMeter({
    modelId: definition.modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider: 'xai',
    algorithmRevision: `grok-build-visible-text-tools-effort-offset${calibration.offset}-2`,
    evidence: `xai-org/grok-build f0e3be1 bytes/4; ${calibration.evidence}; complete wire surrogate includes declared low/medium/high request effort; frozen offsets are not effort-specific fits and expanded effort scope has no actual holdout; rough estimate, no error bound`,
    // First-party byte estimate projected onto final wire; fixed offset derived
    // only from two fit cases per model. No cross-model or holdout fitting.
    measureFull: countBody,
  })
}
