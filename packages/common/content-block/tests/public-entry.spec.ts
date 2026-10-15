import { expect, it } from 'vitest'
import { CONTENT_BLOCK_KINDS, judgeContentBlock } from '@omne-harness/content-block'

it('exports the five closed content kinds', () => {
  expect([...CONTENT_BLOCK_KINDS]).toEqual(['text', 'thinking', 'voice', 'image', 'file'])
})

it('rejects a tool call', () => {
  expect(judgeContentBlock({ kind: 'tool_call', id: 'b1', visibility: { toHuman: true, toModel: true } })).toEqual({
    rejected: 'kind',
  })
})

it('admits a closed text block', () => {
  expect(
    judgeContentBlock({
      kind: 'text',
      id: 'b1',
      visibility: { toHuman: true, toModel: true },
      text: 'hello',
    }),
  ).toEqual({
    ok: { kind: 'text', id: 'b1', visibility: { toHuman: true, toModel: true }, text: 'hello' },
  })
})
