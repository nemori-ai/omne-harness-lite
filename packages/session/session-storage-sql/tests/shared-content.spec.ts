import { expect, it } from 'vitest'
import { blobDigest, canonicalText } from '../src/codec.ts'
import { expandContent, splitContent } from '../src/shared-content.ts'

const message = {
  role: 'compaction',
  id: 'msg_abcdefghijklmnopqrstuv',
  blocks: [
    {
      kind: 'text',
      id: 'summary',
      text: 'unique summary body',
      visibility: { toModel: true, toHuman: true },
    },
  ],
  covers: { from: '1', to: '5' },
  retained: [],
  derivation: { owner: 'provider', record: 'r', revision: '1', digest: 'd' },
}

it('stores one complete message body for custody, handoff and its outcome without changing their logical content', () => {
  const values = [
    { outcome: { kind: 'completed', message } },
    { candidate: message, source: { transition: { message } } },
    { request: { candidate: message }, decision: { message } },
  ]
  const store = new Map<string, string>()
  const roots = values.map(value => {
    const original = canonicalText(value)
    const split = splitContent(original, 'application/json')
    for (const child of split.children) store.set(child.digest, child.payload)
    expect(split.payload).not.toContain('unique summary body')
    return { original, split }
  })
  expect([...store.values()]).toEqual([canonicalText(message)])
  for (const { original, split } of roots) {
    const restored = expandContent(split.payload, split.media, digest => {
      const body = store.get(digest)
      if (body === undefined) throw new Error('missing body')
      return body
    })
    expect(restored).toEqual({ payload: original, media: 'application/json' })
    expect(blobDigest(restored.payload)).toBe(blobDigest(original))
  }
})

it('preserves user-shaped markers and refuses a missing or changed shared body', () => {
  const original = canonicalText({
    message,
    user: { path: ['message'], digest: 'fake', value: null },
  })
  const split = splitContent(original, 'application/json')
  expect(() =>
    expandContent(split.payload, split.media, () => {
      throw new Error('missing')
    }),
  ).toThrow('missing')
  expect(() =>
    expandContent(split.payload, split.media, () => canonicalText({ ...message, retained: ['1'] })),
  ).toThrow('digest')
  expect(expandContent(split.payload, split.media, () => canonicalText(message)).payload).toBe(
    original,
  )
})
