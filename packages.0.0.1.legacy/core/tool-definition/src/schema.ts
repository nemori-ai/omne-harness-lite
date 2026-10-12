import { createRequire } from 'node:module'
import { schemaId, SCHEMA_DEF_NAMES } from './schema-inputs.ts'
export { schemaId, SCHEMA_DEF_NAMES }
import {
  validate as validateContent,
  isNonNegativeJsonInteger,
  isJsonNumber,
  jsonNumberSource,
} from '@omne-harness-lite/content-blocks'
import type { JsonValue } from '@omne-harness-lite/content-blocks'
import { copyJson, object, projection } from './json.ts'

export type SchemaDefName = (typeof SCHEMA_DEF_NAMES)[number]
const require = createRequire(new URL('../package.json', import.meta.url))
export function positiveInteger(value: unknown): boolean {
  return (
    isNonNegativeJsonInteger(value) &&
    isJsonNumber(value) &&
    !/^-?0(?:[.]0+)?(?:[eE][+-]?[0-9]+)?$/u.test(jsonNumberSource(value))
  )
}
function exactSettings(value: JsonValue): boolean {
  return (
    !object(value) ||
    !object(value.concurrency) ||
    !Object.hasOwn(value.concurrency, 'default') ||
    positiveInteger(value.concurrency.default)
  )
}
function exactReturn(value: JsonValue): boolean {
  if (!object(value)) return true
  if (
    Array.isArray(value.content) &&
    !value.content.every(block => validateContent('ContentBlock', block).valid)
  )
    return false
  if (
    Array.isArray(value.attachments) &&
    !value.attachments.every(item => validateContent('AttachmentRef', item).valid)
  )
    return false
  if (object(value.offload)) {
    if (
      Array.isArray(value.offload.summary) &&
      !value.offload.summary.every(block => validateContent('ContentBlock', block).valid)
    )
      return false
    if (
      object(value.offload.raw) &&
      !Object.hasOwn(value.offload.raw, 'inline') &&
      !validateContent('AttachmentRef', value.offload.raw).valid
    )
      return false
  }
  return true
}
export function validate(definition: SchemaDefName, value: unknown): { readonly valid: boolean } {
  const copied = copyJson(value)
  if (copied === undefined) return Object.freeze({ valid: false })
  const name = SCHEMA_DEF_NAMES.find(item => item === definition)
  if (name === undefined) throw new TypeError(`unknown Schema definition ${definition}`)
  let exact = true
  if (definition === 'ToolSettings') exact = exactSettings(copied)
  if (
    ['ToolDefinition', 'SingleFunctionTool', 'MultiCommandTool'].includes(definition) &&
    object(copied) &&
    copied.settings !== undefined
  )
    exact = exactSettings(copied.settings)
  if (['ToolReturn', 'ToolResult'].includes(definition)) exact = exactReturn(copied)
  if (definition === 'Offload') exact = exactReturn({ content: [], offload: copied })
  const validators = require('./generated/ordinary.cjs') as Record<
    SchemaDefName,
    (value: unknown) => boolean
  >
  return Object.freeze({ valid: validators[name](projection(copied)) === true && exact })
}
