import { Ajv2020 } from 'ajv/dist/2020.js'
import metaSchema from 'ajv/dist/refs/json-schema-2020-12/schema.json' with { type: 'json' }
import applicatorMeta from 'ajv/dist/refs/json-schema-2020-12/meta/applicator.json' with { type: 'json' }
import unevaluatedMeta from 'ajv/dist/refs/json-schema-2020-12/meta/unevaluated.json' with { type: 'json' }
import contentMeta from 'ajv/dist/refs/json-schema-2020-12/meta/content.json' with { type: 'json' }
import coreMeta from 'ajv/dist/refs/json-schema-2020-12/meta/core.json' with { type: 'json' }
import formatMeta from 'ajv/dist/refs/json-schema-2020-12/meta/format-annotation.json' with { type: 'json' }
import metadataMeta from 'ajv/dist/refs/json-schema-2020-12/meta/meta-data.json' with { type: 'json' }
import validationMeta from 'ajv/dist/refs/json-schema-2020-12/meta/validation.json' with { type: 'json' }
import {
  isJsonNumber,
  jsonNumberSource,
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
  type JsonValue,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'

function object(value: unknown): value is JsonObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !LosslessNumber.is(value)
  )
}
interface Decimal {
  readonly negative: boolean
  readonly digits: string
  readonly exponent: bigint
}
export class UnsupportedSchemaKeywordError extends Error {
  constructor(
    readonly keyword: 'minContains' | 'maxContains',
    readonly numericSource: string,
  ) {
    super(`${keyword} cannot be compiled exactly outside the safe integer range: ${numericSource}`)
    this.name = 'UnsupportedSchemaKeywordError'
  }
}
function decimal(value: unknown): Decimal | undefined {
  if (!isJsonNumber(value)) return undefined
  const raw = jsonNumberSource(value)
  const [mantissa = '', exponent = '0'] = raw.split(/[eE]/u)
  const coefficient = mantissa.replace(/[-.]/gu, '').replace(/^0+/u, '')
  if (coefficient === '') return { negative: false, digits: '0', exponent: 0n }
  const digits = coefficient.replace(/0+$/u, '')
  return {
    negative: raw.startsWith('-'),
    digits,
    exponent:
      BigInt(exponent) -
      BigInt(mantissa.split('.')[1]?.length ?? 0) +
      BigInt(coefficient.length - digits.length),
  }
}
function compare(a: Decimal, b: Decimal): number {
  if (a.negative !== b.negative) return a.negative ? -1 : 1
  let result: number
  if (a.digits === '0' || b.digits === '0')
    result = a.digits === b.digits ? 0 : a.digits === '0' ? -1 : 1
  else {
    const first = BigInt(a.digits.length) + a.exponent
    const second = BigInt(b.digits.length) + b.exponent
    if (first !== second) result = first < second ? -1 : 1
    else {
      const length = Math.max(a.digits.length, b.digits.length)
      const left = a.digits.padEnd(length, '0')
      const right = b.digits.padEnd(length, '0')
      result = left === right ? 0 : left < right ? -1 : 1
    }
  }
  return a.negative ? -result : result
}
function equal(left: JsonValue, right: JsonValue): boolean {
  const first = decimal(left)
  const second = decimal(right)
  if (first !== undefined || second !== undefined)
    return first !== undefined && second !== undefined && compare(first, second) === 0
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => right[index] !== undefined && equal(item, right[index]))
    )
  if (object(left) || object(right))
    return (
      object(left) &&
      object(right) &&
      Object.keys(left).length === Object.keys(right).length &&
      Object.entries(left).every(
        ([key, value]) =>
          Object.hasOwn(right, key) && right[key] !== undefined && equal(value, right[key]),
      )
    )
  return left === right
}
function containsNumber(value: JsonValue): boolean {
  return (
    isJsonNumber(value) ||
    (Array.isArray(value) && value.some(containsNumber)) ||
    (object(value) && Object.values(value).some(containsNumber))
  )
}
function divisible(a: Decimal, b: Decimal): boolean {
  if (b.negative || b.digits === '0') return false
  if (a.digits === '0') return true
  let numerator = BigInt(a.digits)
  let denominator = BigInt(b.digits)
  let left = numerator
  let right = denominator
  while (right !== 0n) {
    const remainder = left % right
    left = right
    right = remainder
  }
  numerator /= left
  denominator /= left
  const exponent = a.exponent - b.exponent
  if (exponent < 0n) {
    const text = numerator.toString()
    const zeros = text.length - text.replace(/0+$/u, '').length
    return denominator === 1n && BigInt(zeros) >= -exponent
  }
  let twos = 0n
  let fives = 0n
  while (denominator % 2n === 0n) {
    denominator /= 2n
    twos++
  }
  while (denominator % 5n === 0n) {
    denominator /= 5n
    fives++
  }
  return denominator === 1n && exponent >= twos && exponent >= fives
}
/** Per-call context, no mutable numeric registry: Ajv's projected view is never authoritative. */
function original(receiver: unknown, context: unknown, observed: unknown): JsonValue | undefined {
  if (
    !object(receiver) ||
    !Object.hasOwn(receiver, 'root') ||
    !object(context) ||
    typeof context.instancePath !== 'string'
  )
    throw new Error('missing exact Schema invocation context')
  // String projection is identity, including propertyNames' synthetic string input.
  if (typeof observed === 'string') return observed
  let value = receiver.root
  for (const encoded of context.instancePath.split('/').slice(1)) {
    const key = encoded.replace(/~1/gu, '/').replace(/~0/gu, '~')
    if (Array.isArray(value)) value = value[Number(key)]
    else if (object(value)) value = value[key]
    else return undefined
  }
  return value
}
function literal(text: unknown): JsonValue {
  if (typeof text !== 'string') throw new Error('invalid exact Schema literal')
  const result = readJsonStrict(text)
  if ('failed' in result) throw new Error('invalid exact Schema encoding')
  return result.ok
}
export function installExactKeywords(ajv: Ajv2020): void {
  for (const keyword of [
    'minLength',
    'maxLength',
    'minItems',
    'maxItems',
    'minProperties',
    'maxProperties',
  ])
    ajv.addKeyword({
      keyword: `exact_${keyword}`,
      schemaType: 'string',
      errors: false,
      validate: function (
        this: unknown,
        encoded: unknown,
        _value: unknown,
        _schema: unknown,
        context: unknown,
      ): boolean {
        const value = original(this, context, _value)
        let count: number
        if (keyword.endsWith('Length')) {
          if (typeof value !== 'string') return true
          count = 0
          for (const _point of value) count++
        } else if (keyword.endsWith('Items')) {
          if (!Array.isArray(value)) return true
          count = value.length
        } else {
          if (!object(value)) return true
          count = Object.keys(value).length
        }
        const actual = decimal(count)
        const bound = decimal(literal(encoded))
        if (actual === undefined || bound === undefined)
          throw new Error('invalid cardinality Schema bound')
        const comparison = compare(actual, bound)
        return keyword.startsWith('min') ? comparison >= 0 : comparison <= 0
      },
    })
  ajv.addKeyword({
    keyword: 'exact_uniqueItems',
    schemaType: 'boolean',
    errors: false,
    validate: function (
      this: unknown,
      _encoded: unknown,
      _value: unknown,
      _schema: unknown,
      context: unknown,
    ): boolean {
      const value = original(this, context, _value)
      return (
        !Array.isArray(value) ||
        value.every((item, index) => !value.slice(0, index).some(other => equal(item, other)))
      )
    },
  })
  ajv.addKeyword({
    keyword: 'exact_type',
    schemaType: 'string',
    errors: false,
    validate: function (
      this: unknown,
      encoded: unknown,
      _value: unknown,
      _schema: unknown,
      context: unknown,
    ): boolean {
      const value = original(this, context, _value)
      const types = literal(encoded)
      const candidates = Array.isArray(types) ? types : [types]
      return candidates.some(type => {
        if (type === 'integer') {
          const number = decimal(value)
          return number !== undefined && (number.digits === '0' || number.exponent >= 0n)
        }
        if (type === 'number') return isJsonNumber(value)
        if (type === 'array') return Array.isArray(value)
        if (type === 'object') return object(value)
        if (type === 'null') return value === null
        return typeof value === type
      })
    },
  })
  for (const keyword of [
    'minimum',
    'maximum',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'multipleOf',
  ]) {
    ajv.addKeyword({
      keyword: `exact_${keyword}`,
      schemaType: 'string',
      errors: false,
      validate: function (
        this: unknown,
        encoded: unknown,
        _value: unknown,
        _schema: unknown,
        context: unknown,
      ): boolean {
        const value = decimal(original(this, context, _value))
        const bound = decimal(literal(encoded))
        if (value === undefined) return true
        if (bound === undefined) throw new Error('invalid numeric Schema bound')
        if (keyword === 'multipleOf') return divisible(value, bound)
        const comparison = compare(value, bound)
        return keyword === 'minimum'
          ? comparison >= 0
          : keyword === 'maximum'
            ? comparison <= 0
            : keyword === 'exclusiveMinimum'
              ? comparison > 0
              : comparison < 0
      },
    })
  }
  ajv.addKeyword({
    keyword: 'exact_integer',
    schemaType: 'boolean',
    errors: false,
    validate: function (
      this: unknown,
      _encoded: unknown,
      _value: unknown,
      _schema: unknown,
      context: unknown,
    ): boolean {
      const value = original(this, context, _value)
      if (!isJsonNumber(value)) return true
      const number = decimal(value)
      return number !== undefined && (number.digits === '0' || number.exponent >= 0n)
    },
  })
  for (const keyword of ['const', 'enum'])
    ajv.addKeyword({
      keyword: `exact_${keyword}`,
      schemaType: 'string',
      errors: false,
      validate: function (
        this: unknown,
        encoded: unknown,
        _value: unknown,
        _schema: unknown,
        context: unknown,
      ): boolean {
        const value = original(this, context, _value)
        const expected = literal(encoded)
        return (
          value !== undefined &&
          (keyword === 'const'
            ? equal(value, expected)
            : Array.isArray(expected) && expected.some(item => equal(value, item)))
        )
      },
    })
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
/** Transform only actual subschemas, never the objects inside enum/default/const. */
export function exactSchema(schema: JsonValue): JsonValue {
  if (!object(schema)) return schema
  return Object.fromEntries(
    Object.entries(schema).flatMap(([key, value]) => {
      // Unknown author annotations cannot impersonate our private compiler keywords.
      if (privateKeywords.has(key)) return []
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
        throw new UnsupportedSchemaKeywordError(key, jsonNumberSource(value))
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
/** Reuse the standard dialect resources, with the same exact original-value checks. */
export function createExactMetaValidator(): (schema: JsonValue, projected: JsonValue) => boolean {
  const ajv = new Ajv2020({
    meta: false,
    validateSchema: false,
    strict: false,
    ownProperties: true,
    validateFormats: false,
    passContext: true,
  })
  installExactKeywords(ajv)
  for (const resource of [
    metaSchema,
    applicatorMeta,
    unevaluatedMeta,
    contentMeta,
    coreMeta,
    formatMeta,
    metadataMeta,
    validationMeta,
  ]) {
    const transformed = exactSchema(resource)
    if (!object(transformed)) throw new Error('standard meta-Schema is not an object')
    ajv.addMetaSchema(transformed)
  }
  const validator = ajv.getSchema(metaSchema.$id)
  if (validator === undefined) throw new Error('standard meta-Schema is unavailable')
  return (schema, projected) => validator.call({ root: schema }, projected) === true
}
