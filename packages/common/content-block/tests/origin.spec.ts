import { CONTENT_BLOCK_HEAD_KEYS, judgeContentBlock } from '@omne-harness/content-block'
import { describe, expect, it } from 'vitest'

const visibility = { toHuman: true, toModel: true }
const plain = { kind: 'text', id: 'b1', visibility, text: '正文' }
const origin = { name: 'skill:review', layer: 'tenant', version: '3', digest: 'sha-1' }

describe('the origin of a text block', () => {
  it('a text block without one is judged as before, key for key', () => {
    expect(judgeContentBlock(plain)).toEqual({ ok: plain })
    expect(Object.keys((judgeContentBlock(plain) as { ok: object }).ok)).toEqual([
      'kind',
      'id',
      'visibility',
      'text',
    ])
  })

  it('a text block may say where it came from: a full name, a layer, a version and a digest', () => {
    expect(judgeContentBlock({ ...plain, origin })).toEqual({ ok: { ...plain, origin } })
  })

  it.each([
    ['a missing field', { name: 'skill:review', layer: 'tenant', version: '3' }],
    ['an extra field', { ...origin, by: 'me' }],
    ['an empty name', { ...origin, name: '' }],
    ['a number', { ...origin, version: 3 }],
    ['not an object', 'skill:review'],
  ])('refuses an origin with %s', (_what, given) => {
    expect(judgeContentBlock({ ...plain, origin: given })).toEqual({ rejected: 'origin' })
  })

  it('only a text block may carry one, and it is no head key of a streamed block', () => {
    expect(judgeContentBlock({ ...plain, kind: 'thinking', origin })).toEqual({ rejected: 'extra' })
    expect(CONTENT_BLOCK_HEAD_KEYS.text).toEqual(['kind', 'id', 'visibility'])
  })
})
