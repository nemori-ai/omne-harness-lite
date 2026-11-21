import { createHash } from 'node:crypto'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'

const encoder = new TextEncoder()

export function serializeBody(body: JsonValue): Uint8Array {
  return encoder.encode(writeJsonText(body))
}

export function digestOf(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}
