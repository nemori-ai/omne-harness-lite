import type { ErrorObject } from 'ajv/dist/2020.js'
import { readJsonStrict } from './json.ts'
import { projection } from './schema-values.ts'
export { exactKeywords } from './exact-keywords.ts'
export { schemaPattern } from './schema-pattern.ts'

export interface ExactValidation {
  readonly valid: boolean
  readonly errors: readonly ErrorObject[] | null
}
export interface ExactCompiledValidator {
  (this: unknown, value: unknown): unknown
  readonly errors?: readonly ErrorObject[] | null
}
/** The generated module binds this receiver and its keyword refs in one native instance. */
export function validateExact(
  validator: ExactCompiledValidator,
  losslessText: string,
): ExactValidation {
  const parsed = readJsonStrict(losslessText)
  if ('failed' in parsed) throw new Error('invalid lossless Schema handoff')
  const valid = validator.call({ root: parsed.ok }, projection(parsed.ok)) === true
  return Object.freeze({ valid, errors: structuredClone(validator.errors ?? null) })
}
