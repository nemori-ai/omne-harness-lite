import { createHash } from 'node:crypto'

export class RecordPurityError extends Error {
  override readonly name = 'RecordPurityError'
}

function impure(path: string, reason: string): RecordPurityError {
  return new RecordPurityError(`${path} ${reason}`)
}

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

export function canonicalJson(value: unknown): string {
  return valueText(value, '$', new Set())
}

export function canonicalDigest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')
}
