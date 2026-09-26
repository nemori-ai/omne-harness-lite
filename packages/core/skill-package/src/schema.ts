import schema from '@omne-harness-lite/skill-package/schema' with { type: 'json' }
import contentSchema from '@omne-harness-lite/content-blocks/schema/v2' with { type: 'json' }
import assetSchema from '@omne-harness-lite/asset-model/schema/v2' with { type: 'json' }
import toolSchema from '@omne-harness-lite/tool-definition/schema/v2' with { type: 'json' }
import { createSchemaRuntime } from '@omne-harness-lite/content-blocks/schema-runtime'
import type {
  SchemaDocument,
  SchemaRuntime,
  SchemaValidator,
} from '@omne-harness-lite/content-blocks/schema-runtime'
import type { JsonValue } from '@omne-harness-lite/content-blocks'
import { copyJson, object } from './json.ts'

export const schemaId = schema.$id
export const SCHEMA_DEF_NAMES = [
  'SkillName',
  'SkillManifest',
  'ResourceEntry',
  'SkillDefinitionRecord',
  'SkillPackage',
] as const
export type SchemaDefName = (typeof SCHEMA_DEF_NAMES)[number]
export function createSkillSchemaRuntime(): SchemaRuntime {
  return createSchemaRuntime([contentSchema, assetSchema, toolSchema, schema])
}
const runtime = createSkillSchemaRuntime()
const validators = new Map<SchemaDefName, SchemaValidator>(
  SCHEMA_DEF_NAMES.map(name => [name, runtime.compile({ $ref: `${schemaId}#/$defs/${name}` })]),
)
const one = runtime.compile({ const: 1 })
export function numericOne(value: JsonValue): boolean {
  return one.validate(value)
}
export function validate(definition: SchemaDefName, input: unknown): { readonly valid: boolean } {
  const validator = validators.get(definition)
  if (validator === undefined) throw new TypeError(`unknown Skill Schema definition ${definition}`)
  const value = copyJson(input)
  return Object.freeze({ valid: value !== undefined && validator.validate(value) })
}
export function schemaDocument(value: JsonValue | undefined): value is SchemaDocument {
  return typeof value === 'boolean' || object(value)
}
