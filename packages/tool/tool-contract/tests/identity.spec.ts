import { describe, expect, it } from 'vitest'
import {
  TOOL_IDENTITY_MAX_LENGTH,
  decodeToolCallId,
  decodeToolCursor,
  decodeToolDeliveryId,
  decodeToolInstanceId,
  decodeToolOperationId,
  decodeToolResultVersion,
  decodeToolRevision,
  decodeToolWaitId,
} from '@omne-harness/tool-contract'

const decoders = [
  ['ToolCallId', decodeToolCallId],
  ['ToolOperationId', decodeToolOperationId],
  ['ToolInstanceId', decodeToolInstanceId],
  ['ToolWaitId', decodeToolWaitId],
  ['ToolResultVersion', decodeToolResultVersion],
  ['ToolDeliveryId', decodeToolDeliveryId],
  ['ToolCursor', decodeToolCursor],
  ['ToolRevision', decodeToolRevision],
] as const

describe.each(decoders)('%s decoder', (field, decode) => {
  it('accepts printable identity text and keeps it unchanged', () => {
    expect(decode('call_01J9-x.y:z')).toEqual({ ok: 'call_01J9-x.y:z' })
    expect(decode('a'.repeat(TOOL_IDENTITY_MAX_LENGTH))).toEqual({
      ok: 'a'.repeat(TOOL_IDENTITY_MAX_LENGTH),
    })
  })

  it('rejects a value that is not identity text, without throwing', () => {
    expect(decode(7)).toEqual({ failure: { field, reason: 'type' } })
    expect(decode(null)).toEqual({ failure: { field, reason: 'type' } })
    expect(decode('')).toEqual({ failure: { field, reason: 'empty' } })
    expect(decode('a'.repeat(TOOL_IDENTITY_MAX_LENGTH + 1))).toEqual({
      failure: { field, reason: 'length' },
    })
    for (const text of [' call', 'call ', 'ca ll', 'call\n', 'call\u0000', 'callé'])
      expect(decode(text)).toEqual({ failure: { field, reason: 'character' } })
  })
})

it('decodes the call text of a tool producer kept by a consumer into a branded call identity', () => {
  // A consumer that keeps `ProducerRef = { kind: 'tool'; call: string }` decodes `call` here.
  const producer = { kind: 'tool', call: 'call_7' } as const
  const decoded = decodeToolCallId(producer.call)
  expect(decoded).toEqual({ ok: 'call_7' })
})
