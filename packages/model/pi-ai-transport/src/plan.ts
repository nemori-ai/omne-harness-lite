import { attachAnthropicCache } from './anthropic-cache.ts'
import { normalizeToolCallId, projectAssistant } from './assistant-projection.ts'
import { projectInput, stableAnthropicRoute } from './projection.ts'
import { measureCalibrated } from './calibration.ts'
import { projectHistorySpans, type MessageSpan } from './history-projection.ts'
// Derived from pi 1.0.0 openai-completions.ts, commit a13d35a742c6ef8462812a28fbe1d8c8b7431c32.
// Copyright (c) 2025 Mario Zechner. MIT: ../LICENSE.pi. See provenance.json for changes.
import { createHash } from 'node:crypto'
import {
  writeJsonLossless,
  copyJsonValue,
  isJsonNumber,
  type JsonObject,
  type JsonValue,
  type ContentBlock,
} from '@omne-harness-lite/content-blocks'
import type {
  PlanInput,
  PlanResult,
  PlannedSemantics,
  PlanExecutionContext,
  PlanFailure,
} from '@omne-harness-lite/model-request-runtime'
import {
  judgeModelProfileDocument,
  type ModelRequestParameters,
} from '@omne-harness-lite/model-profile'
import {
  ownDefinitions,
  codePointOrder,
  jsonEqual,
  parameterOrder,
  protectedParameterKeys,
  ruleAccepts,
  type ModelDefinition,
  type ParameterRule,
} from './definitions.ts'
import { interpretConfiguration } from './configuration.ts'
import { object, ownedObject } from './json.ts'
import { ownPlanInput, preflightInputWithMissingLimits } from './input.ts'
import { checkFinalInput, missingInputLimits, type FinalInputEvidence } from './input-limits.ts'
import {
  ownInputMeter,
  meterSource,
  meterMatches,
  measureFull,
  type InputMeter,
} from './input-meter.ts'
import { preparePlanImages } from './prepare-plan.ts'
import type { ImagePreparer } from './image-preparation/types.ts'
import { isImagePreparer } from './image-preparation/preparer.ts'
import { inspectTransformRevision } from './meter-transform.ts'
import { moonshotDefinitions } from './official-models/moonshot.ts'

