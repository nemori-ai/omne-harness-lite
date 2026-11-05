// JSON-RPC messages as the session reads and writes them. The contract classifies a message
// (`classifyWireEvent`); this module only takes the payload out of a message the contract already
// classified, and writes the messages of this side as plain data.
import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { PlainJson, PlainRecord } from '@omne-harness/mcp-contract'
import { JSON_LIMITS } from './limits.ts'

export type JsonObject = Extract<JsonValue, { kind: 'object' }>

/** The message as a JSON object, or undefined when the text is not one. */
export function parseMessage(text: string): JsonObject | undefined {
  const read = readJsonText(text, JSON_LIMITS)
  return read.kind === 'ok' && read.value.kind === 'object' ? read.value : undefined
}

export function memberOf(object: JsonObject, key: string): JsonValue | undefined {
  return object.entries.find(entry => entry.key === key)?.value
}

export function textOf(value: JsonValue | undefined): string | undefined {
  return value?.kind === 'string' ? value.value : undefined
}

/** The id of a message as the text of its string value or number lexeme, or undefined. */
export function idOf(message: JsonObject): string | undefined {
  const id = memberOf(message, 'id')
  if (id?.kind === 'string') return id.value
  if (id?.kind === 'number') return id.lexeme
  return undefined
}

/** The id of a message as plain data, to echo it in a response. */
export function plainIdOf(message: JsonObject): PlainJson | undefined {
  const id = memberOf(message, 'id')
  if (id?.kind === 'string') return id.value
  if (id?.kind === 'number') return Number(id.lexeme)
  return undefined
}

function isPlainJson(value: unknown): value is PlainJson {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return true
  if (Array.isArray(value)) return value.every(isPlainJson)
  return typeof value === 'object' && Object.values(value).every(isPlainJson)
}

/** The plain form of a JSON tree, to put it into a message of this side. */
export function plainOf(value: JsonValue): PlainJson {
  const parsed: unknown = JSON.parse(writeJsonText(value))
  if (!isPlainJson(parsed)) throw new TypeError('a JSON tree did not write as JSON')
  return parsed
}

/** One JSON-RPC message of this side, as text. */
export function messageText(message: PlainRecord): string {
  return JSON.stringify({ jsonrpc: '2.0', ...message })
}
