import { createRequire } from 'node:module'
import { copyJsonValue, isNonNegativeJsonInteger, LosslessNumber, type JsonValue } from './json.ts'
import { schemaId, SCHEMA_DEF_NAMES } from './schema-inputs.ts'
export { schemaId, SCHEMA_DEF_NAMES }

export type SchemaDefName = (typeof SCHEMA_DEF_NAMES)[number]

const require = createRequire(new URL('../package.json', import.meta.url))
interface FixedValidator {
  (value: unknown): unknown
}
export interface SchemaValidation {
  readonly valid: boolean
}

/** Schema only; cross-member constraints and rejection precedence belong to judgeContentBlock. */
export function validate(defName: SchemaDefName, value: unknown): SchemaValidation {
  const copied = copyJsonValue(value)
  if ('failed' in copied) return Object.freeze({ valid: false })
  const projected = schemaProjection(copied.ok)
  const name = SCHEMA_DEF_NAMES.find(item => item === defName)
  if (name === undefined) throw new Error(`unknown Schema definition: ${defName}`)
  const generated = require('./generated/ordinary.cjs') as Record<SchemaDefName, FixedValidator>
  const valid = generated[name](projected) === true && exactBytes(defName, copied.ok)
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
