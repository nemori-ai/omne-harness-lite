import { createRequire } from 'node:module'
import { schemaId, SCHEMA_DEF_NAMES } from './schema-inputs.ts'
export { schemaId, SCHEMA_DEF_NAMES }
import {
  isJsonNumber,
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
  type JsonValue,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from './decimal.ts'

export type SchemaDefName = (typeof SCHEMA_DEF_NAMES)[number]
export interface SchemaValidation {
  readonly valid: boolean
}

const require = createRequire(new URL('../package.json', import.meta.url))

export function validate(kind: SchemaDefName, value: unknown): SchemaValidation {
  const copied = snapshotJson(value)
  return Object.freeze({ valid: copied !== undefined && run('full', kind, copied) })
}
export function structureValid(kind: SchemaDefName, value: JsonValue): boolean {
  if (!run('structural', kind, value)) return false
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
function run(graph: 'full' | 'structural', kind: SchemaDefName, value: JsonValue): boolean {
  const name = SCHEMA_DEF_NAMES.find(item => item === kind)
  if (name === undefined) throw new Error(`unknown account definition: ${kind}`)
  const validators = require(`./generated/${graph}.cjs`) as Record<
    SchemaDefName,
    (value: unknown) => boolean
  >
  return validators[name](project(value)) === true
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
