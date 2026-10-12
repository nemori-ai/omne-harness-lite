import { createRequire } from 'node:module'
import { schemaId, SCHEMA_DEF_NAMES } from './schema-inputs.ts'
export { schemaId, SCHEMA_DEF_NAMES }

export type SchemaDefName = (typeof SCHEMA_DEF_NAMES)[number]

const require = createRequire(new URL('../package.json', import.meta.url))
interface FixedValidator {
  (value: unknown): unknown
  readonly errors?: readonly { readonly instancePath: string; readonly message?: string }[] | null
}
function validatorFor(defName: SchemaDefName): FixedValidator {
  const generated = require('./generated/ordinary.cjs') as Record<string, FixedValidator>
  const fn = Object.hasOwn(generated, defName) ? generated[defName] : undefined
  if (fn === undefined) throw new Error(`schema definition not found: ${defName}`)
  return fn
}

export interface SchemaValidation {
  readonly valid: boolean
  readonly errors: readonly string[]
}

/**
 * 按 `$defs` 名校验交换表示（S-22 一类的形状校验）。
 * 通过只说明形状合规，不表示任何条款成立（S-33）。
 */
export function validate(defName: SchemaDefName, value: unknown): SchemaValidation {
  const fn = validatorFor(defName)
  const valid = fn(value) === true
  const errors = valid
    ? []
    : (fn.errors ?? []).map(e => `${e.instancePath} ${e.message ?? ''}`.trim())
  return { valid, errors }
}
