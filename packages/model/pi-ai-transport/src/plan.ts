import { projectInput, stableAnthropicRoute } from './projection.ts'
import { measureCalibrated, type MessageSpan } from './calibration.ts'
// Derived from pi 0.86.1 openai-completions.ts, commit 3390bd93630965a12a0a1a5c36ce890ec22f7e1d.
// Copyright (c) 2025 Mario Zechner. MIT: ../LICENSE.pi. See provenance.json for changes.
import { createHash } from 'node:crypto'
import {
  writeJsonLossless,
  readOpaqueJson,
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
import { ownInputMeter, meterSource, type InputMeter } from './input-meter.ts'

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
function normalizeToolCallId(id: string): string {
  // Deterministic request-local rewrite; invocation and result share the same transform.
  return /^[A-Za-z0-9_-]{1,64}$/.test(id)
    ? id
    : `call_${createHash('sha256').update(id).digest('base64url').slice(0, 32)}`
}
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
export function planRequest(
  raw: PlanInput,
  definitions: readonly ModelDefinition[],
  meter?: InputMeter,
): PlanResult<PlannedRequest> {
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
  const input = ownPlanInput(raw)
  if (!input) {
    const snapshot = copyJsonValue(raw?.snapshot)
    if ('ok' in snapshot) {
      const missing = missingInputLimits(snapshot.ok)
      if (missing) {
        const prepared = preflightInputWithMissingLimits(raw)
        if (!prepared) return { rejected: 'invalidInput', reason: 'malformed' }
        const binding = prepared.snapshot.adaptation
        const definition = ownedDefinitions.find(
          d =>
            d.modelId === prepared.routeName &&
            d.revision === binding.definition.revision &&
            d.implementation.name === binding.implementation.name &&
            d.implementation.revision === binding.implementation.revision,
        )
        if (!definition || !Object.hasOwn(definition.routes, prepared.provider))
          return { rejected: 'unavailable' }
        const prior = planRequest(prepared, ownedDefinitions)
        if ('rejected' in prior) {
          if (
            prior.rejected === 'tool_internal_in_request' ||
            prior.rejected === 'modality_not_carried' ||
            prior.rejected === 'orphan_tool_call' ||
            (prior.rejected === 'invalidInput' && prior.reason === 'malformed')
          )
            return prior
        }
        return missing
      }
    }
    return { rejected: 'invalidInput', reason: 'malformed' }
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
  const calls = new Set<string>(),
    results = new Set<string>()
  for (const message of input.messages) {
    const span = { start: messages.length, end: messages.length + 1 }
    spans.push(span)
    if (message.type === 'tool_internal') return { rejected: 'tool_internal_in_request' }
    if (message.type === 'assistant') {
      const content: string[] = [],
        thinking: string[] = [],
        tools: JsonObject[] = [],
        details: JsonValue[] = []
      let independentPlainThinking = false
      for (const block of message.blocks) {
        if (!block.visibility.toModel) continue
        if (block.kind === 'text') content.push(block.text)
        else if (block.kind === 'thinking') {
          thinking.push(block.text)
          let replayedOpaque = false
          if (block.opaque) {
            const opaque = readOpaqueJson(block.opaque)
            if (
              object(opaque) &&
              opaque.routeName === input.routeName &&
              Array.isArray(opaque.reasoning_details)
            ) {
              details.push(...opaque.reasoning_details)
              replayedOpaque = opaque.reasoning_details.length > 0
            }
          }
          if (!replayedOpaque && block.text.length > 0) independentPlainThinking = true
        } else if (block.kind === 'tool_call' && block.complete) {
          calls.add(block.callId)
          tools.push({
            id: normalizeToolCallId(block.callId),
            type: 'function',
            function: {
              name: block.tool,
              arguments: block.unparseable
                ? block.rawArguments
                : writeJsonLossless(block.arguments),
            },
          })
        } else return { rejected: 'modality_not_carried' }
      }
      // The selected route has no verified lossless mapping for an additional
      // independent plaintext thinking block beside replayable opaque details.
      if (details.length && independentPlainThinking) return { rejected: 'unavailable' }
      messages.push({
        role: 'assistant',
        content:
          stableArrays && content.join('').length
            ? [{ type: 'text', text: content.join('') }]
            : content.join(''),
        ...(tools.length ? { tool_calls: tools } : {}),
        ...(details.length
          ? { reasoning_details: details }
          : thinking.some(Boolean)
            ? { reasoning: thinking.join('') }
            : {}),
      })
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
      messages.push({ role, content })
    }
  }
  if ([...calls].some(id => !results.has(id))) return { rejected: 'orphan_tool_call' }
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
        const last = messages.findLast(
          m => m.role === 'user' || m.role === 'assistant' || m.role === 'tool',
        )
        if (last) addBreakpoint(last, control)
      }
    }
  }
  const owned = ownedObject(body)
  if (!owned) throw new Error('planned wire body is not JSON')
  const serialized = writeJsonLossless(owned)
  if (!meter) return { rejected: 'unavailable' }
  const projection = projectInput(owned, input, meter)
  let calibrated: ReturnType<typeof measureCalibrated>
  try {
    calibrated = measureCalibrated(input, projection, spans, meter, () =>
      meter.measureFull({ body: owned, serialized }),
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
