import { createRequire } from 'node:module'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { schemaId, SCHEMA_DEF_NAMES } from './schema-inputs.ts'
export { schemaId, SCHEMA_DEF_NAMES }
import { jsonValue } from './json.ts'

export type SchemaDefName = (typeof SCHEMA_DEF_NAMES)[number]

const require = createRequire(new URL('../package.json', import.meta.url))
export function validate(definition: SchemaDefName, value: unknown): { readonly valid: boolean } {
  const name = SCHEMA_DEF_NAMES.find(item => item === definition)
  if (name === undefined) throw new TypeError(`unknown MCP Schema definition ${definition}`)
  const data = jsonValue(value)
  if (data === undefined) return Object.freeze({ valid: false })
  const generated = require('./generated/exact.cjs') as Record<
    SchemaDefName,
    (text: string) => { readonly valid: boolean }
  >
  return Object.freeze({ valid: generated[name](writeJsonLossless(data)).valid })
}
