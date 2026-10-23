// The canonical JSON text of a plain data value, for the SHA-256 digest of a family record. The
// rule is the one of tokenizer-tiktoken (its SPEC, "规范 JSON"), widened to every JSON value:
// no white space, object keys sorted by UTF-16 code units, strings as `JSON.stringify` writes
// them, finite numbers as `JSON.stringify` writes them, `true`, `false` and `null`. For these
// values the text equals RFC 8785 (JCS).
import { createHash } from 'node:crypto'

/** Thrown when a value is not plain JSON data: the message names the path and the reason. */
export class RecordPurityError extends Error {
  override readonly name = 'RecordPurityError'
}

function impure(path: string, reason: string): RecordPurityError {
  return new RecordPurityError(`${path} ${reason}`)
}

/** The value of an own enumerable data property. An accessor is never called. */
function dataOf(holder: object, key: string, path: string): unknown {
  const descriptor = Reflect.getOwnPropertyDescriptor(holder, key)
  if (descriptor === undefined) throw impure(path, 'is a hole')
  if (!('value' in descriptor)) throw impure(path, 'is an accessor')
  if (descriptor.enumerable !== true) throw impure(path, 'is not enumerable')
  return descriptor.value
}

function arrayText(value: readonly unknown[], path: string, open: Set<object>): string {
  const items: string[] = []
  for (let index = 0; index < value.length; index += 1) {
    const at = `${path}[${index}]`
    items.push(valueText(dataOf(value, String(index), at), at, open))
  }
  return `[${items.join(',')}]`
}

function objectText(value: object, path: string, open: Set<object>): string {
  const proto: unknown = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) throw impure(path, 'is not a plain object')
  if (Object.getOwnPropertySymbols(value).length > 0) throw impure(path, 'has a symbol key')
  const members = Object.getOwnPropertyNames(value)
    .toSorted()
    .map(key => {
      const at = `${path}.${key}`
      return `${JSON.stringify(key)}:${valueText(dataOf(value, key, at), at, open)}`
    })
  return `{${members.join(',')}}`
}

function valueText(value: unknown, path: string, open: Set<object>): string {
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value)
    case 'boolean':
      return value ? 'true' : 'false'
    case 'number':
      if (!Number.isFinite(value)) throw impure(path, 'is not a finite number')
      return JSON.stringify(value)
    case 'object': {
      if (value === null) return 'null'
      if (open.has(value)) throw impure(path, 'is a cycle')
      open.add(value)
      try {
        return Array.isArray(value) ? arrayText(value, path, open) : objectText(value, path, open)
      } finally {
        open.delete(value)
      }
    }
    default:
      throw impure(path, `is ${typeof value}, not JSON data`)
  }
}

/**
 * The canonical JSON text of a plain data value. Throws `RecordPurityError` for a function,
 * `undefined`, a symbol, a bigint, a number that is not finite, an array hole, an accessor, a
 * non-plain object, a symbol key or a cycle.
 */
export function canonicalJson(value: unknown): string {
  return valueText(value, '$', new Set())
}

/** The SHA-256 of the UTF-8 bytes of the canonical JSON text, as 64 lower-case hex digits. */
export function canonicalDigest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')
}
