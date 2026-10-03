import {
  copyJsonValue,
  isJsonNumber,
  type JsonNumber,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  judgeModelProfileDocument,
  validate,
  type ModelAdaptationBinding,
  type ModelProfileContent,
  type ModelRequestParameters,
  type ProviderName,
} from '@omne-harness-lite/model-profile'
import { object } from './json.ts'

export type UnifiedParameterName = Exclude<keyof ModelRequestParameters, 'extra'>
export const parameterOrder = Object.freeze([
  'reasoningEffort',
  'temperature',
  'topP',
  'seed',
  'maxOutputTokens',
  'stopSequences',
  'frequencyPenalty',
  'presencePenalty',
] as const satisfies readonly UnifiedParameterName[])
export type ParameterRule<T> =
  | { readonly kind: 'pass' }
  | { readonly kind: 'drop' }
  | {
      readonly kind: 'select'
      readonly accepted:
        | { readonly values: readonly T[] }
        | { readonly minimum: JsonNumber; readonly maximum: JsonNumber }
      readonly otherwise: { readonly drop: true } | { readonly adjustTo: T }
    }
export type ParameterRules = {
  readonly [K in UnifiedParameterName]: ParameterRule<NonNullable<ModelRequestParameters[K]>>
}
export type CacheBreakpoint = 'system' | 'last_tool' | 'last_message'
export type CacheDeclaration =
  | { readonly mode: 'automatic' }
  | {
      readonly mode: 'explicit'
      readonly ttlValues: readonly string[]
      readonly breakpointLayouts: readonly (readonly CacheBreakpoint[])[]
    }
export type CachePolicy =
  | { readonly mode: 'automatic' }
  | {
      readonly mode: 'explicit'
      readonly ttl: string
      readonly breakpoints: readonly CacheBreakpoint[]
    }
export type ModelCapabilities = Pick<
  ModelProfileContent,
  | 'inputModalities'
  | 'outputModalities'
  | 'maxInputTokens'
  | 'maxOutputTokens'
  | 'inputConstraints'
  | 'upstreamInputLimits'
>
export interface ModelRoute {
  readonly reminderRole: 'developer' | 'user'
  readonly parameters: ParameterRules
  readonly extra: Readonly<Record<string, ParameterRule<JsonValue>>>
  readonly cache: CacheDeclaration
}
export interface ModelDefinition {
  readonly modelId: string
  readonly revision: string
  readonly implementation: { readonly name: string; readonly revision: string }
  readonly capabilities: ModelCapabilities
  readonly routes: Readonly<Record<ProviderName, ModelRoute>>
}
export type DefinitionCoordinates = Pick<ModelAdaptationBinding, 'implementation' | 'definition'>
export type DefinitionResult<T> =
  { readonly ok: T } | { readonly rejected: 'invalidInput' | 'unavailable' }

