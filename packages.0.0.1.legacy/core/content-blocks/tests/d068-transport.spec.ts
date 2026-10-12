import { expect, it } from 'vitest'
import { judgeContentBlock, writeJsonLossless } from '@omne-harness-lite/content-blocks'

it('D068 S12 retains received bad names and unparsed duplicate keys/large numbers verbatim', () => {
  const rawArguments = '{"n":9007199254740993,"n":1e400,"money":1.000000000000000000001}'
  const input = {
    id: 'b_raw',
    kind: 'tool_call',
    complete: true,
    callId: 'call_raw',
    tool: ' bad:name\n',
    rawArguments,
    unparseable: true,
    visibility: { toHuman: true, toModel: true },
  }
  const before = writeJsonLossless(input)
  const result = judgeContentBlock(input)
  expect(result).toHaveProperty('ok')
  if (!('ok' in result) || result.ok.kind !== 'tool_call' || !result.ok.complete)
    throw new Error('expected complete raw call')
  expect(result.ok.rawArguments).toBe(rawArguments)
  expect(result.ok.tool).toBe(input.tool)
  expect(Object.hasOwn(result.ok, 'arguments')).toBe(false)
  expect(writeJsonLossless(result.ok)).toBe(before)
  expect(writeJsonLossless(input)).toBe(before)
  expect(Object.isFrozen(input)).toBe(false)
  expect(Object.isFrozen(input.visibility)).toBe(false)
  expect(Object.isFrozen(result.ok)).toBe(true)
  expect(Object.isFrozen(result.ok.visibility)).toBe(true)
})
