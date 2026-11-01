// The strict JSON form of the values that cross into a command (sql-contract §3.2). A member whose
// value is `undefined` is left out, as JSON text leaves it out; every other value that JSON cannot
// carry (a function, a symbol, a BigInt, a number that is not finite, a typed array, a Map, a Date,
// a cycle) is refused with `NotJsonError`, before anything is sent.
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

function encode(value: unknown, path: string, open: Set<object>): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new NotJsonError(path, 'a number that is not finite')
    return value
  }
  if (typeof value !== 'object') throw new NotJsonError(path, `a ${typeof value}`)
  if (open.has(value)) throw new NotJsonError(path, 'a cycle')
  open.add(value)
  try {
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
  } finally {
    open.delete(value)
  }
}

/** A fresh strict JSON copy of `value`; it shares nothing with the caller's value. */
export function toJson(value: unknown, path = 'value'): JsonValue {
  return encode(value, path, new Set())
}
