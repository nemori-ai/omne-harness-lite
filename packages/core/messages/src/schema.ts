import { createRequire } from 'node:module'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { snapshot } from './json.ts'
import { schemaId, SCHEMA_DEF_NAMES } from './schema-inputs.ts'
export { schemaId, SCHEMA_DEF_NAMES }

export type SchemaDefName = (typeof SCHEMA_DEF_NAMES)[number]
export interface SchemaValidation {
  readonly valid: boolean
}
const require = createRequire(new URL('../package.json', import.meta.url))
interface FixedValidation {
  readonly valid: boolean
}
/** Shape only; the judge functions additionally implement contract cross-member predicates. */
export function validate(defName: SchemaDefName, value: unknown): SchemaValidation {
  const name = SCHEMA_DEF_NAMES.find(item => item === defName)
  if (name === undefined) throw new TypeError(`unknown messages Schema definition: ${defName}`)
  const copied = snapshot(value)
  if (copied === undefined) return Object.freeze({ valid: false })
  const generated = require('./generated/exact.cjs') as Record<
    SchemaDefName,
    (text: string) => FixedValidation
  >
  return Object.freeze({ valid: generated[name](writeJsonLossless(copied)).valid })
}
