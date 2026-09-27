import schema from '@omne-harness-lite/model-profile/schema' with { type: 'json' }
import contentSchema from '@omne-harness-lite/content-blocks/schema/v2' with { type: 'json' }
import identitySchema from '@omne-harness-lite/identity-values/schema' with { type: 'json' }
import expirySchema from '@omne-harness-lite/offer-expiry/schema/v1' with { type: 'json' }
import { LosslessNumber, type JsonValue } from '@omne-harness-lite/content-blocks'
import { Ajv2020 } from 'ajv/dist/2020.js'
import { isObject, jsonValue } from './json.ts'
import { isJsonInteger, isPositiveInteger } from './numbers.ts'
import { parametersOutOfRange } from './parameters.ts'

export const schemaId = schema.$id
export const SCHEMA_DEF_NAMES = [
  'ModelProfile',
  'ModelProfileContent',
  'ModelProfileSnapshot',
  'ModelProfileRef',
  'RouteName',
  'ProfileOrigin',
  'ProviderName',
  'InputConstraints',
  'Registration',
  'ModelRequestParameters',
  'ReasoningEffort',
] as const
export type SchemaDefName = (typeof SCHEMA_DEF_NAMES)[number]
export interface SchemaValidation {
  readonly valid: boolean
}

// Only fixed owned schemas are compiled. No growing cache of caller schemas.
const ajv = new Ajv2020({
  strict: true,
  strictTypes: false,
  strictRequired: false,
  validateFormats: false,
  ownProperties: true,
})
ajv.addKeyword('x-counterexamples')
for (const resource of [identitySchema, expirySchema, contentSchema, schema])
  ajv.addSchema(resource)
const validators = Object.freeze(
  SCHEMA_DEF_NAMES.map(name => {
    const validator = ajv.getSchema(`${schemaId}#/$defs/${name}`)
    if (validator === undefined) throw new Error(`missing Schema definition: ${name}`)
    return { name, validator }
  }),
)

/** Shape only. In particular this does not check the S-18 cross-field relation. */
export function validate(defName: SchemaDefName, value: unknown): SchemaValidation {
  const parsed = jsonValue(value)
  if (parsed === undefined) return Object.freeze({ valid: false })
  const entry = validators.find(item => item.name === defName)
  if (entry === undefined) throw new Error(`unknown Schema definition: ${defName}`)
  // Exact original-number constraints precede projection. Ajv never sees number wrappers.
  if (!exactNumbers(defName, parsed)) return Object.freeze({ valid: false })
  return Object.freeze({ valid: entry.validator(project(parsed)) === true })
}

function project(value: JsonValue, member?: string): unknown {
  if (LosslessNumber.is(value))
    return member === 'topP' ||
      member === 'maxInputTokens' ||
      member === 'maxOutputTokens' ||
      member === 'maxImageBytes'
      ? 1
      : 0
  if (Array.isArray(value)) return value.map(item => project(item))
  if (isObject(value))
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, project(item, key)]))
  return value
}

function exactNumbers(defName: SchemaDefName, value: JsonValue): boolean {
  if (!isObject(value)) return true
  if (defName === 'ModelRequestParameters') {
    if (Object.hasOwn(value, 'seed') && !isJsonInteger(value.seed)) return false
    return !parametersOutOfRange(value)
  }
  if (defName === 'InputConstraints')
    return !Object.hasOwn(value, 'maxImageBytes') || isPositiveInteger(value.maxImageBytes)
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
  }
  return true
}
