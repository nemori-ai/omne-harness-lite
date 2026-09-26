import schema from '@omne-harness-lite/slash-command/schema' with { type: 'json' }
import assetSchema from '@omne-harness-lite/asset-model/schema/v2' with { type: 'json' }
import contentSchema from '@omne-harness-lite/content-blocks/schema/v2' with { type: 'json' }
import { createSchemaRuntime } from '@omne-harness-lite/content-blocks/schema-runtime'
import { snapshot } from './json.ts'

export const schemaId = schema.$id
export const SCHEMA_DEF_NAMES = Object.freeze([
  'CommandName',
  'ServiceName',
  'CommandBinding',
  'ParameterDeclaration',
  'SlashCommandDefinition',
  'Span',
  'CommandInvocation',
  'Recognition',
  'ParseResult',
] as const)
export type SchemaDefName = (typeof SCHEMA_DEF_NAMES)[number]
export interface SchemaValidation {
  readonly valid: boolean
}
// Fixed owned Schema graph, no author Schema cache or remote loader.
const runtime = createSchemaRuntime([contentSchema, assetSchema, schema])
const validators = SCHEMA_DEF_NAMES.map(name =>
  Object.freeze({ name, validator: runtime.compile({ $ref: `${schemaId}#/$defs/${name}` }) }),
)
export function validate(definition: SchemaDefName, value: unknown): SchemaValidation {
  const entry = validators.find(item => item.name === definition)
  if (entry === undefined)
    throw new TypeError(`unknown slash-command Schema definition: ${definition}`)
  const copied = snapshot(value)
  return Object.freeze({ valid: copied !== undefined && entry.validator.validate(copied) })
}
