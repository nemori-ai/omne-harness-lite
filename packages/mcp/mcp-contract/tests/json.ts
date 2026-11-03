// Test helper: builds the lossless JSON trees that the contract reads, from plain test data.
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

/** A read body: the only input that a category port judges. */
export function readBody(value: unknown): JsonValue {
  const read = readBodyText(JSON.stringify(value), LIMITS)
  if (read.kind !== 'ok') throw new TypeError(`test data is not JSON: ${read.kind}`)
  return read.value
}

/** A JSON tree that did not pass through the asset reader. */
export function json(value: unknown): JsonValue {
  return jsonText(JSON.stringify(value))
}

/** A JSON tree read from text, so that a number keeps the lexeme as written. */
export function jsonText(text: string): JsonValue {
  const read = readJsonText(text, LIMITS)
  if (read.kind !== 'ok') throw new TypeError(`test data is not JSON: ${read.kind}`)
  return read.value
}
