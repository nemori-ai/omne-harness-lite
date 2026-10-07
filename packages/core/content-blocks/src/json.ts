/** JSON numbers preserve their decimal source; no arithmetic is performed here. */
export class LosslessNumber {
  readonly #source: string

  constructor(source: string) {
    if (!JSON_NUMBER.test(source)) throw new TypeError('not a JSON number literal')
    this.#source = source
    Object.freeze(this)
  }

  /** The explicit numeric read boundary, for exact decimal consumers. */
  get source(): string {
    return this.#source
  }

  static is(value: unknown): value is LosslessNumber {
    return value !== null && typeof value === 'object' && #source in value
  }
}

const JSON_NUMBER = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?(?![\s\S])/u

export type JsonNumber = number | LosslessNumber
export type JsonValue = null | boolean | string | JsonNumber | JsonArray | JsonObject
export interface JsonArray extends ReadonlyArray<JsonValue> {}
export interface JsonObject {
  readonly [key: string]: JsonValue
}

declare const opaqueBrand: unique symbol
/** The type exposes no contents. Transport adapters use the explicit read boundary. */
export interface OpaqueJson {
  readonly [opaqueBrand]: true
}

class OpaqueJsonValue implements OpaqueJson {
  declare readonly [opaqueBrand]: true
  constructor(readonly value: JsonValue) {
    Object.freeze(this)
  }
}

export type JsonReadResult =
  { readonly ok: JsonValue } | { readonly failed: 'syntax' | 'duplicate_member' }

export function isJsonNumber(value: unknown): value is JsonNumber {
  return LosslessNumber.is(value) || (typeof value === 'number' && Number.isFinite(value))
}

export function jsonNumberSource(value: JsonNumber): string {
  if (LosslessNumber.is(value)) return value.source
  if (!Number.isFinite(value)) throw new TypeError('not a finite JSON number')
  return Object.is(value, -0) ? '-0' : String(value)
}

/** Exact integer/nonnegative tests, even for exponents outside the Number range. */
export function isNonNegativeJsonInteger(value: unknown): value is JsonNumber {
  if (!isJsonNumber(value)) return false
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0
  const source = value.source
  const [mantissa = '', exponent = '0'] = source.split(/[eE]/u)
  const digits = mantissa.replace(/[-.]/gu, '')
  if (/^0+$/u.test(digits)) return true
  if (source.startsWith('-')) return false
  const fractionLength = mantissa.split('.')[1]?.length ?? 0
  const trailingZeros = digits.length - digits.replace(/0+$/u, '').length
  return BigInt(exponent) >= BigInt(fractionLength - trailingZeros)
}

function copyNumber(input: unknown): JsonNumber | undefined {
  if (LosslessNumber.is(input)) {
    if (Object.getPrototypeOf(input) !== LosslessNumber.prototype)
      throw new TypeError('not an owned JSON number')
    return input
  }
  return typeof input === 'number' && Number.isFinite(input) ? input : undefined
}

function jsonKeys(input: object): readonly string[] {
  const prototype: unknown = Object.getPrototypeOf(input)
  if (!Array.isArray(input) && prototype !== Object.prototype && prototype !== null)
    throw new TypeError('not a JSON object')
  const keys = Reflect.ownKeys(input)
  if (keys.some(key => typeof key !== 'string')) throw new TypeError('not JSON data')
  return keys as string[]
}
function jsonMember(input: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(input, key)
  if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
    throw new TypeError('not JSON data')
  return descriptor.value
}
function copyJsonArray(
  input: readonly unknown[],
  keys: readonly string[],
  copy: (input: unknown) => JsonValue,
): JsonArray {
  if (keys.length !== input.length + 1) throw new TypeError('array has extra members')
  const result: JsonValue[] = []
  for (let index = 0; index < input.length; index++)
    result.push(copy(jsonMember(input, String(index))))
  return Object.freeze(result)
}
function copyJsonObject(
  input: object,
  keys: readonly string[],
  copy: (input: unknown) => JsonValue,
): JsonObject {
  // Populate without inherited setters, then restore the public prototype before freezing.
  const result: Record<string, JsonValue> = Object.create(null)
  for (const key of keys) result[key] = copy(jsonMember(input, key))
  Object.setPrototypeOf(result, Object.prototype)
  return Object.freeze(result)
}
/** Accept only actual JSON data, then copy/freeze without invoking getters or toJSON. */
export function copyJsonValue(
  value: unknown,
): { readonly ok: JsonValue } | { readonly failed: 'not_json' } {
  const active = new Set<object>()
  function copy(input: unknown): JsonValue {
    if (input === null || typeof input === 'boolean' || typeof input === 'string') return input
    const numeric = copyNumber(input)
    if (numeric !== undefined) return numeric
    if (input instanceof OpaqueJsonValue) return copy(input.value)
    if (typeof input !== 'object' || active.has(input)) throw new TypeError('not JSON data')
    const keys = jsonKeys(input)
    active.add(input)
    try {
      return Array.isArray(input)
        ? copyJsonArray(input, keys, copy)
        : copyJsonObject(input, keys, copy)
    } finally {
      active.delete(input)
    }
  }
  try {
    return Object.freeze({ ok: copy(value) })
  } catch (error) {
    if (error instanceof TypeError) return Object.freeze({ failed: 'not_json' })
    throw error
  }
}

