import { createHash } from 'node:crypto'
import {
  LosslessNumber,
  writeJsonLossless,
  type JsonValue,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import type { EvaluationInput } from './types.ts'

export function codePointCompare(left: string, right: string): number {
  const a = Array.from(left, character => character.codePointAt(0) ?? 0)
  const b = Array.from(right, character => character.codePointAt(0) ?? 0)
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    const x = a[index]
    const y = b[index]
    if (x === undefined || y === undefined) throw new Error('code point index outside string')
    if (x !== y) return x - y
  }
  return a.length - b.length
}
export function object(value: unknown): value is JsonObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !LosslessNumber.is(value)
  )
}
export function canonical(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (object(value))
    return `{${Object.keys(value)
      .sort(codePointCompare)
      .map(key => {
        const member = value[key]
        if (member === undefined) throw new TypeError('JSON member is absent')
        return `${writeJsonLossless(key)}:${canonical(member)}`
      })
      .join(',')}}`
  return writeJsonLossless(value)
}
function cloneJson(input: unknown): JsonValue {
  if (
    input === null ||
    typeof input === 'string' ||
    typeof input === 'boolean' ||
    typeof input === 'number'
  )
    return input
  if (LosslessNumber.is(input)) return new LosslessNumber(input.source)
  if (Array.isArray(input)) return input.map(cloneJson)
  if (object(input))
    return Object.fromEntries(
      Object.entries(input).map(([name, value]) => [name, cloneJson(value)]),
    )
  throw new TypeError('not JSON data')
}
export function copyJson(input: unknown): JsonValue {
  writeJsonLossless(input)
  return cloneJson(input)
}
export function immutable<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const member of Object.values(value)) immutable(member)
    Object.freeze(value)
  }
  return value
}
export function evaluationInputFingerprint(input: EvaluationInput): string {
  return createHash('sha256')
    .update(canonical(copyJson(input)), 'utf8')
    .digest('hex')
}
