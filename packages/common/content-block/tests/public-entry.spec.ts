import { expect, it } from 'vitest'
import { CONTENT_BLOCK_KINDS, judgeContentBlock } from '@omne-harness/content-block'

const visibility = { toHuman: true, toModel: false }

it('exports the five closed content kinds', () => {
  expect([...CONTENT_BLOCK_KINDS]).toEqual(['text', 'thinking', 'voice', 'image', 'file'])
})

it('admits each closed kind', () => {
  expect(judgeContentBlock({ kind: 'text', id: 'b1', visibility, text: 'hello' })).toEqual({
    ok: { kind: 'text', id: 'b1', visibility, text: 'hello' },
  })
  expect(judgeContentBlock({ kind: 'thinking', id: 'b2', visibility, text: 'note' })).toEqual({
    ok: { kind: 'thinking', id: 'b2', visibility, text: 'note' },
  })
  expect(
    judgeContentBlock({
      kind: 'voice',
      id: 'b3',
      visibility,
      mediaType: 'audio/ogg',
      inline: 'ogg',
    }),
  ).toEqual({
    ok: { kind: 'voice', id: 'b3', visibility, mediaType: 'audio/ogg', inline: 'ogg' },
  })
  expect(
    judgeContentBlock({
      kind: 'image',
      id: 'b4',
      visibility,
      mediaType: 'image/png',
      inline: 'png',
    }),
  ).toEqual({
    ok: { kind: 'image', id: 'b4', visibility, mediaType: 'image/png', inline: 'png' },
  })
  expect(
    judgeContentBlock({
      kind: 'file',
      id: 'b5',
      visibility,
      storage: 'blob',
      key: 'k',
      mediaType: 'application/pdf',
    }),
  ).toEqual({
    ok: {
      kind: 'file',
      id: 'b5',
      visibility,
      storage: 'blob',
      key: 'k',
      mediaType: 'application/pdf',
    },
  })
})

it('rejects a tool call and a missing kind', () => {
  expect(judgeContentBlock({ kind: 'tool_call', id: 'b1', visibility })).toEqual({
    rejected: 'kind',
  })
  expect(judgeContentBlock({ id: 'b1', visibility, text: 'hello' })).toEqual({ rejected: 'kind' })
})

it('rejects a missing or empty id', () => {
  expect(judgeContentBlock({ kind: 'text', visibility, text: 'hello' })).toEqual({ rejected: 'id' })
  expect(judgeContentBlock({ kind: 'text', id: '', visibility, text: 'hello' })).toEqual({
    rejected: 'id',
  })
  expect(judgeContentBlock({ kind: 'text', id: 1, visibility, text: 'hello' })).toEqual({
    rejected: 'id',
  })
})

it('rejects visibility that is not two booleans', () => {
  expect(judgeContentBlock({ kind: 'text', id: 'b1', text: 'hello' })).toEqual({
    rejected: 'visibility',
  })
  expect(
    judgeContentBlock({
      kind: 'text',
      id: 'b1',
      visibility: { toHuman: 'yes', toModel: true },
      text: 'hello',
    }),
  ).toEqual({
    rejected: 'visibility',
  })
})

it('rejects a text or thinking block without text', () => {
  expect(judgeContentBlock({ kind: 'text', id: 'b1', visibility })).toEqual({ rejected: 'text' })
  expect(judgeContentBlock({ kind: 'thinking', id: 'b2', visibility, text: 1 })).toEqual({
    rejected: 'text',
  })
})

it('rejects voice or image without media fields', () => {
  expect(
    judgeContentBlock({ kind: 'voice', id: 'b3', visibility, mediaType: 'audio/ogg' }),
  ).toEqual({
    rejected: 'media',
  })
  expect(judgeContentBlock({ kind: 'image', id: 'b4', visibility, inline: 'png' })).toEqual({
    rejected: 'media',
  })
})

it('rejects a file block that is missing a file field', () => {
  expect(
    judgeContentBlock({
      kind: 'file',
      id: 'b5',
      visibility,
      storage: 'blob',
      mediaType: 'application/pdf',
    }),
  ).toEqual({ rejected: 'file' })
})
