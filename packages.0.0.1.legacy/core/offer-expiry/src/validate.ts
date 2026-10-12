import { createRequire } from 'node:module'
import type { ErrorObject } from 'ajv'
import { schemaId, SCHEMA_DEF_NAMES } from './schema-inputs.ts'
export { schemaId, SCHEMA_DEF_NAMES }
export type SchemaDefName = (typeof SCHEMA_DEF_NAMES)[number]
export interface SchemaValidation {
  readonly valid: boolean
  readonly errors: readonly string[]
}
const require = createRequire(new URL('../package.json', import.meta.url))
interface FixedValidator {
  (value: unknown): boolean
  errors?: readonly ErrorObject[] | null
}
export function validate(defName: SchemaDefName, value: unknown): SchemaValidation {
  if (!SCHEMA_DEF_NAMES.some(name => name === defName))
    throw new Error(`schema definition not found: ${defName}`)
  const validators = require('./generated/ordinary.cjs') as Record<SchemaDefName, FixedValidator>
  const fn = validators[defName]
  const valid = fn(value) === true
  const errors = valid
    ? []
    : (fn.errors ?? []).map(e => `${e.instancePath} ${e.message ?? ''}`.trim())
  return { valid, errors }
}
