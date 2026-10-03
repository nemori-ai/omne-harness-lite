import { LosslessNumber, type JsonValue } from '@omne-harness-lite/content-blocks'
import { createRequire } from 'node:module'
import { schemaId, SCHEMA_DEF_NAMES } from './schema-inputs.ts'
export { schemaId, SCHEMA_DEF_NAMES }
import { isObject, jsonValue } from './json.ts'
import { isJsonInteger, isPositiveInteger } from './numbers.ts'
import { parametersOutOfRange } from './parameters.ts'

export type SchemaDefName = (typeof SCHEMA_DEF_NAMES)[number]
export interface SchemaValidation {
  readonly valid: boolean
}

const require = createRequire(new URL('../package.json', import.meta.url))

/** Shape only. In particular this does not check the S-18 cross-field relation. */
export function validate(defName: SchemaDefName, value: unknown): SchemaValidation {
  const parsed = jsonValue(value)
  if (parsed === undefined) return Object.freeze({ valid: false })
  const name = SCHEMA_DEF_NAMES.find(item => item === defName)
  if (name === undefined) throw new Error(`unknown Schema definition: ${defName}`)
  // Exact original-number constraints precede projection. Ajv never sees number wrappers.
  if (!exactNumbers(defName, parsed)) return Object.freeze({ valid: false })
  const generated = require('./generated/ordinary.cjs') as Record<
    SchemaDefName,
    (value: unknown) => boolean
  >
  return Object.freeze({ valid: generated[name](project(parsed, defName)) === true })
}

type NumericContext = SchemaDefName | 'generic'

function project(value: JsonValue, context: NumericContext, member?: string): unknown {
  if (LosslessNumber.is(value)) {
    if (context === 'InputLimitFact' && member === 'value') return 1
    if (
      context === 'InputConstraints' &&
      ['maxImageBytes', 'maxImages', 'maxRequestBytes'].includes(member ?? '')
    )
      return 1
    if (context === 'ModelRequestParameters' && (member === 'topP' || member === 'maxOutputTokens'))
      return 1
    if (
      (context === 'ModelProfile' ||
        context === 'ModelProfileContent' ||
        context === 'ModelProfileSnapshot') &&
      (member === 'maxInputTokens' || member === 'maxOutputTokens')
    )
      return 1
    return 0
  }
  if (Array.isArray(value)) return value.map(item => project(item, 'generic'))
  if (isObject(value))
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        item === undefined ? undefined : project(item, childContext(context, key), key),
      ]),
    )
  return value
}

function childContext(context: NumericContext, key: string): NumericContext {
  const profile =
    context === 'ModelProfile' ||
    context === 'ModelProfileContent' ||
    context === 'ModelProfileSnapshot'
  if (profile && key === 'inputConstraints') return 'InputConstraints'
  if (profile && key === 'upstreamInputLimits') return 'UpstreamInputLimits'
  if (profile && key === 'parameters') return 'ModelRequestParameters'
  if (
    context === 'UpstreamInputLimits' &&
    ['maxInputTokens', 'maxRequestBytes', 'maxImageBytes', 'maxImages'].includes(key)
  )
    return 'InputLimitFact'
  if (
    (profile && ['maxInputTokens', 'maxOutputTokens'].includes(key)) ||
    (context === 'InputConstraints' &&
      ['maxImageBytes', 'maxImages', 'maxRequestBytes'].includes(key)) ||
    (context === 'InputLimitFact' && key === 'value') ||
    (context === 'ModelRequestParameters' && ['topP', 'maxOutputTokens'].includes(key))
  )
    return context
  return 'generic'
}

function exactNumbers(defName: SchemaDefName, value: JsonValue): boolean {
  if (!isObject(value)) return true
  if (defName === 'ModelRequestParameters') {
    if (Object.hasOwn(value, 'seed') && !isJsonInteger(value.seed)) return false
    return !parametersOutOfRange(value)
  }
  if (defName === 'InputConstraints')
    return ['maxImageBytes', 'maxImages', 'maxRequestBytes'].every(
      name => !Object.hasOwn(value, name) || isPositiveInteger(value[name]),
    )
  if (defName === 'InputLimitFact')
    return !Object.hasOwn(value, 'value') || isPositiveInteger(value.value)
  if (defName === 'UpstreamInputLimits')
    return ['maxInputTokens', 'maxRequestBytes', 'maxImageBytes', 'maxImages'].every(
      name =>
        !Object.hasOwn(value, name) ||
        (value[name] !== undefined && exactNumbers('InputLimitFact', value[name])),
    )
  if (
    defName === 'ModelProfile' ||
    defName === 'ModelProfileContent' ||
    defName === 'ModelProfileSnapshot'
  ) {
    for (const name of ['maxInputTokens', 'maxOutputTokens']) {
      if (Object.hasOwn(value, name) && !isPositiveInteger(value[name])) return false
    }
    if (
      Object.hasOwn(value, 'inputConstraints') &&
      value.inputConstraints !== undefined &&
      !exactNumbers('InputConstraints', value.inputConstraints)
    )
      return false
    if (
      Object.hasOwn(value, 'parameters') &&
      value.parameters !== undefined &&
      !exactNumbers('ModelRequestParameters', value.parameters)
    )
      return false
    if (
      Object.hasOwn(value, 'upstreamInputLimits') &&
      value.upstreamInputLimits !== undefined &&
      !exactNumbers('UpstreamInputLimits', value.upstreamInputLimits)
    )
      return false
  }
  return true
}
