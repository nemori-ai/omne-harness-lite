import { createHash } from 'node:crypto'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { FixedModelRequest } from '@omne-harness/model-contract'

export function firstModelVisibleReference(request: FixedModelRequest): string | null {
  for (const [index, block] of request.system.entries())
    if (block.visibility.toModel && 'ref' in block) return `/system/${index}`
  for (const [index, message] of request.messages.entries())
    for (const [part, block] of message.blocks.entries())
      if (block.visibility.toModel && 'ref' in block) return `/messages/${index}/blocks/${part}`
  return null
}

const encoder = new TextEncoder()

export function serializeBody(body: JsonValue): Uint8Array {
  return encoder.encode(writeJsonText(body))
}

export function digestOf(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}
