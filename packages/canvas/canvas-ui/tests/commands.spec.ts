import { describe, expect, it } from 'vitest'
import { placedOf, touched, UNKNOWN_TEXT, whyNot, type Answer } from '../src/model/commands.ts'

const NOT_UNDERSTOOD = '画布没读懂这一步。'

describe('whyNot', () => {
  it.each<[string, Answer]>([
    ['succeeded', { outcome: 'succeeded', body: { revision: 2 } }],
    ['no change', { outcome: 'no-change', body: {} }],
  ])('%s says nothing', (_, answer) => {
    expect(whyNot(answer)).toBeUndefined()
  })

  it.each<[string, string]>([
    ['not-found', '纸上已经没有它了。'],
    ['denied', '没有权限改这张画布。'],
    ['basis-unavailable', '现在改不了画布，过一会再试。'],
    ['unknown', UNKNOWN_TEXT],
    ['uncertain', UNKNOWN_TEXT],
    ['unavailable', '现在连不上画布，这一步没有发出去。'],
  ])('%s has one sentence, whatever the reason', (outcome, said) => {
    expect(whyNot({ outcome })).toBe(said)
    expect(whyNot({ outcome, body: { reason: 'locked' } })).toBe(said)
  })

  it.each<[string, string, string]>([
    ['conflict', 'locked', '它锁着，先解开才能动。'],
    ['conflict', 'taken', '它已经被拿走了。'],
    ['conflict', 'in-pile', '它在一叠里，先从这一叠拿出来。'],
    ['conflict', 'kind-undeclared', '这一类现在没有声明。'],
    ['conflict', 'full', '纸上摆满了，先拿走几样。'],
    ['conflict', 'not-admitted', '它的拥有者没有接受它。'],
    ['invalid', 'size', '这个大小超出了能摆的范围。'],
    ['invalid', 'spot', '这个位置不在纸上。'],
  ])('%s because %s has its own sentence', (outcome, reason, said) => {
    expect(whyNot({ outcome, body: { reason, entry: { item: 'a' } } })).toBe(said)
  })

  it.each<[string, string]>([
    ['conflict', '现在的样子不允许这一步。'],
    ['invalid', NOT_UNDERSTOOD],
  ])('%s without a reason known here falls back to one sentence', (outcome, said) => {
    expect(whyNot({ outcome })).toBe(said)
    expect(whyNot({ outcome, body: null })).toBe(said)
    expect(whyNot({ outcome, body: 'locked' })).toBe(said)
    expect(whyNot({ outcome, body: { reason: 7 } })).toBe(said)
    expect(whyNot({ outcome, body: { reason: 'spilt' } })).toBe(said)
    expect(whyNot({ outcome, body: { reason: 'constructor' } })).toBe(said)
  })

  it.each(['spilt', 'toString', ''])(
    'an outcome not known here (%j) was not understood',
    outcome => {
      expect(whyNot({ outcome })).toBe(NOT_UNDERSTOOD)
    },
  )
})

describe('placedOf', () => {
  const item = { item: 'a' } as never

  it('an answer that never came back is not known', () => {
    expect(placedOf(undefined)).toEqual({ kind: 'not', why: UNKNOWN_TEXT })
  })

  it('succeeded with the item is placed, no change with the item is there already', () => {
    expect(placedOf({ outcome: 'succeeded', body: { item } })).toEqual({ kind: 'placed', item })
    expect(placedOf({ outcome: 'no-change', body: { item } })).toEqual({ kind: 'there', item })
  })

  it('an answer without the item is not placed, and says why', () => {
    expect(placedOf({ outcome: 'succeeded', body: {} })).toEqual({
      kind: 'not',
      why: NOT_UNDERSTOOD,
    })
    expect(placedOf({ outcome: 'conflict', body: { reason: 'full' } })).toEqual({
      kind: 'not',
      why: '纸上摆满了，先拿走几样。',
    })
  })

  it('an answer that was not done is not placed, even when it names an item', () => {
    expect(placedOf({ outcome: 'conflict', body: { item, reason: 'full' } })).toEqual({
      kind: 'not',
      why: '纸上摆满了，先拿走几样。',
    })
    expect(placedOf({ outcome: 'denied', body: { item } })).toEqual({
      kind: 'not',
      why: '没有权限改这张画布。',
    })
    expect(placedOf({ outcome: 'no-change', body: {} })).toEqual({
      kind: 'not',
      why: NOT_UNDERSTOOD,
    })
  })

  it('an answer without a body says why it was not placed', () => {
    expect(placedOf({ outcome: 'denied' })).toEqual({ kind: 'not', why: '没有权限改这张画布。' })
  })
})

describe('touched', () => {
  it('an arrange is about the items it moves, the piles they go into, and the piles it moves', () => {
    expect(
      touched({
        op: 'arrange',
        body: {
          items: [{ item: 'a', pile: 'p' }, { item: 'b', pile: null }, { item: 'c' }],
          piles: [{ pile: 'q', name: 'Q' }],
        },
      }),
    ).toEqual(['item:a', 'pile:p', 'item:b', 'item:c', 'pile:q'])
    expect(touched({ op: 'arrange', body: {} })).toEqual([])
  })

  it('a pile is about the pile and its items, a scatter about the pile', () => {
    expect(touched({ op: 'pile', body: { pile: 'p', items: ['a', 'b'] } })).toEqual([
      'pile:p',
      'item:a',
      'item:b',
    ])
    expect(touched({ op: 'scatter', body: { pile: 'p' } })).toEqual(['pile:p'])
  })

  it('a take and a lock are about their items, a place about nothing on the sheet yet', () => {
    expect(touched({ op: 'take', body: { items: ['a', 'b'] } })).toEqual(['item:a', 'item:b'])
    expect(touched({ op: 'lock', body: { items: ['a'], locked: true } })).toEqual(['item:a'])
    expect(
      touched({ op: 'place', body: { reference: { kind: 'k', ref: 'r' }, near: { x: 0, y: 0 } } }),
    ).toEqual([])
  })
})
