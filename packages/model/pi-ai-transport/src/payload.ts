// The fixed payload of one send: the scan for content references, the bytes and their digest.
import { createHash } from 'node:crypto'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { FixedModelRequest } from '@omne-harness/model-contract'

/**
 * The path of the first part that the model sees and that points at stored content by `ref`, in
 * the order system, then messages. `null` when the request has none.
 */
export function firstModelVisibleReference(request: FixedModelRequest): string | null {
  for (const [index, block] of request.system.entries())
    if (block.visibility.toModel && 'ref' in block) return `/system/${index}`
  for (const [index, message] of request.messages.entries())
    for (const [part, block] of message.blocks.entries())
      if (block.visibility.toModel && 'ref' in block) return `/messages/${index}/blocks/${part}`
  return null
}

const encoder = new TextEncoder()

/** The UTF-8 bytes of the JSON text of the body, written without space. */
export function serializeBody(body: JsonValue): Uint8Array {
  return encoder.encode(writeJsonText(body))
}

/** The SHA-256 of the bytes as 64 lower-case hexadecimal digits. */
export function digestOf(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}
