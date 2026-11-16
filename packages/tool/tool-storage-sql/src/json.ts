import type { JsonValue } from '@omne-harness/sql-contract'

export class NotJsonError extends Error {
  constructor(path: string, what: string) {
    super(`${path}: ${what} is not JSON data`)
    this.name = 'NotJsonError'
  }
}

function plain(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function encodeLeaf(value: unknown, path: string): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new NotJsonError(path, 'a number that is not finite')
    return value
  }
  throw new NotJsonError(path, `a ${typeof value}`)
}

function encodeMembers(value: object, path: string, open: Set<object>): JsonValue {
  if (Array.isArray(value))
    return value.map((item: unknown, index) => {
      if (item === undefined) throw new NotJsonError(`${path}[${index}]`, 'undefined')
      return encode(item, `${path}[${index}]`, open)
    })
  if (!plain(value)) throw new NotJsonError(path, 'an object that is not plain data')
  const out: Record<string, JsonValue> = {}
  for (const [key, member] of Object.entries(value))
    if (member !== undefined) out[key] = encode(member, `${path}.${key}`, open)
  return out
}

function encode(value: unknown, path: string, open: Set<object>): JsonValue {
  if (typeof value !== 'object' || value === null) return encodeLeaf(value, path)
  if (open.has(value)) throw new NotJsonError(path, 'a cycle')
  open.add(value)
  try {
    return encodeMembers(value, path, open)
  } finally {
    open.delete(value)
  }
}

export function toJson(value: unknown, path = 'value'): JsonValue {
  return encode(value, path, new Set())
}
