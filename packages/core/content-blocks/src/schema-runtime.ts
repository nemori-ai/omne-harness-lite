import { Ajv2020 } from 'ajv/dist/2020.js'
import type { RegExpEngine } from 'ajv/dist/types/index.js'
import {
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
  type JsonValue,
  type JsonObject,
} from './json.ts'
import { createExactMetaValidator, exactSchema, installExactKeywords } from './exact-schema.ts'

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
function object(value: unknown): value is JsonObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !LosslessNumber.is(value)
  )
}
function copy(value: JsonValue): JsonValue {
  const result = readJsonStrict(writeJsonLossless(value))
  if ('failed' in result) throw new Error('lossless writer produced invalid JSON')
  return result.ok
}
function copySchema(schema: SchemaDocument): SchemaDocument {
  const result = copy(schema)
  if (typeof result !== 'boolean' && !object(result))
    throw new TypeError('Schema must be an object or boolean')
  return result
}
function projection(value: JsonValue): JsonValue {
  if (LosslessNumber.is(value)) {
    const numeric = Number(value.source)
    return Number.isFinite(numeric)
      ? numeric
      : value.source.startsWith('-')
        ? -Number.MAX_VALUE
        : Number.MAX_VALUE
  }
  if (Array.isArray(value)) return value.map(projection)
  if (object(value))
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, projection(item)]))
  return value
}
/** One caller-owned compiler; no remote loading, async schemas or module-level author cache. */
export function createSchemaRuntime(
  resources: readonly SchemaDocument[],
  options?: SchemaRuntimeOptions,
): SchemaRuntime {
  const metaValidator = createExactMetaValidator()
  const factory = options?.patternFactory
  const engine: RegExpEngine = Object.assign(
    (source: string): RegExp => {
      const expression = factory === undefined ? new RegExp(source, 'u') : factory(source)
      if (!(expression instanceof RegExp) || expression.global || expression.sticky)
        throw new TypeError('pattern factory must return a native, non-global, non-sticky RegExp')
      return expression
    },
    { code: 'schemaRuntimePatternFactory' },
  )
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
  function metaValidate(schema: SchemaDocument): boolean {
    const original = copySchema(schema)
    return metaValidator(original, projection(original))
  }
  for (const resource of resources) {
    const original = copySchema(resource)
    if (!object(original) || typeof original.$id !== 'string')
      throw new TypeError('Schema resource needs a fixed $id')
    if (!metaValidator(original, projection(original)))
      throw new TypeError('invalid Schema resource')
    const transformed = projection(exactSchema(original))
    if (!object(transformed)) throw new Error('Schema resource projection is not an object')
    ajv.addSchema(transformed)
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
