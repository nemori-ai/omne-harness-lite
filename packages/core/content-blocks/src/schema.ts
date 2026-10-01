import schema from '@omne-harness-lite/content-blocks/schema' with { type: 'json' }
import { Ajv2020 } from 'ajv/dist/2020.js'
import { copyJsonValue, isNonNegativeJsonInteger, LosslessNumber, type JsonValue } from './json.ts'
import { schemaPattern } from './schema-pattern.ts'

export const schemaId = schema.$id
export const SCHEMA_DEF_NAMES = [
  'ContentBlock',
  'BlockBase',
  'TextBlock',
  'ThinkingBlock',
  'VoiceBlock',
  'ImageBlock',
  'FileBlock',
  'ToolCallBlock',
  'IncompleteToolCallBlock',
  'ToolResultBlock',
  'Visibility',
  'DerivedRendering',
  'AttachmentRef',
  'InlineBytes',
  'MediaType',
  'Modality',
  'ExecutionOutcome',
  'PlaceholderReason',
  'BlockId',
  'CallId',
  'CapabilityId',
  'ModelToolName',
] as const
export type SchemaDefName = (typeof SCHEMA_DEF_NAMES)[number]

// Fixed owned Schema only; no caller schemas or mutable root validation cache.
const ajv = new Ajv2020({
  strict: true,
  strictTypes: false,
  strictRequired: false,
  allErrors: false,
  ownProperties: true,
  code: { regExp: schemaPattern },
})
ajv.addSchema({ ...schema, $id: schemaId })
const validators = Object.freeze(
  SCHEMA_DEF_NAMES.map(name => {
    const validator = ajv.getSchema(`${schemaId}#/$defs/${name}`)
    if (validator === undefined) throw new Error(`missing Schema definition: ${name}`)
    return Object.freeze({ name, validator })
  }),
)

export interface SchemaValidation {
  readonly valid: boolean
}

/** Schema only; cross-member constraints and rejection precedence belong to judgeContentBlock. */
export function validate(defName: SchemaDefName, value: unknown): SchemaValidation {
  const copied = copyJsonValue(value)
  if ('failed' in copied) return Object.freeze({ valid: false })
  const projected = schemaProjection(copied.ok)
  const entry = validators.find(item => item.name === defName)
  if (entry === undefined) throw new Error(`unknown Schema definition: ${defName}`)
  const valid = entry.validator(projected) === true && exactBytes(defName, copied.ok)
  return Object.freeze({ valid })
}

function schemaProjection(value: JsonValue): unknown {
  // The only Schema-constrained numeric member is AttachmentRef.bytes (integer >= 0).
  // Its original number is checked exactly below. This view changes no caller data.
  if (LosslessNumber.is(value)) return 0
  if (Array.isArray(value)) return value.map(schemaProjection)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, schemaProjection(item)]),
    )
  }
  return value
}

function exactBytes(defName: SchemaDefName, value: JsonValue): boolean {
  if (defName === 'AttachmentRef') return attachmentBytes(value)
  if (defName === 'DerivedRendering') {
    return (
      isObject(value) &&
      (!Array.isArray(value.blocks) || value.blocks.every(item => exactBytes('ContentBlock', item)))
    )
  }
  if (
    [
      'ContentBlock',
      'BlockBase',
      'TextBlock',
      'ThinkingBlock',
      'VoiceBlock',
      'ImageBlock',
      'FileBlock',
      'ToolCallBlock',
      'IncompleteToolCallBlock',
      'ToolResultBlock',
    ].includes(defName)
  ) {
    if (!isObject(value)) return true
    if ((value.kind === 'voice' || value.kind === 'image') && !attachmentBytes(value.data))
      return false
    if (value.kind === 'file' && !attachmentBytes(value.attachment)) return false
    if (value.kind === 'tool_result') {
      if (!attachmentBytes(value.offloaded)) return false
      if (
        Array.isArray(value.blocks) &&
        !value.blocks.every(item => exactBytes('ContentBlock', item))
      )
        return false
    }
    if (
      Array.isArray(value.renderings) &&
      !value.renderings.every(item => exactBytes('DerivedRendering', item))
    )
      return false
  }
  return true
}
function attachmentBytes(value: JsonValue | undefined): boolean {
  return !isObject(value) || !Object.hasOwn(value, 'bytes') || isNonNegativeJsonInteger(value.bytes)
}
export function isObject(value: unknown): value is Record<string, JsonValue> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !LosslessNumber.is(value)
  )
}
