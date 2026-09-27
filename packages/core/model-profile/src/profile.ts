import {
  isJsonNumber,
  validate as validateContent,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import {
  OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS,
  parseScopeLayerIdentity,
  tenantIdEquals,
  type ScopeLayerIdentity,
} from '@omne-harness-lite/identity-values'
import { validate as validateExpiry } from '@omne-harness-lite/offer-expiry'
import { isObject, isStringArray, jsonValue } from './json.ts'
import { compareNumbers, isPositiveInteger } from './numbers.ts'
import { malformedParameters, parametersOutOfRange } from './parameters.ts'
import { validate } from './schema.ts'
import type {
  ModelProfile,
  ModelProfileDocumentKind,
  ModelProfileJudgment,
  ModelProfileRef,
  ModelProfileRejection,
} from './types.ts'

const contentMembers = [
  'routeName',
  'adaptation',
  'origin',
  'providers',
  'allowFallback',
  'inputModalities',
  'outputModalities',
  'maxInputTokens',
  'maxOutputTokens',
  'inputConstraints',
]
const profileMembers = [...contentMembers, 'registration', 'updatedAt']

/** S-25: check all malformed conditions before any of the nine named predicates. */
export function judgeModelProfileDocument(
  kind: ModelProfileDocumentKind,
  value: unknown,
): ModelProfileJudgment {
  const document = jsonValue(value)
  if (!isObject(document) || malformed(kind, document)) return rejected('malformed')
  if (kind === 'ModelRequestParameters') {
    return parametersOutOfRange(document)
      ? rejected('parameter_out_of_range')
      : Object.freeze({ ok: true })
  }
  if (document.routeName === '') return rejected('route_name_empty')
  if (kind === 'ModelProfileRef') return Object.freeze({ ok: true })
  if (isStringArray(document.providers) && document.providers.length === 0)
    return rejected('providers_empty')
  const input = document.inputModalities
  const output = document.outputModalities
  if (isStringArray(input) && isStringArray(output)) {
    if (input.length === 0 || output.length === 0) return rejected('modalities_empty')
    if (!input.includes('text')) return rejected('input_text_missing')
    if ([...input, ...output].some(item => !validateContent('Modality', item).valid))
      return rejected('modality_unknown')
  }
  if (
    kind === 'ModelProfile' &&
    document.registration !== 'listed' &&
    document.registration !== 'withdrawn'
  )
    return rejected('registration_unknown')
  const params = document.parameters
  if (isObject(params)) {
    if (parametersOutOfRange(params)) return rejected('parameter_out_of_range')
    if (
      isJsonNumber(params.maxOutputTokens) &&
      isJsonNumber(document.maxOutputTokens) &&
      compareNumbers(params.maxOutputTokens, document.maxOutputTokens) > 0
    )
      return rejected('max_output_exceeds_profile')
  }
  if (
    isObject(document.inputConstraints) &&
    Object.keys(document.inputConstraints).some(key => key !== 'maxImageBytes')
  )
    return rejected('constraint_unknown')
  // This is an invariant check on the implementation, not a fallback error classifier.
  if (!validate(kind, document).valid)
    throw new Error('model-profile predicates disagree with owned Schema')
  return Object.freeze({ ok: true })
}

function malformed(kind: ModelProfileDocumentKind, value: JsonObject): boolean {
  if (kind === 'ModelRequestParameters') return malformedParameters(value, false)
  if (
    typeof value.routeName !== 'string' ||
    (value.origin !== 'official' && value.origin !== 'custom')
  )
    return true
  if (routeWhitespace(value.routeName)) return true
  if (kind === 'ModelProfileRef') {
    const members =
      value.origin === 'official' ? ['origin', 'routeName'] : ['origin', 'scope', 'routeName']
    if (!hasMembers(value, members, members)) return true
    return value.origin === 'custom' && !('ok' in parseScopeLayerIdentity(value.scope))
  }
  const required = kind === 'ModelProfile' ? profileMembers : contentMembers
  if (!hasMembers(value, required, [...required, 'parameters'])) return true
  if (!validate('ModelAdaptationBinding', value.adaptation).valid) return true
  const binding = value.adaptation
  if (
    !isObject(binding) ||
    !isObject(binding.definition) ||
    (value.routeName !== '' && binding.definition.modelId !== value.routeName)
  )
    return true
  if (typeof value.allowFallback !== 'boolean') return true
  for (const name of ['providers', 'inputModalities', 'outputModalities']) {
    const items = value[name]
    if (!isStringArray(items) || new Set(items).size !== items.length) return true
    if (name === 'providers' && items.some(item => item === '')) return true
  }
  if (!isPositiveInteger(value.maxInputTokens) || !isPositiveInteger(value.maxOutputTokens))
    return true
  if (!isObject(value.inputConstraints)) return true
  if (
    Object.hasOwn(value.inputConstraints, 'maxImageBytes') &&
    !isPositiveInteger(value.inputConstraints.maxImageBytes)
  )
    return true
  if (Object.hasOwn(value, 'parameters') && malformedParameters(value.parameters, true)) return true
  return (
    kind === 'ModelProfile' &&
    (typeof value.registration !== 'string' || !validateExpiry('Instant', value.updatedAt).valid)
  )
}

function hasMembers(
  value: JsonObject,
  required: readonly string[],
  allowed: readonly string[],
): boolean {
  return (
    required.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => allowed.includes(key))
  )
}

function routeWhitespace(value: string): boolean {
  const points = Array.from(value)
  const first = points[0]?.codePointAt(0)
  const last = points.at(-1)?.codePointAt(0)
  return (
    (first !== undefined && OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS.includes(first)) ||
    (last !== undefined && OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS.includes(last))
  )
}

function rejected(reason: ModelProfileRejection): ModelProfileJudgment {
  return Object.freeze({ rejected: reason })
}

// The directory supplies the row's scope separately because S-1 excludes it from ModelProfile.
export function refMatches(
  ref: Extract<ModelProfileRef, { origin: 'official' }>,
  profile: ModelProfile,
): boolean
export function refMatches(
  ref: Extract<ModelProfileRef, { origin: 'custom' }>,
  profile: ModelProfile,
  scope: ScopeLayerIdentity,
): boolean
export function refMatches(
  ref: ModelProfileRef,
  profile: ModelProfile,
  scope: ScopeLayerIdentity | undefined,
): boolean
export function refMatches(
  ref: ModelProfileRef,
  profile: ModelProfile,
  scope?: ScopeLayerIdentity,
): boolean {
  if (ref.origin !== profile.origin || ref.routeName !== profile.routeName) return false
  if (ref.origin === 'official') return true
  if (scope === undefined || ref.scope.layer !== scope.layer) return false
  if (ref.scope.layer === 'organization' && scope.layer === 'organization')
    return ref.scope.organization === scope.organization
  return (
    ref.scope.layer === 'tenant' &&
    scope.layer === 'tenant' &&
    tenantIdEquals(ref.scope.tenant, scope.tenant)
  )
}
