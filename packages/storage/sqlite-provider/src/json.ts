// RFC 8785 writing and the strict JSON judgement. The provider keeps its own copy because the
// sql-contract root exports shapes and three pure functions only. Cleanup candidate: sql-contract
// could export these helpers, and this file would go.
import { createHash } from 'node:crypto'
import type { JsonValue } from '@omne-harness/sql-contract'

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

export function utf8Length(text: string): number {
  return Buffer.byteLength(text, 'utf8')
}

function isPlainObject(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isDenseArray(value: readonly unknown[]): boolean {
  const keys = Object.keys(value)
  return keys.length === value.length && keys.every((key, index) => key === String(index))
}

function hasOnlyDataProperties(value: object): boolean {
  return Reflect.ownKeys(value).every(key => {
    if (typeof key !== 'string') return false
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return descriptor !== undefined && 'value' in descriptor && descriptor.enumerable === true
  })
}

function judge(value: unknown, ancestors: Set<object>): boolean {
  if (value === null || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'string') return value.isWellFormed()
  if (typeof value !== 'object' || ancestors.has(value)) return false
  ancestors.add(value)
  try {
    if (Array.isArray(value))
      return isDenseArray(value) && value.every(item => judge(item, ancestors))
    if (!isPlainObject(value) || !hasOnlyDataProperties(value)) return false
    return Object.entries(value).every(
      ([key, item]) => key.isWellFormed() && judge(item, ancestors),
    )
  } finally {
    ancestors.delete(value)
  }
}

/**
 * True for strict JSON: null, boolean, finite number, well-formed string, dense array and plain
 * object of those. A cycle, a shared getter, a Date, a bigint or an undefined is not JSON. A value
 * so deep that the walk overflows the stack is not JSON either.
 */
export function isStrictJson(value: unknown): value is JsonValue {
  try {
    return judge(value, new Set())
  } catch (error) {
    if (error instanceof RangeError) return false
    throw error
  }
}

function write(value: JsonValue): string {
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  // ECMAScript Number::toString is the number form that RFC 8785 requires, and -0 writes "0".
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${(value as readonly JsonValue[]).map(write).join(',')}]`
  const object = value as { readonly [key: string]: JsonValue }
  // Default string comparison orders by UTF-16 code units, the order of RFC 8785.
  const keys = Object.keys(object).sort()
  return `{${keys.map(key => `${JSON.stringify(key)}:${write(object[key] as JsonValue)}`).join(',')}}`
}

/** The RFC 8785 text of a strict JSON value. Throws TypeError for any other value. */
export function canonicalJson(value: unknown): string {
  if (!isStrictJson(value)) throw new TypeError('value is not strict JSON')
  return write(value)
}

/** Nesting depth of the containers (the first container is depth 1) and total member count. */
export function jsonShape(value: JsonValue): Readonly<{ depth: number; members: number }> {
  let depth = 0
  let members = 0
  const pending: [JsonValue, number][] = [[value, 1]]
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const [item, level] = next
    if (typeof item !== 'object' || item === null) continue
    depth = Math.max(depth, level)
    const children = Array.isArray(item)
      ? (item as readonly JsonValue[])
      : Object.values(item as { readonly [key: string]: JsonValue })
    members += children.length
    for (const child of children) pending.push([child, level + 1])
  }
  return { depth, members }
}
