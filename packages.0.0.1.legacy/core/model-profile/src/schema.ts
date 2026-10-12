import { LosslessNumber, type JsonObject, type JsonValue } from '@omne-harness-lite/content-blocks'
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

const profileNumericMembers = ['maxInputTokens', 'maxOutputTokens']
const inputConstraintMembers = ['maxImageBytes', 'maxImages', 'maxRequestBytes']
const inputLimitMembers = ['maxInputTokens', 'maxRequestBytes', 'maxImageBytes', 'maxImages']
const numericMembers: Partial<Record<NumericContext, readonly string[]>> = {
  InputLimitFact: ['value'],
  InputConstraints: inputConstraintMembers,
  ModelRequestParameters: ['topP', 'maxOutputTokens'],
  ModelProfile: profileNumericMembers,
  ModelProfileContent: profileNumericMembers,
  ModelProfileSnapshot: profileNumericMembers,
}

function isProfileContext(context: NumericContext): boolean {
  return (
    context === 'ModelProfile' ||
    context === 'ModelProfileContent' ||
    context === 'ModelProfileSnapshot'
  )
}

function isNumericMember(context: NumericContext, member: string): boolean {
  return numericMembers[context]?.includes(member) === true
}

function project(value: JsonValue, context: NumericContext, member?: string): unknown {
  if (LosslessNumber.is(value)) return isNumericMember(context, member ?? '') ? 1 : 0
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
  const profile = isProfileContext(context)
  if (profile && key === 'inputConstraints') return 'InputConstraints'
  if (profile && key === 'upstreamInputLimits') return 'UpstreamInputLimits'
  if (profile && key === 'parameters') return 'ModelRequestParameters'
  if (context === 'UpstreamInputLimits' && inputLimitMembers.includes(key)) return 'InputLimitFact'
  if (isNumericMember(context, key)) return context
  return 'generic'
}

function exactParameterNumbers(value: JsonObject): boolean {
  if (Object.hasOwn(value, 'seed') && !isJsonInteger(value.seed)) return false
  return !parametersOutOfRange(value)
}

function exactConstraintNumbers(value: JsonObject): boolean {
  return inputConstraintMembers.every(
    name => !Object.hasOwn(value, name) || isPositiveInteger(value[name]),
  )
}

function exactLimitNumbers(value: JsonObject): boolean {
  return inputLimitMembers.every(
    name =>
      !Object.hasOwn(value, name) ||
      (value[name] !== undefined && exactNumbers('InputLimitFact', value[name])),
  )
}

function exactProfileChildren(value: JsonObject): boolean {
  const children: readonly (readonly [string, SchemaDefName])[] = [
    ['inputConstraints', 'InputConstraints'],
    ['parameters', 'ModelRequestParameters'],
    ['upstreamInputLimits', 'UpstreamInputLimits'],
  ]
  for (const [name, definition] of children) {
    if (
      Object.hasOwn(value, name) &&
      value[name] !== undefined &&
      !exactNumbers(definition, value[name])
    )
      return false
  }
  return true
}

function exactProfileNumbers(value: JsonObject): boolean {
  for (const name of profileNumericMembers) {
    if (Object.hasOwn(value, name) && !isPositiveInteger(value[name])) return false
  }
  return exactProfileChildren(value)
}

function exactNumbers(defName: SchemaDefName, value: JsonValue): boolean {
  if (!isObject(value)) return true
  if (defName === 'ModelRequestParameters') return exactParameterNumbers(value)
  if (defName === 'InputConstraints') return exactConstraintNumbers(value)
  if (defName === 'InputLimitFact')
    return !Object.hasOwn(value, 'value') || isPositiveInteger(value.value)
  if (defName === 'UpstreamInputLimits') return exactLimitNumbers(value)
  if (isProfileContext(defName)) return exactProfileNumbers(value)
  return true
}
