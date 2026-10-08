import {
  isJsonNumber,
  jsonNumberSource,
  LosslessNumber,
  readJsonStrict,
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
interface Decimal {
  readonly negative: boolean
  readonly digits: string
  readonly exponent: bigint
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
function arraysEqual(left: JsonValue, right: JsonValue): boolean {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((item, index) => right[index] !== undefined && equal(item, right[index]))
  )
}
function objectsEqual(left: JsonValue, right: JsonValue): boolean {
  return (
    object(left) &&
    object(right) &&
    Object.keys(left).length === Object.keys(right).length &&
    Object.entries(left).every(
      ([key, value]) =>
        Object.hasOwn(right, key) && right[key] !== undefined && equal(value, right[key]),
    )
  )
}
function equal(left: JsonValue, right: JsonValue): boolean {
  const first = decimal(left)
  const second = decimal(right)
  if (first !== undefined || second !== undefined)
    return first !== undefined && second !== undefined && compare(first, second) === 0
  if (Array.isArray(left) || Array.isArray(right)) return arraysEqual(left, right)
  if (object(left) || object(right)) return objectsEqual(left, right)
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
export type ExactKeywordFunction = (
  this: unknown,
  encoded: unknown,
  value: unknown,
  schema: unknown,
  context: unknown,
) => boolean
export interface ExactKeywordDefinition {
  readonly keyword: string
  readonly schemaType: 'string' | 'boolean'
  readonly errors: false
  readonly validate: ExactKeywordFunction
}
const definitions: ExactKeywordDefinition[] = []
function addKeyword(definition: ExactKeywordDefinition): void {
  definitions.push(Object.freeze(definition))
}
function defineKeywords(): void {
  for (const keyword of [
    'minLength',
    'maxLength',
    'minItems',
    'maxItems',
    'minProperties',
    'maxProperties',
  ])
    addKeyword({
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
  addKeyword({
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
  addKeyword({
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
    addKeyword({
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
  addKeyword({
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
    addKeyword({
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
defineKeywords()
export const exactKeywordDefinitions: readonly ExactKeywordDefinition[] = Object.freeze(definitions)
export const exactKeywords: Readonly<Record<string, ExactKeywordFunction>> = Object.freeze(
  Object.fromEntries(
    exactKeywordDefinitions.map(definition => [definition.keyword, definition.validate]),
  ),
)
