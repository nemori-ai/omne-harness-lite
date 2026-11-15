import { readBodyText } from '@omne-harness/assets'
import { readJsonText, type JsonValue } from '@omne-harness/json-text'

const LIMITS = {
  maxBytes: 1_000_000,
  maxDepth: 64,
  maxItems: 100_000,
  maxMembers: 10_000,
  maxStringLength: 1_000_000,
  maxNumberLength: 100,
} as const

export function readBody(value: unknown): JsonValue {
  const read = readBodyText(JSON.stringify(value), LIMITS)
  if (read.kind !== 'ok') throw new TypeError(`test data is not JSON: ${read.kind}`)
  return read.value
}

export function json(value: unknown): JsonValue {
  return jsonText(JSON.stringify(value))
}

export function jsonText(text: string): JsonValue {
  const read = readJsonText(text, LIMITS)
  if (read.kind !== 'ok') throw new TypeError(`test data is not JSON: ${read.kind}`)
  return read.value
}
