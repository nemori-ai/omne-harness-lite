import { createRequire } from 'node:module'
import type { Ajv2020 as Ajv2020Type } from 'ajv/dist/2020.js'
import type { RegExpEngine } from 'ajv/dist/types/index.js'
import type { JsonValue, JsonObject } from './json.ts'
import { object, copy, copySchema, projection } from './schema-values.ts'
import { createExactMetaValidator, exactSchema, installExactKeywords } from './exact-schema.ts'
import { schemaPattern } from './schema-pattern.ts'

export type SchemaDocument = boolean | JsonObject
export interface SchemaRuntimeOptions {
  /** Deterministic, effect-free factory; only native, non-global, non-sticky expressions. */
  readonly patternFactory?: (source: string) => RegExp
}
export interface SchemaValidator {
  readonly validate: (value: JsonValue) => boolean
}
export interface SchemaRuntime {
  readonly metaValidate: (schema: SchemaDocument) => boolean
  readonly compile: (schema: SchemaDocument) => SchemaValidator
}
/** Snapshot and prepare fixed resources once; each call owns a fresh author compiler. */
export function createSchemaRuntimeFactory(
  resources: readonly SchemaDocument[],
  options?: SchemaRuntimeOptions,
): () => SchemaRuntime {
  const metaValidator = createExactMetaValidator()
  const patternFactory = options?.patternFactory
  const probe = createCompiler(patternFactory)
  const prepared: JsonObject[] = []
  for (const resource of resources) {
    const transformed = prepareResource(resource, metaValidator)
    probe.addSchema(structuredClone(transformed))
    prepared.push(transformed)
  }
  return () => {
    const ajv = createCompiler(patternFactory)
    for (const resource of prepared) ajv.addSchema(structuredClone(resource))
    return bindRuntime(ajv, metaValidator)
  }
}
/** One caller-owned compiler; no remote loading, async schemas or module-level author cache. */
export function createSchemaRuntime(
  resources: readonly SchemaDocument[],
  options?: SchemaRuntimeOptions,
): SchemaRuntime {
  const metaValidator = createExactMetaValidator()
  const factory = options?.patternFactory
  const ajv = createCompiler(factory)
  for (const resource of resources) ajv.addSchema(prepareResource(resource, metaValidator))
  return bindRuntime(ajv, metaValidator)
}

function createCompiler(factory: SchemaRuntimeOptions['patternFactory']): Ajv2020Type {
  const engine: RegExpEngine = Object.assign(
    (source: string) => {
      if (factory === undefined) return schemaPattern(source, 'u')
      const expression = factory(source)
      if (!(expression instanceof RegExp) || expression.global || expression.sticky)
        throw new TypeError('pattern factory must return a native, non-global, non-sticky RegExp')
      return expression
    },
    { code: 'schemaRuntimePatternFactory' },
  )
  const { Ajv2020 } = createRequire(import.meta.url)('ajv/dist/2020.js') as {
    Ajv2020: typeof Ajv2020Type
  }
  const ajv = new Ajv2020({
    strict: false,
    allErrors: false,
    ownProperties: true,
    validateFormats: false,
    validateSchema: false,
    passContext: true,
    code: { regExp: engine },
  })
  installExactKeywords(ajv)
  return ajv
}

function prepareResource(
  resource: SchemaDocument,
  metaValidator: ReturnType<typeof createExactMetaValidator>,
): JsonObject {
  const original = copySchema(resource)
  if (!object(original) || typeof original.$id !== 'string')
    throw new TypeError('Schema resource needs a fixed $id')
  if (!metaValidator(original, projection(original))) throw new TypeError('invalid Schema resource')
  const transformed = projection(exactSchema(original))
  if (!object(transformed)) throw new Error('Schema resource projection is not an object')
  return transformed
}

function bindRuntime(
  ajv: Ajv2020Type,
  metaValidator: ReturnType<typeof createExactMetaValidator>,
): SchemaRuntime {
  function metaValidate(schema: SchemaDocument): boolean {
    const original = copySchema(schema)
    return metaValidator(original, projection(original))
  }
  function compile(schema: SchemaDocument): SchemaValidator {
    const originalSchema = copySchema(schema)
    if (!metaValidator(originalSchema, projection(originalSchema)))
      throw new TypeError('Schema fails Draft 2020-12 meta-validation')
    const transformed = projection(exactSchema(originalSchema))
    if (typeof transformed !== 'boolean' && !object(transformed))
      throw new Error('Schema projection is invalid')
    const compiled = ajv.compile(transformed)
    if ('$async' in compiled && compiled.$async === true)
      throw new TypeError('asynchronous Schemas are outside this runtime')
    return Object.freeze({
      validate(value: JsonValue): boolean {
        const original = copy(value)
        return compiled.call({ root: original }, projection(original)) === true
      },
    })
  }
  return Object.freeze({ metaValidate, compile })
}