export function toOpaqueJson(value: JsonValue): OpaqueJson {
  const copied = copyJsonValue(value)
  if ('failed' in copied) throw new TypeError('not JSON data')
  return new OpaqueJsonValue(copied.ok)
}

/** S-9: only a transport adapter should call this read boundary. */
export function readOpaqueJson(value: OpaqueJson): JsonValue {
  if (!(value instanceof OpaqueJsonValue)) throw new TypeError('not an opaque JSON value')
  return value.value
}

/** The engine owns syntax. The second pass only detects decoded duplicate names. */
export function readJsonStrict(text: string): JsonReadResult {
  if (typeof text !== 'string') return Object.freeze({ failed: 'syntax' } as const)
  let value: unknown
  try {
    value = JSON.parse(text, (_key: string, item: unknown, context?: { source?: string }) => {
      if (typeof item === 'number') {
        const source = context?.source
        if (source === undefined) throw new Error('JSON.parse context.source is required')
        // Conservative representation: decimals/exponents preserve their source spelling too.
        if (
          Number.isSafeInteger(item) &&
          !Object.is(item, -0) &&
          /^-?(?:0|[1-9][0-9]*)(?![\s\S])/u.test(source)
        )
          return item
        return new LosslessNumber(source)
      }
      return item
    })
  } catch (error) {
    if (error instanceof SyntaxError) return Object.freeze({ failed: 'syntax' })
    throw error
  }
  if (hasDuplicateMember(text)) return Object.freeze({ failed: 'duplicate_member' })
  const copied = copyJsonValue(value)
  if ('failed' in copied) throw new Error('JSON.parse produced non-JSON data')
  return Object.freeze({ ok: copied.ok })
}

function hasDuplicateMember(text: string): boolean {
  const stack: (Set<string> | null)[] = []
  for (let index = 0; index < text.length; index++) {
    const character = text[index]
    if (character === '{') stack.push(new Set())
    else if (character === '[') stack.push(null)
    else if (character === '}' || character === ']') stack.pop()
    else if (character === '"') {
      const start = index++
      while (text[index] !== '"') {
        if (text[index] === '\\') index++
        index++
      }
      let after = index + 1
      while (/[\u0009\u000a\u000d\u0020]/u.test(text[after] ?? 'x')) after++
      if (text[after] === ':') {
        const name: unknown = JSON.parse(text.slice(start, index + 1))
        const members = stack[stack.length - 1]
        if (typeof name !== 'string' || members == null) throw new Error('invalid scan state')
        if (members.has(name)) return true
        members.add(name)
      }
    }
  }
  return false
}

/** Accepts data values and validated blocks; rejects non-JSON data instead of dropping it. */
export function writeJsonLossless(value: unknown): string {
  const copied = copyJsonValue(value)
  if ('failed' in copied) throw new TypeError('not JSON data')
  const output = JSON.stringify(copied.ok, (_key: string, item: unknown) => {
    if (LosslessNumber.is(item)) return rawNumber(item.source)
    if (typeof item === 'number' && Object.is(item, -0)) return rawNumber('-0')
    return item
  })
  if (output === undefined) throw new Error('JSON data has no encoding')
  return output
}

function rawNumber(source: string): unknown {
  // TypeScript 6's ES2024 library lacks this Node 24 API; narrow the actual runtime member.
  if (!('rawJSON' in JSON) || typeof JSON.rawJSON !== 'function') {
    throw new Error('JSON.rawJSON is required')
  }
  const encoded: unknown = JSON.rawJSON(source)
  return encoded
}
