import { createRequire } from 'node:module'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { snapshot } from './json.ts'
import { schemaId, SCHEMA_DEF_NAMES, type SchemaDefName } from './schema-inputs.ts'
export { schemaId, SCHEMA_DEF_NAMES, type SchemaDefName }
const require = createRequire(new URL('../package.json', import.meta.url))
export function validate(definition: SchemaDefName, value: unknown): { readonly valid: boolean } {
  const name = SCHEMA_DEF_NAMES.find(item => item === definition)
  if (name === undefined) throw new TypeError(`unknown loop Schema definition: ${definition}`)
  const copied = snapshot(value)
  if (copied === undefined) return Object.freeze({ valid: false })
  const generated = require('./generated/exact.cjs') as Record<
    SchemaDefName,
    (text: string) => { readonly valid: boolean }
  >
  return Object.freeze({ valid: generated[name](writeJsonLossless(copied)).valid })
}
export function ordinaryShape(definition: SchemaDefName, value: unknown): boolean {
  const name = SCHEMA_DEF_NAMES.find(item => item === definition)
  if (name === undefined) throw new TypeError(`unknown loop Schema definition: ${definition}`)
  const copied = snapshot(value)
  if (copied === undefined) return false
  const generated = require('./generated/early.cjs') as Record<
    SchemaDefName,
    (text: string) => { readonly valid: boolean }
  >
  return generated[name](writeJsonLossless(copied)).valid
}