/** Unified aliases and request control fields cannot be registered as private parameters. */
export const protectedParameterKeys = new Set<string>([
  ...parameterOrder,
  'extra',
  'model',
  'messages',
  'stream',
  'stream_options',
  'provider',
  'models',
  'route',
  'tools',
  'tool_choice',
  'user',
  'session_id',
  'x-session-id',
  'prompt_cache_key',
  'store',
  'transforms',
  'plugins',
  'cache_control',
  'top_p',
  'stop',
  'frequency_penalty',
  'presence_penalty',
  'max_tokens',
  'max_completion_tokens',
  'reasoning',
  'reasoning_effort',
])
export function members(value: JsonObject, required: readonly string[]): boolean {
  return (
    Object.keys(value).length === required.length &&
    required.every(key => Object.hasOwn(value, key))
  )
}
/** JSON equality uses exact decimal values, not rounded Number values or source spellings. */
export function jsonEqual(left: JsonValue, right: JsonValue): boolean {
  if (isJsonNumber(left) && isJsonNumber(right))
    return ExactDecimal.from(left).compare(ExactDecimal.from(right)) === 0
  if (Array.isArray(left) && Array.isArray(right))
    return (
      left.length === right.length &&
      left.every((value, index) => {
        const other = right[index]
        return other !== undefined && jsonEqual(value, other)
      })
    )
  if (object(left) && object(right)) return jsonObjectsEqual(left, right)
  return left === right
}
function jsonObjectsEqual(left: JsonObject, right: JsonObject): boolean {
  return (
    Object.keys(left).length === Object.keys(right).length &&
    Object.keys(left).every(key => {
      const value = left[key],
        other = right[key]
      return (
        value !== undefined &&
        other !== undefined &&
        Object.hasOwn(right, key) &&
        jsonEqual(value, other)
      )
    })
  )
}
export function codePointOrder(left: string, right: string): number {
  const a = Array.from(left),
    b = Array.from(right)
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    const x = a[index]?.codePointAt(0),
      y = b[index]?.codePointAt(0)
    if (x === undefined || y === undefined) throw new Error('missing string codepoint')
    if (x !== y) return x < y ? -1 : 1
  }
  return a.length - b.length
}
function parameterValue(name: UnifiedParameterName | undefined, value: JsonValue): boolean {
  return (
    name === undefined ||
    'ok' in judgeModelProfileDocument('ModelRequestParameters', { [name]: value })
  )
}
function acceptedValue(accepted: JsonObject, value: JsonValue): boolean {
  if (Array.isArray(accepted.values)) return accepted.values.some(item => jsonEqual(item, value))
  return (
    isJsonNumber(value) &&
    isJsonNumber(accepted.minimum) &&
    isJsonNumber(accepted.maximum) &&
    ExactDecimal.from(value).compare(ExactDecimal.from(accepted.minimum)) >= 0 &&
    ExactDecimal.from(value).compare(ExactDecimal.from(accepted.maximum)) <= 0
  )
}
export function ruleAccepts(rule: ParameterRule<JsonValue>, value: JsonValue): boolean {
  if (rule.kind === 'pass') return true
  if (rule.kind === 'drop') return false
  if ('values' in rule.accepted) return rule.accepted.values.some(item => jsonEqual(item, value))
  return (
    isJsonNumber(value) &&
    ExactDecimal.from(value).compare(ExactDecimal.from(rule.accepted.minimum)) >= 0 &&
    ExactDecimal.from(value).compare(ExactDecimal.from(rule.accepted.maximum)) <= 0
  )
}
function ruleValid(raw: JsonValue, name?: UnifiedParameterName): boolean {
  if (!object(raw)) return false
  if (raw.kind === 'pass') return members(raw, ['kind'])
  // G-22 retains the caller's requested output cap after profile validation.
  if (name === 'maxOutputTokens') return false
  if (raw.kind === 'drop') return members(raw, ['kind'])
  if (!selectRuleShape(raw)) return false
  const accepted = raw.accepted
  if (!acceptedDomainValid(accepted, name)) return false
  return otherwiseValid(raw, accepted, name)
}
function selectRuleShape(raw: JsonObject): raw is JsonObject & {
  accepted: JsonObject
  otherwise: JsonObject
} {
  return !(
    raw.kind !== 'select' ||
    !members(raw, ['kind', 'accepted', 'otherwise']) ||
    !object(raw.accepted) ||
    !object(raw.otherwise)
  )
}
function otherwiseValid(
  raw: JsonObject & { otherwise: JsonObject },
  accepted: JsonObject,
  name: UnifiedParameterName | undefined,
): boolean {
  return members(raw.otherwise, ['drop'])
    ? raw.otherwise.drop === true
    : members(raw.otherwise, ['adjustTo']) &&
        raw.otherwise.adjustTo !== undefined &&
        parameterValue(name, raw.otherwise.adjustTo) &&
        acceptedValue(accepted, raw.otherwise.adjustTo)
}
function acceptedDomainValid(
  accepted: JsonObject,
  name: UnifiedParameterName | undefined,
): boolean {
  if (members(accepted, ['values'])) {
    const values = accepted.values
    if (
      !Array.isArray(values) ||
      values.length === 0 ||
      values.some(
        (value, index) =>
          !parameterValue(name, value) ||
          values.slice(0, index).some(prior => jsonEqual(prior, value)),
      )
    )
      return false
  } else if (members(accepted, ['minimum', 'maximum'])) {
    return acceptedRangeValid(accepted, name)
  } else return false
  return true
}
function acceptedRangeValid(accepted: JsonObject, name: UnifiedParameterName | undefined): boolean {
  return !(
    name === undefined ||
    name === 'reasoningEffort' ||
    name === 'stopSequences' ||
    !isJsonNumber(accepted.minimum) ||
    !isJsonNumber(accepted.maximum) ||
    !parameterValue(name, accepted.minimum) ||
    !parameterValue(name, accepted.maximum) ||
    ExactDecimal.from(accepted.minimum).compare(ExactDecimal.from(accepted.maximum)) > 0
  )
}
function cacheValid(raw: JsonValue | undefined): boolean {
  if (!object(raw)) return false
  if (raw.mode === 'automatic') return members(raw, ['mode'])
  const ttls = raw.ttlValues,
    layouts = raw.breakpointLayouts
  return (
    raw.mode === 'explicit' &&
    members(raw, ['mode', 'ttlValues', 'breakpointLayouts']) &&
    Array.isArray(ttls) &&
    ttls.length > 0 &&
    ttls.every(value => typeof value === 'string' && value.length > 0) &&
    new Set(ttls).size === ttls.length &&
    cacheLayoutsValid(layouts)
  )
}
function cacheLayoutsValid(layouts: JsonValue | undefined): boolean {
  return (
    Array.isArray(layouts) &&
    layouts.length > 0 &&
    layouts.every(
      (layout, index) =>
        Array.isArray(layout) &&
        layout.length > 0 &&
        layout.every(
          value => value === 'system' || value === 'last_tool' || value === 'last_message',
        ) &&
        new Set(layout).size === layout.length &&
        !layouts.slice(0, index).some(prior => jsonEqual(prior, layout)),
    )
  )
}
function definitionValid(value: unknown): value is ModelDefinition {
  if (
    !object(value) ||
    !members(value, ['modelId', 'revision', 'implementation', 'capabilities', 'routes']) ||
    !object(value.implementation) ||
    !object(value.capabilities) ||
    !object(value.routes) ||
    !members(value.capabilities, [
      'inputModalities',
      'outputModalities',
      'maxInputTokens',
      'maxOutputTokens',
      'inputConstraints',
      'upstreamInputLimits',
    ]) ||
    Object.keys(value.routes).length === 0
  )
    return false
  const adaptation = {
    implementation: value.implementation,
    definition: { modelId: value.modelId, revision: value.revision },
    configuration: { revision: 'validation', values: {} },
  }
  if (!validate('ModelAdaptationBinding', adaptation).valid) return false
  // Representation-validation projection only; no official content or facts are published.
  if (
    'rejected' in
    judgeModelProfileDocument('ModelProfileContent', {
      ...value.capabilities,
      routeName: value.modelId,
      adaptation,
      origin: 'official',
      providers: Object.keys(value.routes),
      allowFallback: false,
    })
  )
    return false
  return Object.entries(value.routes).every(([provider, route]) => routeValid(provider, route))
}
function routeValid(provider: string, route: JsonValue): boolean {
  if (
    !validate('ProviderName', provider).valid ||
    !object(route) ||
    !members(route, ['reminderRole', 'parameters', 'extra', 'cache']) ||
    (route.reminderRole !== 'developer' && route.reminderRole !== 'user')
  )
    return false
  const parameters = route.parameters,
    extra = route.extra
  return (
    parametersValid(parameters) &&
    object(extra) &&
    Object.entries(extra).every(
      ([key, rule]) => key.length > 0 && !protectedParameterKeys.has(key) && ruleValid(rule),
    ) &&
    cacheValid(route.cache)
  )
}
function parametersValid(parameters: JsonValue | undefined): boolean {
  return (
    object(parameters) &&
    members(parameters, parameterOrder) &&
    parameterOrder.every(name => {
      const rule = parameters[name]
      return rule !== undefined && ruleValid(rule, name)
    })
  )
}
/** Own every nested value before publication or network-resource construction. */
export function ownDefinitions(values: readonly ModelDefinition[]): readonly ModelDefinition[] {
  if (!Array.isArray(values)) throw new TypeError('model definitions required')
  const copied = copyJsonValue(values)
  if ('failed' in copied || !Array.isArray(copied.ok))
    throw new TypeError('invalid model definitions')
  const seen = new Set<string>()
  return Object.freeze(
    copied.ok.map(value => {
      if (!definitionValid(value)) throw new TypeError('invalid model definition')
      const owned = value
      const key = JSON.stringify([
        owned.implementation.name,
        owned.implementation.revision,
        owned.modelId,
        owned.revision,
      ])
      if (seen.has(key)) throw new TypeError('duplicate model definition')
      seen.add(key)
      return owned
    }),
  )
}
export function tryDefinition(value: ModelDefinition): ModelDefinition | undefined {
  try {
    return ownDefinitions([value])[0]
  } catch (error) {
    if (error instanceof TypeError) return undefined
    throw error
  }
}
function coordinatesValid(value: unknown): value is DefinitionCoordinates {
  return (
    object(value) &&
    members(value, ['implementation', 'definition']) &&
    validate('ModelAdaptationBinding', {
      ...value,
      configuration: { revision: 'read', values: {} },
    }).valid
  )
}
export function readModelDefinition(
  definitions: readonly ModelDefinition[],
  coordinates: DefinitionCoordinates,
): DefinitionResult<ModelDefinition> {
  const copied = copyJsonValue(coordinates)
  if ('failed' in copied || !coordinatesValid(copied.ok)) return { rejected: 'invalidInput' }
  const ownedCoordinates = copied.ok
  let owned: readonly ModelDefinition[]
  try {
    owned = ownDefinitions(definitions)
  } catch (error) {
    if (error instanceof TypeError) return { rejected: 'invalidInput' }
    throw error
  }
  const result = owned.find(
    value =>
      value.modelId === ownedCoordinates.definition.modelId &&
      value.revision === ownedCoordinates.definition.revision &&
      value.implementation.name === ownedCoordinates.implementation.name &&
      value.implementation.revision === ownedCoordinates.implementation.revision,
  )
  return result ? { ok: result } : { rejected: 'unavailable' }
}
