import { describe, expect, it } from 'vitest'
import { ANY, and, or, planAdmits, type GramPlan } from '../src/plan.ts'
import { LIMITS } from './support.ts'

const gram = (text: string): GramPlan => ({ kind: 'gram', gram: text })
const short: GramPlan = { kind: 'short', prefix: 'ab' }

describe('how plans combine: a combination never narrows more than its parts allow', () => {
  it('lets an alternation narrow nothing as soon as one branch narrows nothing (SH-1)', () => {
    expect(or([gram('abc'), ANY], LIMITS)).toEqual(ANY)
    expect(or([ANY], LIMITS)).toEqual(ANY)
    expect(or([], LIMITS)).toEqual(ANY)
    expect(or([gram('abc'), { kind: 'or', of: [gram('def'), ANY] }], LIMITS)).toEqual(ANY)
  })

  it('keeps an alternation of narrowing branches, flat and without repeats', () => {
    expect(or([gram('abc'), short], LIMITS)).toEqual({ kind: 'or', of: [gram('abc'), short] })
    expect(or([gram('abc'), { kind: 'or', of: [gram('def'), gram('abc')] }], LIMITS)).toEqual({
      kind: 'or',
      of: [gram('abc'), gram('def')],
    })
    expect(or([gram('abc'), gram('abc')], LIMITS)).toEqual(gram('abc'))
  })

  it('drops from a conjunction what narrows nothing, and is nothing when nothing is left', () => {
    expect(and([ANY, gram('abc'), ANY])).toEqual(gram('abc'))
    expect(and([ANY, ANY])).toEqual(ANY)
    expect(and([])).toEqual(ANY)
    expect(and([gram('abc'), { kind: 'and', of: [gram('def'), gram('abc')] }])).toEqual({
      kind: 'and',
      of: [gram('abc'), gram('def')],
    })
  })

  it('reads a plan against a text the way the index does', () => {
    expect(planAdmits(ANY, '')).toBe(true)
    expect(planAdmits(gram('abc'), 'xabcx')).toBe(true)
    expect(planAdmits(gram('abc'), 'ab c')).toBe(false)
    expect(planAdmits(short, 'xab')).toBe(true)
    expect(planAdmits(short, 'a b')).toBe(false)
    expect(planAdmits({ kind: 'and', of: [gram('abc'), gram('xyz')] }, 'abc')).toBe(false)
    expect(planAdmits({ kind: 'and', of: [gram('abc'), gram('xyz')] }, 'xyzabc')).toBe(true)
    expect(planAdmits({ kind: 'or', of: [gram('abc'), gram('xyz')] }, 'xyz')).toBe(true)
    expect(planAdmits({ kind: 'or', of: [gram('abc'), gram('xyz')] }, 'ab yz')).toBe(false)
  })
})
