import { describe, expect, it } from 'vitest'
import { ComposerDraftStore } from '../src/model/composer-drafts.ts'

const ref = (key: string) => ({
  storage: 'local',
  key,
  mediaType: 'image/png',
  bytes: '11',
  digest: `sha256:${key}`,
})
const A = { kind: 'image', ref: ref('a') } as const
const B = { kind: 'image', ref: ref('b') } as const

describe('一份草稿的附件', () => {
  it('一个来源交回它的全部附件与备没备好；每个来源都备好才算备好', () => {
    const store = new ComposerDraftStore()
    const { draft } = store.read('s')
    expect(store.read('s')).toEqual({ draft, attachments: [], ready: true })
    store.offer({ session: 's', draft, source: 'media', attachments: [A], ready: false })
    expect(store.read('s')).toEqual({ draft, attachments: [A], ready: false })
    store.offer({ session: 's', draft, source: 'other', attachments: [B], ready: true })
    expect(store.read('s')).toEqual({ draft, attachments: [A, B], ready: false })
    store.offer({ session: 's', draft, source: 'media', attachments: [A], ready: true })
    expect(store.read('s')).toEqual({ draft, attachments: [A, B], ready: true })
    store.offer({ session: 's', draft, source: 'media', attachments: [], ready: true })
    expect(store.read('s')).toEqual({ draft, attachments: [B], ready: true })
  })

  it('取走之后草稿标识换新、附件清空；交回的是旧草稿的，丢弃', () => {
    const store = new ComposerDraftStore()
    const first = store.read('s').draft
    store.offer({ session: 's', draft: first, source: 'media', attachments: [A], ready: true })
    expect(store.take('s')).toEqual([A])
    const second = store.read('s')
    expect(second.draft).not.toBe(first)
    expect(second).toEqual({ draft: second.draft, attachments: [], ready: true })
    store.offer({ session: 's', draft: first, source: 'media', attachments: [B], ready: false })
    expect(store.read('s')).toEqual(second)
  })

  it('各会话各有草稿；没变时读到同一个值；变了通知订阅者，退订之后不再通知', () => {
    const store = new ComposerDraftStore()
    const one = store.read('one')
    const two = store.read('two')
    expect(one.draft).not.toBe(two.draft)
    expect(store.read('one')).toBe(one)
    let told = 0
    const stop = store.subscribe(() => {
      told += 1
    })
    store.offer({ session: 'one', draft: one.draft, source: 'm', attachments: [A], ready: true })
    expect(told).toBe(1)
    expect(store.read('two')).toBe(two)
    store.offer({ session: 'one', draft: 'stale', source: 'm', attachments: [], ready: true })
    expect(told).toBe(1)
    store.take('one')
    expect(told).toBe(2)
    stop()
    store.take('two')
    expect(told).toBe(2)
  })
})
