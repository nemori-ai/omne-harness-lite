// Fixed entry definitions retain ordinary Ajv value and error behavior.
import { createRequire } from 'node:module'
import type { ErrorObject } from 'ajv/dist/2020.js'
import { ENTRY_SCHEMA_ID, entryDefinitions } from '../schema-inputs.ts'
export { ENTRY_SCHEMA_ID }
const require = createRequire(new URL('../../package.json', import.meta.url))
interface EntryValidator {
  (value: unknown): boolean
  readonly schema: unknown
  readonly errors?: readonly ErrorObject[] | null
}
/** A missing definition is an owner defect. The finite generated table has no caller cache. */
export function entryValidator(defName: string): EntryValidator {
  if (!Object.hasOwn(entryDefinitions, defName))
    throw new Error(`schema definition not found: ${defName}`)
  const generated = require('./generated/ordinary.cjs') as Record<string, EntryValidator>
  const validator = generated[defName]
  if (validator === undefined) throw new Error(`schema definition not found: ${defName}`)
  return validator
}
export function conformsTo(defName: string, value: unknown): boolean {
  return entryValidator(defName)(value) === true
}
