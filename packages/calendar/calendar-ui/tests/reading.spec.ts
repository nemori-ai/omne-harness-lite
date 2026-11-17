import { describe, expect, it } from 'vitest'
import { readingOf, readOnce } from '../src/model/reading.ts'

describe('readingOf: every answer of a read has one place on the page', () => {
  it('succeeded is read, with the body', () => {
    expect(readingOf({ outcome: 'succeeded', body: { a: 1 } })).toEqual({
      kind: 'read',
      value: { a: 1 },
    })
  })

  it.each(['denied', 'basis-unavailable', 'protocol-rejected', 'unavailable', 'uncertain'])(
    '%s is unreadable, never an empty result',
    outcome => {
      expect(readingOf({ outcome })).toEqual({ kind: 'unreadable', reason: outcome })
    },
  )

  it.each(['invalid', 'unsupported', 'not-visible'])(
    '%s is the domain refusing, with its body',
    outcome => {
      expect(readingOf({ outcome, body: { reason: 'coverage' } })).toEqual({
        kind: 'refused',
        outcome,
        body: { reason: 'coverage' },
      })
    },
  )
})

describe('readOnce', () => {
  it('a body the contract refuses never leaves: not sent, not thrown', async () => {
    expect(await readOnce(() => Promise.reject(new Error('refused body')))).toEqual({
      kind: 'unreadable',
      reason: 'not-sent',
    })
  })

  it('passes an answer through readingOf', async () => {
    expect(await readOnce(() => Promise.resolve({ outcome: 'uncertain' }))).toEqual({
      kind: 'unreadable',
      reason: 'uncertain',
    })
  })
})

describe('UNREADABLE_TEXT', () => {
  it('every reason a read gives nothing says its own sentence', async () => {
    const { UNREADABLE_TEXT } = await import('../src/model/reading.ts')
    const texts = Object.values(UNREADABLE_TEXT)
    expect(Object.keys(UNREADABLE_TEXT).sort()).toEqual(
      [
        'basis-unavailable',
        'denied',
        'not-sent',
        'protocol-rejected',
        'uncertain',
        'unavailable',
      ].sort(),
    )
    expect(texts.every(text => text.length > 0)).toBe(true)
    expect(new Set(texts).size).toBe(texts.length)
  })
})
