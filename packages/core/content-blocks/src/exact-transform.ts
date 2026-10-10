import {
  isJsonNumber,
  jsonNumberSource,
  LosslessNumber,
  writeJsonLossless,
  type JsonValue,
  type JsonObject,
} from './json.ts'

function object(value: unknown): value is JsonObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !LosslessNumber.is(value)
  )
}
function containsNumber(value: JsonValue): boolean {
  return (
    isJsonNumber(value) ||
    (Array.isArray(value) && value.some(containsNumber)) ||
    (object(value) && Object.values(value).some(containsNumber))
  )
}
const singleSchemas = new Set([
  'additionalProperties',
  'unevaluatedProperties',
  'propertyNames',
  'items',
  'contains',
  'unevaluatedItems',
  'not',
  'if',
  'then',
  'else',
])
const mapSchemas = new Set([
  '$defs',
  'definitions',
  'properties',
  'patternProperties',
  'dependentSchemas',
])
const listSchemas = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems'])
const privateKeywords = new Set([
  'exact_minimum',
  'exact_maximum',
  'exact_exclusiveMinimum',
  'exact_exclusiveMaximum',
  'exact_multipleOf',
  'exact_integer',
  'exact_type',
  'exact_const',
  'exact_enum',
  'exact_uniqueItems',
  'exact_minLength',
  'exact_maxLength',
  'exact_minItems',
  'exact_maxItems',
  'exact_minProperties',
  'exact_maxProperties',
])
const nonDraftExtensions = new Set([
  '$async',
  'nullable',
  'id',
  '$recursiveAnchor',
  '$recursiveRef',
  'dependencies',
])
type SchemaEntries = [string, JsonValue][]
const exactNumericKeywords = new Set([
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'minProperties',
  'maxProperties',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
])
function numericKeyword(key: string, value: JsonValue): SchemaEntries | undefined {
  if (exactNumericKeywords.has(key) && isJsonNumber(value))
    return [[`exact_${key}`, writeJsonLossless(value)]]
  if (
    (key === 'minContains' || key === 'maxContains') &&
    isJsonNumber(value) &&
    !Number.isSafeInteger(Number(jsonNumberSource(value)))
  )
    // Actual JS arrays have length < 2^32. Matching elements cannot exceed
    // that length, so both comparisons retain their truth value at this
    // boundary. Original/meta Schema values remain untouched.
    return [[key, Number.MAX_SAFE_INTEGER]]
  return undefined
}
function literalKeyword(key: string, value: JsonValue): SchemaEntries | undefined {
  if ((key === 'const' || key === 'enum') && containsNumber(value))
    return [[`exact_${key}`, writeJsonLossless(value)]]
  if (key === 'uniqueItems' && value === true) return [['exact_uniqueItems', true]]
  return undefined
}
function typeKeyword(key: string, value: JsonValue): SchemaEntries | undefined {
  if (key !== 'type') return undefined
  if (Array.isArray(value) && value.includes('integer'))
    return [['exact_type', writeJsonLossless(value)]]
  if (value === 'integer')
    return [
      ['type', 'number'],
      ['exact_integer', true],
    ]
  return undefined
}
function childSchema(key: string, value: JsonValue): SchemaEntries {
  if (singleSchemas.has(key)) return [[key, exactSchema(value)]]
  if (mapSchemas.has(key) && object(value))
    return [
      [
        key,
        Object.fromEntries(
          Object.entries(value).map(([name, child]) => [name, exactSchema(child)]),
        ),
      ],
    ]
  if (listSchemas.has(key) && Array.isArray(value)) return [[key, value.map(exactSchema)]]
  return [[key, value]]
}
/** Transform only actual subschemas, never the objects inside enum/default/const. */
export function exactSchema(schema: JsonValue): JsonValue {
  if (!object(schema)) return schema
  return Object.fromEntries(
    Object.entries(schema).flatMap(([key, value]) => {
      // Unknown author annotations cannot impersonate our private compiler keywords.
      if (privateKeywords.has(key) || nonDraftExtensions.has(key)) return []
      return (
        numericKeyword(key, value) ??
        literalKeyword(key, value) ??
        typeKeyword(key, value) ??
        childSchema(key, value)
      )
    }),
  )
}