export interface PlannedRequest extends PlannedSemantics {
  readonly body: JsonObject
  readonly serialized: string
  readonly inputLimitEvidence: FinalInputEvidence
}
const plans = new WeakSet<PlannedRequest>()
const planDefinitions = new WeakMap<PlannedRequest, ModelDefinition>()
const planMeters = new WeakMap<PlannedRequest, object>()
const planOwners = new WeakMap<PlannedRequest, object>()
/** Internal signing boundary; host identity is never part of the durable binding. */
export function claimPlan(planned: PlannedRequest, owner: object): void {
  const prior = planOwners.get(planned)
  if (!plans.has(planned) || (prior && prior !== owner)) throw new TypeError('foreign plan')
  planOwners.set(planned, owner)
}
export function planAvailable(
  planned: PlannedRequest,
  owner: object,
  definitions: readonly ModelDefinition[],
  meters: readonly InputMeter[],
): boolean {
  const prior = planOwners.get(planned)
  if (prior) return prior === owner
  const declaration = planDefinitions.get(planned)
  if (!declaration) return false
  const source = planMeters.get(planned)
  if (!source || !meters.some(meter => meterSource(meter) === source)) return false
  const copied = copyJsonValue(declaration)
  return (
    'ok' in copied &&
    definitions.some(definition => {
      const other = copyJsonValue(definition)
      return 'ok' in other && jsonEqual(copied.ok, other.ok)
    })
  )
}
type MutableObject = { [key: string]: JsonValue }
export function isPlannedRequest(value: PlannedRequest): boolean {
  return plans.has(value)
}
export const PI_AI_CARRIABLE_MODALITIES = Object.freeze(['text', 'image'] as const)
function parts(blocks: readonly ContentBlock[], images: boolean): JsonObject[] | undefined {
  const result: JsonObject[] = []
  for (const block of blocks) {
    if (!block.visibility.toModel) continue
    if (block.kind === 'text') result.push({ type: 'text', text: block.text })
    else if ('transcript' in block && typeof block.transcript === 'string')
      result.push({ type: 'text', text: block.transcript })
    else if (block.kind === 'image' && images && 'inline' in block.data)
      result.push({
        type: 'image_url',
        image_url: { url: `data:${block.mediaType};base64,${block.data.inline}` },
      })
    else if (block.kind === 'tool_result') {
      const nested = parts(block.blocks, images)
      if (!nested) return undefined
      result.push(...nested)
    } else if (
      block.kind === 'thinking' ||
      (block.kind === 'tool_call' && !block.visibility.toModel)
    )
      continue
    else return undefined
  }
  return result
}
function addBreakpoint(message: MutableObject, control: JsonObject): void {
  const content = message.content
  if (typeof content === 'string' && content.length)
    message.content = [{ type: 'text', text: content, cache_control: control }]
  else if (Array.isArray(content)) {
    for (let n = content.length - 1; n >= 0; n--) {
      const part = content[n]
      if (object(part) && part.type === 'text') {
        message.content = content.map((value, index) =>
          index === n ? { ...part, cache_control: control } : value,
        )
        return
      }
    }
  }
}
export async function planRequest(
  raw: PlanInput,
  definitions: readonly ModelDefinition[],
  meter: InputMeter | undefined,
  execution: PlanExecutionContext,
  preparer?: ImagePreparer,
): Promise<PlanResult<PlannedRequest>> {
  if (preparer !== undefined && !isImagePreparer(preparer))
    return { rejected: 'invalidInput', reason: 'malformed' }
  if (
    !execution ||
    !(execution.signal instanceof AbortSignal) ||
    (execution.reuseScope !== undefined &&
      (!execution.reuseScope || typeof execution.reuseScope !== 'object'))
  )
    return { rejected: 'invalidInput', reason: 'malformed' }
  if (execution.signal.aborted) return { rejected: 'unavailable' }
  let ownedDefinitions: readonly ModelDefinition[]
  try {
    ownedDefinitions = ownDefinitions(definitions)
  } catch (error) {
    if (error instanceof TypeError) return { rejected: 'invalidInput', reason: 'malformed' }
    throw error
  }
  if (meter !== undefined) {
    const ownedMeter = ownInputMeter(meter)
    if (!ownedMeter) return { rejected: 'invalidInput', reason: 'malformed' }
    meter = ownedMeter
  }
  let input = ownPlanInput(raw)
  let missing: PlanFailure | undefined
  if (!input) {
    const snapshot = copyJsonValue(raw?.snapshot)
    if ('ok' in snapshot) {
      missing = missingInputLimits(snapshot.ok)
      if (missing) input = preflightInputWithMissingLimits(raw)
    }
    if (!input) return { rejected: 'invalidInput', reason: 'malformed' }
  }
  const binding = input.snapshot.adaptation
  const definition = ownedDefinitions.find(
    d =>
      d.modelId === input.routeName &&
      d.revision === binding.definition.revision &&
      d.implementation.name === binding.implementation.name &&
      d.implementation.revision === binding.implementation.revision,
  )
  if (!definition) return { rejected: 'unavailable' }
  const route = Object.hasOwn(definition.routes, input.provider)
    ? definition.routes[input.provider]
    : undefined
  if (!route) return { rejected: 'unavailable' }
  const interpreted = interpretConfiguration(
    definition,
    binding.configuration.values,
    input.provider,
  )
  if ('rejected' in interpreted)
    return interpreted.rejected === 'unavailable'
      ? { rejected: 'unavailable' }
      : { rejected: 'invalidInput', reason: 'malformed' }
  const cache = interpreted.ok
  const images = input.snapshot.inputModalities.includes('image')
  const messages: MutableObject[] = []
  const spans: MessageSpan[] = []
  const stableArrays = stableAnthropicRoute(input)
  const omitMixedEmptyText = moonshotDefinitions.some(
    current =>
      current.modelId === definition.modelId &&
      current.revision === definition.revision &&
      current.implementation.name === definition.implementation.name &&
      current.implementation.revision === definition.implementation.revision &&
      Object.hasOwn(current.routes, input.provider),
  )
  const calls = new Set<string>(),
    results = new Set<string>()
  for (const message of input.messages) {
    const span = { start: messages.length, end: messages.length + 1 }
    spans.push(span)
    if (message.type === 'tool_internal') return { rejected: 'tool_internal_in_request' }
    if (message.type === 'assistant') {
      const assistant = projectAssistant(message.blocks, input.routeName, stableArrays)
      if ('rejected' in assistant) return assistant
      for (const callId of assistant.callIds) calls.add(callId)
      messages.push(assistant.message)
      continue
    }
    const converted = parts(message.blocks, images)
    if (!converted) return { rejected: 'modality_not_carried' }
    if (message.type === 'tool') {
      results.add(message.callId)
      const text = converted
        .filter(p => p.type === 'text')
        .map(p => p.text)
        .join('')
      messages.push({
        role: 'tool',
        tool_call_id: normalizeToolCallId(message.callId),
        content: stableArrays
          ? [{ type: 'text', text: text || '(no tool output)' }]
          : text || '(no tool output)',
      })
      const imageParts = converted.filter(p => p.type === 'image_url')
      if (imageParts.length) {
        messages.push({ role: 'user', content: imageParts })
        span.end++
      }
    } else {
      const role =
        message.type === 'system_reminder'
          ? route.reminderRole
          : message.type === 'compaction'
            ? 'user'
            : message.type
      const marked = message.type === 'system_reminder' || message.type === 'compaction'
      const content = marked
        ? [
            { type: 'text', text: `[${message.type} ${writeJsonLossless(message.id)}]` },
            ...converted,
          ]
        : converted
      const isEmptyText = (part: JsonObject) => part.type === 'text' && part.text === ''
      messages.push({
        role,
        content:
          omitMixedEmptyText && content.some(part => !isEmptyText(part))
            ? content.filter(part => !isEmptyText(part))
            : content,
      })
    }
  }
  if ([...calls].some(id => !results.has(id))) return { rejected: 'orphan_tool_call' }
  if (missing) return missing
  const tools = input.tools.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }))
  const body: MutableObject = {
    model: input.routeName,
    provider: { order: [input.provider], allow_fallbacks: false, require_parameters: true },
    stream: true,
    store: false,
    messages,
    ...(tools.length ? { tools } : {}),
  }
  const actual: MutableObject = {}
  const dropped: string[] = []
  const adjustments: NonNullable<PlannedSemantics['parameterAdjustments']>[number][] = []
  function apply(
    name: string,
    value: JsonValue,
    rule: ParameterRule<JsonValue> | undefined,
  ): JsonValue | undefined {
    if (
      !rule ||
      rule.kind === 'drop' ||
      (rule.kind === 'select' && !ruleAccepts(rule, value) && 'drop' in rule.otherwise)
    ) {
      dropped.push(name)
      return undefined
    }
    if (rule.kind === 'select' && !ruleAccepts(rule, value) && 'adjustTo' in rule.otherwise) {
      const sent = rule.otherwise.adjustTo
      adjustments.push({ name, requested: value, sent })
      return sent
    }
    return value
  }
  const wireNames = {
    temperature: 'temperature',
    topP: 'top_p',
    seed: 'seed',
    maxOutputTokens: 'max_tokens',
    stopSequences: 'stop',
    frequencyPenalty: 'frequency_penalty',
    presencePenalty: 'presence_penalty',
  } as const
  for (const name of parameterOrder) {
    const value = input.parameters[name]
    if (value === undefined) continue
    const sent = apply(name, value, route.parameters[name])
    if (sent === undefined) continue
    actual[name] = sent
    if (name === 'reasoningEffort') body.reasoning = { effort: sent }
    else body[wireNames[name]] = sent
  }
  if (input.parameters.extra !== undefined) {
    const extra: MutableObject = {}
    for (const key of Object.keys(input.parameters.extra).sort(codePointOrder)) {
      const value = input.parameters.extra[key]
      if (value === undefined) throw new Error('owned private parameter missing')
      const rule =
        !protectedParameterKeys.has(key) && Object.hasOwn(route.extra, key)
          ? route.extra[key]
          : undefined
      const sent = apply(key, value, rule)
      if (sent === undefined) continue
      Object.defineProperty(body, key, {
        value: sent,
        enumerable: true,
        configurable: true,
        writable: true,
      })
      Object.defineProperty(extra, key, { value: sent, enumerable: true })
    }
    if (Object.keys(extra).length) actual.extra = extra
  }
  const parameters = ownedObject(actual)
  if (!parameters || !actualParameters(parameters))
    throw new Error('parameter rules produced invalid public parameters')
  if (cache.mode === 'explicit') {
    const control: JsonObject = { type: 'ephemeral', ttl: cache.ttl }
    for (const breakpoint of cache.breakpoints) {
      if (breakpoint === 'system') {
        const instruction = messages.find(m => m.role === 'system' || m.role === 'developer')
        if (instruction) addBreakpoint(instruction, control)
      }
      if (breakpoint === 'last_tool') {
        const last = tools.at(-1)
        if (last) Object.assign(last, { cache_control: control })
      }
      if (breakpoint === 'last_message') {
        if (stableArrays) {
          const cached = attachAnthropicCache(body, cache.ttl)
          if (!cached) return { rejected: 'unavailable' }
          Object.assign(body, cached)
        } else {
          const last = messages.findLast(
            m => m.role === 'user' || m.role === 'assistant' || m.role === 'tool',
          )
          if (last) addBreakpoint(last, control)
        }
      }
    }
  }
  if (!meter || !meterMatches(meter, definition, input.provider)) return { rejected: 'unavailable' }
  for (const source of [
    input.calibration.kind === 'observation'
      ? input.calibration.inputCalibration.requestInput
      : undefined,
    ...input.outputHistory.map(group => group.inputCalibration.requestInput),
  ])
    if (
      source?.kind === 'known' &&
      inspectTransformRevision(source.countingBasis.transformRevision, meter.transformRevision)
        .kind === 'invalid'
    )
      return { rejected: 'invalidInput', reason: 'malformed' }
  const preparedWire = await preparePlanImages(body, input, execution, preparer)
  if ('rejected' in preparedWire) return preparedWire
  if (execution.signal.aborted) return { rejected: 'unavailable' }
  const owned = ownedObject(preparedWire.ok.body)
  if (!owned) throw new Error('planned wire body is not JSON')
  const serialized = writeJsonLossless(owned)
  if (!meter) return { rejected: 'unavailable' }
  const projection = projectInput(owned, input, meter, preparedWire.ok.preparation)
  const historySpans = projectHistorySpans(input.outputHistory, projection, spans)
  if (historySpans === undefined) return { rejected: 'invalidInput', reason: 'malformed' }
  let calibrated: ReturnType<typeof measureCalibrated>
  try {
    calibrated = measureCalibrated(input, projection, spans, historySpans, meter, () =>
      measureFull(meter, {
        body: owned,
        serialized,
        projection,
        outputHistory: input.outputHistory,
        historySpans,
      }),
    )
  } catch {
    calibrated = undefined
  }
  if (!calibrated)
    return {
      rejected: 'invalidInput',
      reason: 'input_size_unavailable',
      metrics: ['maxInputTokens'],
    }
  const checked = checkFinalInput({
    definition,
    provider: input.provider,
    snapshot: input.snapshot,
    body: owned,
    serialized,
    meter,
    tokenMargin: input.tokenMargin,
    tokenMeasurement: calibrated.token,
  })
  if ('rejected' in checked) return checked
  const planned = Object.freeze({
    input,
    parameters,
    body: owned,
    serialized,
    inputLimitEvidence: checked.ok,
    requestInput: projection.requestInput,
    measurement: calibrated.measurement,
    ...(adjustments.length
      ? { parameterAdjustments: Object.freeze(adjustments.map(value => Object.freeze(value))) }
      : {}),
    ...(dropped.length ? { droppedParameters: Object.freeze(dropped) } : {}),
  })
  plans.add(planned)
  planDefinitions.set(planned, definition)
  if (meter) planMeters.set(planned, meterSource(meter))
  return { planned }
}

function actualParameters(value: unknown): value is ModelRequestParameters {
  return 'ok' in judgeModelProfileDocument('ModelRequestParameters', value)
}
