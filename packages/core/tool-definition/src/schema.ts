import schema from '@omne-harness-lite/tool-definition/schema' with { type: 'json' }
import contentSchema from '@omne-harness-lite/content-blocks/schema' with { type: 'json' }
import assetSchema from '@omne-harness-lite/asset-model/schema' with { type: 'json' }
import { Ajv2020 } from 'ajv/dist/2020.js'
import {
  validate as validateContent,
  isNonNegativeJsonInteger,
  isJsonNumber,
  jsonNumberSource,
} from '@omne-harness-lite/content-blocks'
import type { JsonValue } from '@omne-harness-lite/content-blocks'
import { copyJson, object, projection } from './json.ts'

export const schemaId = schema.$id
export const SCHEMA_DEF_NAMES = [
  'ToolDefinition',
  'SingleFunctionTool',
  'MultiCommandTool',
  'CommandDefinition',
  'ToolName',
  'ModelToolName',
  'ModelToolEntry',
  'ToolNeeds',
  'ToolSettings',
  'SettingDeclaration',
  'TargetEnvironment',
  'BindingLayer',
  'Facility',
  'Duration',
  'ExecutePermission',
  'ToolSource',
  'DependencyName',
  'ToolReturn',
  'ToolResult',
  'Offload',
  'JsonSchema',
] as const
export type SchemaDefName = (typeof SCHEMA_DEF_NAMES)[number]
const ajv = new Ajv2020({
  strict: true,
  strictTypes: false,
  strictRequired: false,
  ownProperties: true,
})
ajv.addSchema(contentSchema)
ajv.addSchema(assetSchema)
ajv.addSchema(schema)
const validators = SCHEMA_DEF_NAMES.map(name => {
  const validator = ajv.getSchema(`${schemaId}#/$defs/${name}`)
  if (validator === undefined) throw new Error(`missing Schema definition ${name}`)
  return { name, validator }
})
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
  const entry = validators.find(item => item.name === definition)
  if (entry === undefined) throw new TypeError(`unknown Schema definition ${definition}`)
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
  return Object.freeze({ valid: entry.validator(projection(copied)) === true && exact })
}
