import { createSchemaRuntime } from '@omne-harness-lite/content-blocks/schema-runtime'
import type {
  SchemaDocument,
  SchemaRuntime,
} from '@omne-harness-lite/content-blocks/schema-runtime'
import { writeJsonLossless, type JsonValue } from '@omne-harness-lite/content-blocks'
import { createRequire } from 'node:module'
import {
  schema,
  previousSchema,
  resources,
  previousResources,
  SCHEMA_DEF_NAMES,
} from './schema-inputs.ts'
export { SCHEMA_DEF_NAMES }
const require = createRequire(new URL('../package.json', import.meta.url))
import { copyJson, object } from './json.ts'

export type SchemaDefName = (typeof SCHEMA_DEF_NAMES)[number]
export interface SkillSchemaBinding {
  readonly schema: SchemaDocument
  readonly schemaId: string
  readonly createRuntime: () => SchemaRuntime
  readonly validate: (definition: SchemaDefName, input: unknown) => { readonly valid: boolean }
}
function bind(version: 2 | 3): SkillSchemaBinding {
  const resource = version === 2 ? previousSchema : schema
  const ownedResources = version === 2 ? previousResources : resources
  const createRuntime = () => createSchemaRuntime(ownedResources)
  const captured = copyJson(resource)
  if (!object(captured)) throw new Error('Skill Schema is not an object')
  return Object.freeze({
    schema: captured,
    schemaId: resource.$id,
    createRuntime,
    validate(definition: SchemaDefName, input: unknown) {
      const name = SCHEMA_DEF_NAMES.find(item => item === definition)
      if (name === undefined) throw new TypeError(`unknown Skill Schema definition ${definition}`)
      const value = copyJson(input)
      if (value === undefined) return Object.freeze({ valid: false })
      const generated = require(
        version === 2 ? './generated/previous.cjs' : './generated/exact.cjs',
      ) as Record<SchemaDefName, (text: string) => { readonly valid: boolean }>
      return Object.freeze({ valid: generated[name](writeJsonLossless(value)).valid })
    },
  })
}
export const skillSchemaBinding = bind(3)
export const skillV2SchemaBinding = bind(2)
export const schemaId = skillSchemaBinding.schemaId
export const validate = skillSchemaBinding.validate
export function numericOne(value: JsonValue): boolean {
  const generated = require('./generated/numeric-one.cjs') as {
    NumericOne(text: string): { readonly valid: boolean }
  }
  return generated.NumericOne(writeJsonLossless(value)).valid
}
export function schemaDocument(value: JsonValue | undefined): value is SchemaDocument {
  return typeof value === 'boolean' || object(value)
}
