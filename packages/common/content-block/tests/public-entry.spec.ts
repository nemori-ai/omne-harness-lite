import { expect, it } from 'vitest'
import {
  CONTENT_BLOCK_HEAD_KEYS,
  CONTENT_BLOCK_KINDS,
  judgeBlockIdentity,
  judgeContentBlock,
} from '@omne-harness/content-block'

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

it('rejects an unknown key on a text block', () => {
  expect(
    judgeContentBlock({ kind: 'text', id: 'b1', visibility, text: 'hello', tenant: 'a' }),
  ).toEqual({ rejected: 'extra' })
})

it('rejects an unknown key inside visibility', () => {
  expect(
    judgeContentBlock({
      kind: 'text',
      id: 'b1',
      visibility: { toHuman: true, toModel: false, tenant: 'a' },
      text: 'hello',
    }),
  ).toEqual({ rejected: 'extra' })
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

const ref = {
  storage: 'blob',
  key: 'tool/r1/chart.png',
  mediaType: 'image/png',
  bytes: '2048',
  digest: 'sha256:base64:q1w2e3',
}

it('admits a reference block of each referable kind', () => {
  for (const kind of ['voice', 'image', 'file'] as const) {
    expect(judgeContentBlock({ kind, id: 'r1', visibility, ref, transcript: null })).toEqual({
      ok: { kind, id: 'r1', visibility, ref, transcript: null },
    })
  }
  expect(
    judgeContentBlock({ kind: 'voice', id: 'r2', visibility, ref, transcript: 'hello' }),
  ).toEqual({ ok: { kind: 'voice', id: 'r2', visibility, ref, transcript: 'hello' } })
})

it('admits zero bytes as a reference size', () => {
  const judged = judgeContentBlock({
    kind: 'file',
    id: 'r1',
    visibility,
    ref: { ...ref, bytes: '0' },
    transcript: null,
  })
  expect(judged).toEqual({
    ok: { kind: 'file', id: 'r1', visibility, ref: { ...ref, bytes: '0' }, transcript: null },
  })
})

it('copies the reference instead of keeping the caller object', () => {
  const input = { ...ref }
  const judged = judgeContentBlock({
    kind: 'image',
    id: 'r1',
    visibility,
    ref: input,
    transcript: null,
  })
  if (!('ok' in judged) || !('ref' in judged.ok)) throw new Error('expected a reference block')
  expect(judged.ok.ref).not.toBe(input)
})

it('rejects a reference without a digest or with an empty digest', () => {
  const { digest: _omitted, ...withoutDigest } = ref
  expect(
    judgeContentBlock({
      kind: 'image',
      id: 'r1',
      visibility,
      ref: withoutDigest,
      transcript: null,
    }),
  ).toEqual({ rejected: 'digest' })
  expect(
    judgeContentBlock({
      kind: 'image',
      id: 'r1',
      visibility,
      ref: { ...ref, digest: '' },
      transcript: null,
    }),
  ).toEqual({ rejected: 'digest' })
})

it('rejects bytes that are not a non-negative decimal integer string', () => {
  for (const bytes of ['-1', '01', '1.5', '1e3', '', ' 1', 2048]) {
    expect(
      judgeContentBlock({
        kind: 'image',
        id: 'r1',
        visibility,
        ref: { ...ref, bytes },
        transcript: null,
      }),
    ).toEqual({ rejected: 'bytes' })
  }
})

it('rejects a reference on a kind outside voice, image, and file', () => {
  expect(judgeContentBlock({ kind: 'text', id: 'r1', visibility, ref, transcript: null })).toEqual({
    rejected: 'kind',
  })
  expect(
    judgeContentBlock({ kind: 'thinking', id: 'r1', visibility, ref, transcript: null }),
  ).toEqual({ rejected: 'kind' })
  expect(judgeContentBlock({ kind: 'video', id: 'r1', visibility, ref, transcript: null })).toEqual(
    { rejected: 'kind' },
  )
})

it('rejects empty storage or key and a non-string media type', () => {
  expect(
    judgeContentBlock({
      kind: 'file',
      id: 'r1',
      visibility,
      ref: { ...ref, storage: '' },
      transcript: null,
    }),
  ).toEqual({ rejected: 'storage' })
  expect(
    judgeContentBlock({
      kind: 'file',
      id: 'r1',
      visibility,
      ref: { ...ref, key: '' },
      transcript: null,
    }),
  ).toEqual({ rejected: 'key' })
  expect(
    judgeContentBlock({
      kind: 'file',
      id: 'r1',
      visibility,
      ref: { ...ref, mediaType: 1 },
      transcript: null,
    }),
  ).toEqual({ rejected: 'mediaType' })
})

it('rejects a ref that is not an object', () => {
  expect(
    judgeContentBlock({ kind: 'image', id: 'r1', visibility, ref: 'blob://k', transcript: null }),
  ).toEqual({ rejected: 'ref' })
  expect(
    judgeContentBlock({ kind: 'image', id: 'r1', visibility, ref: null, transcript: null }),
  ).toEqual({ rejected: 'ref' })
})

it('rejects a missing or non-string transcript', () => {
  expect(judgeContentBlock({ kind: 'voice', id: 'r1', visibility, ref })).toEqual({
    rejected: 'transcript',
  })
  expect(judgeContentBlock({ kind: 'voice', id: 'r1', visibility, ref, transcript: 1 })).toEqual({
    rejected: 'transcript',
  })
})

it('rejects a reference block that also carries inline, text, or another location', () => {
  expect(
    judgeContentBlock({
      kind: 'image',
      id: 'r1',
      visibility,
      ref,
      transcript: null,
      mediaType: 'image/png',
      inline: 'png',
    }),
  ).toEqual({ rejected: 'extra' })
  expect(
    judgeContentBlock({ kind: 'voice', id: 'r1', visibility, ref, transcript: null, text: 'hi' }),
  ).toEqual({ rejected: 'extra' })
  expect(
    judgeContentBlock({
      kind: 'file',
      id: 'r1',
      visibility,
      ref,
      transcript: null,
      storage: 'blob',
      key: 'k',
    }),
  ).toEqual({ rejected: 'extra' })
})

it('rejects an unknown key inside ref', () => {
  expect(
    judgeContentBlock({
      kind: 'image',
      id: 'r1',
      visibility,
      ref: { ...ref, url: 'https://example.test/chart.png' },
      transcript: null,
    }),
  ).toEqual({ rejected: 'extra' })
})

it('applies id and visibility rules to reference blocks', () => {
  expect(judgeContentBlock({ kind: 'image', id: '', visibility, ref, transcript: null })).toEqual({
    rejected: 'id',
  })
  expect(judgeContentBlock({ kind: 'image', id: 'r1', ref, transcript: null })).toEqual({
    rejected: 'visibility',
  })
})

it('exports the head keys of each closed kind, derived from the block table', () => {
  expect(CONTENT_BLOCK_HEAD_KEYS).toEqual({
    text: ['kind', 'id', 'visibility'],
    thinking: ['kind', 'id', 'visibility'],
    voice: ['kind', 'id', 'visibility', 'mediaType'],
    image: ['kind', 'id', 'visibility', 'mediaType'],
    file: ['kind', 'id', 'visibility', 'storage', 'key', 'mediaType'],
  })
  expect(Object.keys(CONTENT_BLOCK_HEAD_KEYS)).toEqual([...CONTENT_BLOCK_KINDS])
})

it('head keys are what an admitted block carries besides its body field', () => {
  const bodyFields = { text: 'text', thinking: 'text', voice: 'inline', image: 'inline' } as const
  for (const kind of CONTENT_BLOCK_KINDS) {
    const body = kind === 'file' ? undefined : bodyFields[kind]
    const full: Record<string, unknown> = { kind, id: 'b1', visibility }
    for (const key of CONTENT_BLOCK_HEAD_KEYS[kind]) full[key] ??= 'x'
    if (body !== undefined) full[body] = 'x'
    const judged = judgeContentBlock(full)
    if (!('ok' in judged)) throw new Error('expected ok')
    expect(Object.keys(judged.ok).sort()).toEqual(
      [...CONTENT_BLOCK_HEAD_KEYS[kind], ...(body === undefined ? [] : [body])].sort(),
    )
  }
})

it('judgeBlockIdentity returns the id and a fresh visibility', () => {
  const given = { toHuman: true, toModel: false }
  const judged = judgeBlockIdentity({ id: 'b1', visibility: given, kind: 'whatever' })
  expect(judged).toEqual({ ok: { id: 'b1', visibility: given } })
  if (!('ok' in judged)) throw new Error('expected ok')
  expect(judged.ok.visibility).not.toBe(given)
  given.toHuman = false
  expect(judged.ok.visibility).toEqual({ toHuman: true, toModel: false })
})

it('judgeBlockIdentity rejects a bad id, a bad visibility, and an unknown visibility key', () => {
  expect(judgeBlockIdentity({ visibility })).toEqual({ rejected: 'id' })
  expect(judgeBlockIdentity({ id: '', visibility })).toEqual({ rejected: 'id' })
  expect(judgeBlockIdentity({ id: 1, visibility })).toEqual({ rejected: 'id' })
  expect(judgeBlockIdentity({ id: 'b1' })).toEqual({ rejected: 'visibility' })
  expect(judgeBlockIdentity({ id: 'b1', visibility: { toHuman: 'yes', toModel: true } })).toEqual({
    rejected: 'visibility',
  })
  expect(judgeBlockIdentity({ id: 'b1', visibility: [] })).toEqual({ rejected: 'visibility' })
  expect(
    judgeBlockIdentity({ id: 'b1', visibility: { toHuman: true, toModel: false, tenant: 'a' } }),
  ).toEqual({ rejected: 'extra' })
})

it('judgeBlockIdentity reports the unknown visibility key before a bad id', () => {
  expect(
    judgeBlockIdentity({ id: '', visibility: { toHuman: true, toModel: false, tenant: 'a' } }),
  ).toEqual({ rejected: 'extra' })
})

it('judgeBlockIdentity rejects what is not an object', () => {
  expect(judgeBlockIdentity(null)).toEqual({ rejected: 'id' })
  expect(judgeBlockIdentity('b1')).toEqual({ rejected: 'id' })
  expect(judgeBlockIdentity([])).toEqual({ rejected: 'id' })
})

it('gives a reference block a fresh visibility instead of the caller object', () => {
  const given = { toHuman: true, toModel: false }
  const judged = judgeContentBlock({
    kind: 'image',
    id: 'r1',
    visibility: given,
    ref,
    transcript: null,
  })
  if (!('ok' in judged)) throw new Error('expected ok')
  expect(judged.ok.visibility).not.toBe(given)
  given.toHuman = false
  expect(judged.ok.visibility).toEqual({ toHuman: true, toModel: false })
})
