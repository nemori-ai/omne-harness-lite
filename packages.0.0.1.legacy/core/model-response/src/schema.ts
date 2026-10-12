import { createRequire } from 'node:module'
import { writeJsonLossless, type JsonValue } from '@omne-harness-lite/content-blocks'
import { snapshot } from './json.ts'
import { schemaId, SCHEMA_DEF_NAMES, normativeSchemaResources } from './schema-inputs.ts'
export { schemaId, SCHEMA_DEF_NAMES, normativeSchemaResources }
const require = createRequire(new URL('../package.json', import.meta.url))
function fixedValid(
  name: SchemaDefName | 'ResponseMembers' | 'PendingResponseMembers',
  value: JsonValue,
): boolean {
  const generated = require('./generated/exact.cjs') as Record<
    SchemaDefName | 'ResponseMembers' | 'PendingResponseMembers',
    (text: string) => { readonly valid: boolean }
  >
  return generated[name](writeJsonLossless(value)).valid
}
export type SchemaDefName = (typeof SCHEMA_DEF_NAMES)[number]
export interface SchemaValidation {
  readonly valid: boolean
}

/** Full frozen shape, including all conditional constraints. Not an ordered rejection API. */
export function validate(defName: SchemaDefName, value: unknown): SchemaValidation {
  const name = SCHEMA_DEF_NAMES.find(item => item === defName)
  if (name === undefined)
    throw new TypeError(`unknown model-response Schema definition: ${defName}`)
  const copied = snapshot(value)
  return Object.freeze({ valid: copied !== undefined && fixedValid(name, copied) })
}
export function membersValid(value: JsonValue): boolean {
  return fixedValid('ResponseMembers', value)
}
export function pendingMembersValid(value: JsonValue): boolean {
  return fixedValid('PendingResponseMembers', value)
}
export function responseValid(value: JsonValue): boolean {
  return fixedValid('ModelResponse', value)
}
export function pendingResponseValid(value: JsonValue): boolean {
  return fixedValid('PendingModelResponse', value)
}
