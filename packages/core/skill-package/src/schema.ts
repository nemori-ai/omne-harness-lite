import schema from '@omne-harness-lite/skill-package/schema' with { type: 'json' }
import previousSchema from '@omne-harness-lite/skill-package/schema/v2' with { type: 'json' }
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

export const SCHEMA_DEF_NAMES = [
  'SkillName',
  'SkillManifest',
  'ResourceEntry',
  'SkillDefinitionRecord',
  'SkillPackage',
] as const
export type SchemaDefName = (typeof SCHEMA_DEF_NAMES)[number]
export interface SkillSchemaBinding {
  readonly schema: SchemaDocument
  readonly schemaId: string
  readonly createRuntime: () => SchemaRuntime
  readonly validate: (definition: SchemaDefName, input: unknown) => { readonly valid: boolean }
}
function bind(version: 2 | 3): SkillSchemaBinding {
  const resource = version === 2 ? previousSchema : schema
  const resources = [contentSchema, assetSchema, toolSchema, previousSchema]
  if (version === 3) resources.push(schema)
  const createRuntime = () => createSchemaRuntime(resources)
  const runtime = createRuntime()
  const validators = new Map<SchemaDefName, SchemaValidator>(
    SCHEMA_DEF_NAMES.map(name => [
      name,
      runtime.compile({ $ref: `${resource.$id}#/$defs/${name}` }),
    ]),
  )
  const captured = copyJson(resource)
  if (!object(captured)) throw new Error('Skill Schema is not an object')
  return Object.freeze({
    schema: captured,
    schemaId: resource.$id,
    createRuntime,
    validate(definition: SchemaDefName, input: unknown) {
      const validator = validators.get(definition)
      if (validator === undefined)
        throw new TypeError(`unknown Skill Schema definition ${definition}`)
      const value = copyJson(input)
      return Object.freeze({ valid: value !== undefined && validator.validate(value) })
    },
  })
}
export const skillSchemaBinding = bind(3)
export const skillV2SchemaBinding = bind(2)
export const schemaId = skillSchemaBinding.schemaId
export const validate = skillSchemaBinding.validate
const one = skillSchemaBinding.createRuntime().compile({ const: 1 })
export function numericOne(value: JsonValue): boolean {
  return one.validate(value)
}
export function schemaDocument(value: JsonValue | undefined): value is SchemaDocument {
  return typeof value === 'boolean' || object(value)
}
