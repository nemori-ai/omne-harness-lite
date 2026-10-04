import { createRequire } from 'node:module'
import type { Ajv2020, ValidateFunction } from 'ajv/dist/2020.js'
import type { SchemaDocument } from './schema-runtime.ts'
import { type JsonValue } from './json.ts'
import { exactSchema } from './exact-transform.ts'
import { createBuildCompiler } from './schema-compiler.ts'
import { copySchema, object, projection } from './schema-values.ts'
import { fixedMetaId, fixedMetaResources } from './meta-resources.ts'

export interface FixedDefinition {
  readonly name: string
  readonly schema: SchemaDocument
}
export interface FixedSchemaModuleInput {
  readonly resources: readonly SchemaDocument[]
  readonly definitions: readonly FixedDefinition[]
}

function metaCompiler(): { readonly ajv: Ajv2020; readonly validate: ValidateFunction } {
  const ajv = createBuildCompiler(true)
  for (const resource of fixedMetaResources) {
    const transformed = exactSchema(resource)
    if (!object(transformed)) throw new Error('standard meta-Schema is not an object')
    ajv.addMetaSchema(transformed)
  }
  const validate = ajv.getSchema(fixedMetaId)
  if (validate === undefined) throw new Error('standard meta-Schema is unavailable')
  return { ajv, validate }
}

function standaloneBound(ajv: Ajv2020, definitions: Readonly<Record<string, string>>): string {
  const { default: standalone } = createRequire(import.meta.url)(
    'ajv/dist/standalone/index.js',
  ) as typeof import('ajv/dist/standalone/index.js')
  return (
    '"use strict";\nexports = module.exports = Object.create(null);\n' +
    standalone(ajv, definitions) +
    `\nconst boundRuntime = require("@omne-harness-lite/content-blocks/code-runtime");\nfor (const name of Object.keys(exports)) {\n  const raw = exports[name];\n  exports[name] = text => boundRuntime.validateExact(raw, text);\n}\n`
  )
}

/** Compile every definition before returning any output; no filesystem effects. */
export function generateSchemaModule(input: FixedSchemaModuleInput): string {
  const meta = metaCompiler().validate
  const ajv = createBuildCompiler()
  function checked(schema: SchemaDocument): JsonValue {
    const original = copySchema(schema)
    if (meta.call({ root: original }, projection(original)) !== true)
      throw new TypeError('Schema fails Draft 2020-12 meta-validation')
    return original
  }
  for (const resource of input.resources) {
    const original = copySchema(resource)
    if (!object(original) || typeof original.$id !== 'string')
      throw new TypeError('Schema resource needs a fixed $id')
    if (meta.call({ root: original }, projection(original)) !== true)
      throw new TypeError('invalid Schema resource')
    const transformed = projection(exactSchema(original))
    if (!object(transformed)) throw new Error('Schema resource projection is not an object')
    ajv.addSchema(transformed)
  }
  const names: Record<string, string> = Object.create(null) as Record<string, string>
  for (const definition of input.definitions) {
    if (definition.name.length === 0 || Object.hasOwn(names, definition.name))
      throw new TypeError('fixed Schema export names must be non-empty and unique')
    const transformed = projection(exactSchema(checked(definition.schema)))
    if (typeof transformed !== 'boolean' && !object(transformed))
      throw new Error('Schema projection is invalid')
    const compiled = ajv.compile(transformed)
    if ('$async' in compiled && compiled.$async === true)
      throw new TypeError('asynchronous Schemas are outside this runtime')
    // Compile first to retain the original anonymous base/error paths. The key only
    // lets standalone retrieve the already compiled object; it changes no $id.
    const key = `urn:omne:fixed-definition:${encodeURIComponent(definition.name)}`
    ajv.addSchema(transformed, key)
    names[definition.name] = key
  }
  return standaloneBound(ajv, names)
}

/** Standard meta bootstrap uses the original eight resources, never old generated output. */
export function generateMetaModule(): string {
  const { ajv } = metaCompiler()
  return standaloneBound(ajv, { Meta: fixedMetaId })
}
