import { describe, expect, it } from 'vitest'
import {
  judgeContentBlock,
  writeJsonLossless,
  type ToolCallBlock,
} from '@omne-harness-lite/content-blocks'
import { incompleteToolCall, parseCollectedToolCall, type ToolOpening } from '../src/close.ts'

function opening(): ToolOpening {
  const block = judgeContentBlock({
    kind: 'tool_call',
    id: 'b_1',
    visibility: { toHuman: true, toModel: true },
    complete: true,
    callId: 'call_4',
    tool: 'read_file',
    arguments: {},
  })
  if ('rejected' in block || block.ok.kind !== 'tool_call' || !block.ok.complete)
    throw new Error('fixture invalid')
  return Object.freeze({
    t: 'open',
    index: 0,
    kind: 'tool_call',
    fill: 'append',
    id: block.ok.id,
    visibility: block.ok.visibility,
    head: Object.freeze({ callId: block.ok.callId, tool: block.ok.tool }),
  })
}

function argumentsOf(block: ToolCallBlock): unknown {
  if (!('arguments' in block)) throw new Error('expected parsed call')
  return block.arguments
}

describe('S-10/S-11 sole parameter reader, valid-name path', () => {
  it('CLOSE-01 uses an empty object for an empty raw argument string', () => {
    expect(writeJsonLossless(argumentsOf(parseCollectedToolCall(opening(), '')))).toBe('{}')
  })
  it.each(['null', 'true', '[]', '"text"', '5'])('CLOSE-02 accepts any JSON value: %s', raw => {
    expect(writeJsonLossless(argumentsOf(parseCollectedToolCall(opening(), raw)))).toBe(raw)
  })
  it.each([
    '{"path":"a.md"',
    '{"path":"a","path":"b"}',
    '{"nested":{"a":1,"\\u0061":2}}',
    '{"a":1,}',
    '/*x*/{}',
    "{'a':1}",
    'NaN',
    'Infinity',
    '{} {}',
  ])('CLOSE-03 keeps failed raw text without repairing it: %s', raw => {
    const block = parseCollectedToolCall(opening(), raw)
    expect(block).toMatchObject({ complete: true, unparseable: true, rawArguments: raw })
    expect(Object.hasOwn(block, 'arguments')).toBe(false)
    expect(judgeContentBlock(block)).toHaveProperty('ok')
  })
  it.each(['9007199254740993', '1e400', '0.123456789012345678901234567890'])(
    'CLOSE-04 preserves exact numeric source: %s',
    literal => {
      const raw = `{"value":${literal}}`
      expect(writeJsonLossless(argumentsOf(parseCollectedToolCall(opening(), raw)))).toBe(raw)
    },
  )
  it('CLOSE-05 incomplete calls preserve raw values and force both visibility bits false', () => {
    const block = incompleteToolCall(opening(), '{"path":')
    expect(block).toMatchObject({
      complete: false,
      rawArguments: '{"path":',
      visibility: { toHuman: false, toModel: false },
    })
    expect(Object.isFrozen(block)).toBe(true)
    expect(Object.isFrozen(block.visibility)).toBe(true)
    expect(judgeContentBlock(block)).toHaveProperty('ok')
  })
})
