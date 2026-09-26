import schema from '@omne-harness-lite/arrival-events/schema' with { type: 'json' }
import contentSchema from '@omne-harness-lite/content-blocks/schema/v2' with { type: 'json' }
import accountsSchema from '@omne-harness-lite/call-accounts/schema' with { type: 'json' }
import loopSchema from '@omne-harness-lite/loop-extension/schema/v2' with { type: 'json' }
import { createSchemaRuntime } from '@omne-harness-lite/content-blocks/schema-runtime'
import { snapshot } from './json.ts'

export const schemaId = schema.$id
export const SCHEMA_DEF_NAMES = Object.freeze([
  'ArrivalEnvelope',
  'ArrivalTarget',
  'ArrivalEvent',
  'OpenEvent',
  'FillEvent',
  'CloseEvent',
  'TrimEvent',
  'AccountEvent',
  'FinishEvent',
  'BlockKind',
  'FillMode',
  'BlockHead',
  'PresentationHint',
  'FinishReason',
] as const)
export type SchemaDefName = (typeof SCHEMA_DEF_NAMES)[number]
export interface SchemaValidation {
  readonly valid: boolean
}
// The owned graph compiles only the adopted definitions; no caller-schema cache or lookup.
const runtime = createSchemaRuntime([contentSchema, accountsSchema, loopSchema, schema])
const validators = SCHEMA_DEF_NAMES.map(name =>
  Object.freeze({ name, validator: runtime.compile({ $ref: `${schemaId}#/$defs/${name}` }) }),
)
/** Shape only: history-dependent and cross-member judgments are a separate boundary. */
export function validate(defName: SchemaDefName, value: unknown): SchemaValidation {
  const entry = validators.find(item => item.name === defName)
  if (entry === undefined) throw new TypeError(`unknown arrival Schema definition: ${defName}`)
  const copied = snapshot(value)
  return Object.freeze({ valid: copied !== undefined && entry.validator.validate(copied) })
}
