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
/** Transform only actual subschemas, never the objects inside enum/default/const. */
export function exactSchema(schema: JsonValue): JsonValue {
  if (!object(schema)) return schema
  return Object.fromEntries(
    Object.entries(schema).flatMap(([key, value]) => {
      // Unknown author annotations cannot impersonate our private compiler keywords.
      if (privateKeywords.has(key) || nonDraftExtensions.has(key)) return []
      if (
        [
          'minLength',
          'maxLength',
          'minItems',
          'maxItems',
          'minProperties',
          'maxProperties',
        ].includes(key) &&
        isJsonNumber(value)
      )
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
      if (
        ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'].includes(
          key,
        ) &&
        isJsonNumber(value)
      )
        return [[`exact_${key}`, writeJsonLossless(value)]]
      if ((key === 'const' || key === 'enum') && containsNumber(value))
        return [[`exact_${key}`, writeJsonLossless(value)]]
      if (key === 'uniqueItems' && value === true) return [['exact_uniqueItems', true]]
      if (key === 'type' && Array.isArray(value) && value.includes('integer'))
        return [['exact_type', writeJsonLossless(value)]]
      if (key === 'type' && value === 'integer')
        return [
          ['type', 'number'],
          ['exact_integer', true],
        ]
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
    }),
  )
}
