import { isJsonNumber, type JsonObject } from '@omne-harness-lite/content-blocks'
import { isObject, isStringArray } from './json.ts'
import { inRange, isJsonInteger, isPositiveInteger } from './numbers.ts'
import type { ModelRequestParameters } from './types.ts'

export const PARAMETER_NAMES = [
  'reasoningEffort',
  'temperature',
  'topP',
  'seed',
  'maxOutputTokens',
  'stopSequences',
  'frequencyPenalty',
  'presencePenalty',
] as const

/** S-20: extra contributes its keys, not the container name. No values are changed. */
export function parameterNames(params: ModelRequestParameters): readonly string[] {
  return Object.freeze(
    Object.keys(params).flatMap(key => (key === 'extra' ? Object.keys(params.extra ?? {}) : [key])),
  )
}

function malformedNumericParameters(value: JsonObject): boolean {
  for (const name of ['temperature', 'topP', 'frequencyPenalty', 'presencePenalty']) {
    if (Object.hasOwn(value, name) && !isJsonNumber(value[name])) return true
  }
  for (const name of ['seed', 'maxOutputTokens']) {
    if (Object.hasOwn(value, name) && !isJsonInteger(value[name])) return true
  }
  return false
}

function malformedFixedParameters(value: JsonObject): boolean {
  if (Object.hasOwn(value, 'reasoningEffort') && typeof value.reasoningEffort !== 'string')
    return true
  if (malformedNumericParameters(value)) return true
  return Object.hasOwn(value, 'stopSequences') && !isStringArray(value.stopSequences)
}

function malformedExtraParameters(value: JsonObject): boolean {
  if (!isObject(value.extra)) return true
  const extraKeys = Object.keys(value.extra)
  return (
    extraKeys.length === 0 ||
    extraKeys.some(key => key === '' || PARAMETER_NAMES.some(name => name === key))
  )
}

export function malformedParameters(value: unknown, onProfile: boolean): boolean {
  if (!isObject(value)) return true
  const keys = Object.keys(value)
  if (onProfile && keys.length === 0) return true
  if (keys.some(key => key !== 'extra' && !PARAMETER_NAMES.some(name => name === key))) return true
  if (malformedFixedParameters(value)) return true
  return Object.hasOwn(value, 'extra') && malformedExtraParameters(value)
}

function reasoningOutOfRange(value: JsonObject): boolean {
  return (
    Object.hasOwn(value, 'reasoningEffort') &&
    (typeof value.reasoningEffort !== 'string' ||
      !['none', 'low', 'medium', 'high', 'max'].includes(value.reasoningEffort))
  )
}

function numericParametersOutOfRange(value: JsonObject): boolean {
  if (Object.hasOwn(value, 'temperature') && !inRange(value.temperature, 0, 2)) return true
  if (Object.hasOwn(value, 'topP') && !inRange(value.topP, 0, 1, true)) return true
  if (Object.hasOwn(value, 'maxOutputTokens') && !isPositiveInteger(value.maxOutputTokens))
    return true
  for (const name of ['frequencyPenalty', 'presencePenalty']) {
    if (Object.hasOwn(value, name) && !inRange(value[name], -2, 2)) return true
  }
  return false
}

export function parametersOutOfRange(value: JsonObject): boolean {
  if (reasoningOutOfRange(value)) return true
  if (numericParametersOutOfRange(value)) return true
  return (
    isStringArray(value.stopSequences) &&
    (value.stopSequences.length === 0 || value.stopSequences.some(item => item.length === 0))
  )
}
