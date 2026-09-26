import schema from '@omne-harness-lite/call-accounts/schema' with { type: 'json' }
import contentSchema from '@omne-harness-lite/content-blocks/schema/v2' with { type: 'json' }
import identitySchema from '@omne-harness-lite/identity-values/schema' with { type: 'json' }
import expirySchema from '@omne-harness-lite/offer-expiry/schema/v1' with { type: 'json' }
import { Ajv2020 } from 'ajv/dist/2020.js'
import {
  isJsonNumber,
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
  type JsonValue,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from './decimal.ts'

export const schemaId = schema.$id
export const SCHEMA_DEF_NAMES = [
  'Unknown',
  'ResponseId',
  'Usage',
  'Cost',
  'CostItem',
  'ToolCallAccount',
  'FrameAccount',
  'TrimReason',
  'TrimSummary',
  'CostCorrection',
  'RunId',
  'AttemptId',
  'ModelCallId',
] as const
export type SchemaDefName = (typeof SCHEMA_DEF_NAMES)[number]
export interface SchemaValidation {
  readonly valid: boolean
}

function compile(structure: boolean) {
  const ajv = new Ajv2020({
    strict: true,
    strictTypes: false,
    strictRequired: false,
    validateFormats: false,
    ownProperties: true,
  })
  // Imported frozen identity/expiry resources carry this non-asserting annotation.
  ajv.addKeyword({ keyword: 'x-counterexamples', valid: true })
  for (const resource of [contentSchema, identitySchema, expirySchema, schema]) {
    const selected = structure ? structuralSchema(resource) : resource
    if (selected === null || typeof selected !== 'object' || Array.isArray(selected))
      throw new Error('owned Schema is not an object')
    ajv.addSchema(selected)
  }
  return Object.freeze(
    SCHEMA_DEF_NAMES.map(name => {
      const validator = ajv.getSchema(`${schemaId}#/$defs/${name}`)
      if (validator === undefined) throw new Error(`missing account Schema: ${name}`)
      return Object.freeze({ name, validator })
    }),
  )
}
// Fixed, owned definitions only. There is no caller-schema cache or external lookup.
const full = compile(false)
const structural = compile(true)

export function validate(kind: SchemaDefName, value: unknown): SchemaValidation {
  const copied = snapshotJson(value)
  return Object.freeze({ valid: copied !== undefined && run(full, kind, copied) })
}
export function structureValid(kind: SchemaDefName, value: JsonValue): boolean {
  if (!run(structural, kind, value)) return false
  // This allOf is a shape restriction, not a cross-member or numeric rule.
  if (
    kind === 'ToolCallAccount' &&
    isObject(value) &&
    isObject(value.credentialScope) &&
    value.credentialScope.layer !== 'tenant'
  )
    return false
  return true
}
function run(
  validators: ReturnType<typeof compile>,
  kind: SchemaDefName,
  value: JsonValue,
): boolean {
  const entry = validators.find(item => item.name === kind)
  if (entry === undefined) throw new Error(`unknown account definition: ${kind}`)
  return entry.validator(project(value)) === true
}
/** A field-free JSON copy rejects getters, cycles, undefined, and non-JSON objects. */
export function snapshotJson(value: unknown): JsonValue | undefined {
  try {
    const parsed = readJsonStrict(writeJsonLossless(value))
    if ('failed' in parsed) throw new Error('lossless writer produced invalid JSON')
    return parsed.ok
  } catch (error) {
    if (error instanceof TypeError) return undefined
    throw error
  }
}
export function isObject(value: unknown): value is JsonObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !LosslessNumber.is(value)
  )
}
/**
 * These owned schemas only test integerness, sign and minimum 0/1. Project the
 * exact category, never the amount: huge/fractional literals remain distinguishable.
 */
function project(value: JsonValue): unknown {
  if (isJsonNumber(value)) {
    const decimal = ExactDecimal.from(value)
    const relation = decimal.compare(ExactDecimal.from(0))
    return relation === 0 ? 0 : decimal.isInteger ? relation : relation * 0.5
  }
  if (Array.isArray(value)) return value.map(project)
  if (isObject(value))
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, project(item)]))
  return value
}
function structuralSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(structuralSchema)
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !['minimum', 'if', 'then', 'else', 'allOf'].includes(key))
        .map(([key, item]) => [key, structuralSchema(item)]),
    )
  return value
}
