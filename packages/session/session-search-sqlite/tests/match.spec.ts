import { describe, expect, it } from 'vitest'
import type { GramPlan } from '@omne-harness/session-search'
import { ALL, matchOf, sessionMarker } from '../src/match.ts'

const gram = (text: string): GramPlan => ({ kind: 'gram', gram: text })
const short = (prefix: string): GramPlan => ({ kind: 'short', prefix })
const vocabulary = (terms: Readonly<Record<string, readonly string[]>>, limit = 3) => ({
  expand: (prefix: string) => terms[prefix] ?? [],
  limit,
})
const none = vocabulary({})

describe('the MATCH expression of a plan', () => {
  it('quotes each trigram and combines them as the plan says', () => {
    expect(matchOf(gram('abc'), null, none)).toBe('"abc"')
    expect(matchOf(gram('a"c'), null, none)).toBe('"a""c"')
    expect(matchOf({ kind: 'and', of: [gram('abc'), gram('bcd')] }, null, none)).toBe(
      '("abc" AND "bcd")',
    )
    expect(matchOf({ kind: 'or', of: [gram('abc'), gram('bcd')] }, null, none)).toBe(
      '("abc" OR "bcd")',
    )
    expect(
      matchOf(
        { kind: 'and', of: [gram('abc'), { kind: 'or', of: [gram('x y'), gram('z"z')] }] },
        null,
        none,
      ),
    ).toBe('("abc" AND ("x y" OR "z""z"))')
  })

  it('says ALL when nothing narrows, alone or in a conjunction of nothing else', () => {
    expect(matchOf({ kind: 'any' }, null, none)).toBe(ALL)
    expect(matchOf({ kind: 'and', of: [{ kind: 'any' }, gram('abc')] }, null, none)).toBe('"abc"')
    expect(matchOf({ kind: 'or', of: [{ kind: 'any' }, gram('abc')] }, null, none)).toBe(ALL)
  })

  it('expands two code points through the vocabulary of the index', () => {
    const terms = vocabulary({ ab: ['abc', 'abd'], zz: [], many: ['m1x', 'm2x', 'm3x', 'm4x'] })
    expect(matchOf(short('ab'), null, terms)).toBe('("abc" OR "abd")')
    expect(matchOf(short('ab'), null, vocabulary({ ab: ['ab\u0001'] }))).toBe('"ab\u0001"')
  })

  it('says null when no document can hold the two code points: nothing matches, without asking', () => {
    const terms = vocabulary({ ab: ['abc'] })
    expect(matchOf(short('zz'), null, terms)).toBeNull()
    expect(matchOf({ kind: 'and', of: [gram('abc'), short('zz')] }, null, terms)).toBeNull()
    expect(matchOf({ kind: 'or', of: [gram('abc'), short('zz')] }, null, terms)).toBe('"abc"')
    expect(matchOf({ kind: 'or', of: [short('zz'), short('zz')] }, null, terms)).toBeNull()
  })

  it('stops narrowing by two code points that expand to more terms than the limit', () => {
    const terms = vocabulary({ ab: ['ab1', 'ab2', 'ab3', 'ab4'], cd: ['cd1', 'cd2', 'cd3'] })
    expect(matchOf(short('ab'), null, terms)).toBe(ALL)
    expect(matchOf(short('cd'), null, terms)).toBe('("cd1" OR "cd2" OR "cd3")')
    expect(matchOf({ kind: 'and', of: [short('ab'), gram('xyz')] }, null, terms)).toBe('"xyz"')
  })

  it('narrows to the sessions of a scope by their markers', () => {
    expect(matchOf(gram('abc'), [0, 5], none)).toBe(
      `("abc" AND ("${sessionMarker(0)}" OR "${sessionMarker(5)}"))`,
    )
    expect(matchOf({ kind: 'any' }, [7], none)).toBe(`"${sessionMarker(7)}"`)
    expect(matchOf(gram('abc'), [], none)).toBeNull()
    expect(matchOf({ kind: 'any' }, null, none)).toBe(ALL)
  })
})

describe('the marker of a session', () => {
  it('is one trigram, different for every session, made of no code point a text can hold', () => {
    const markers = [0, 1, 4095, 4096, 0xffffff].map(sessionMarker)
    expect(new Set(markers).size).toBe(markers.length)
    for (const marker of markers) {
      expect(marker).toHaveLength(3)
      expect(marker.startsWith('\u0004')).toBe(true)
    }
    expect(sessionMarker(4096)).toBe('\u0004')
    expect(sessionMarker(4095)).toBe('\u0004')
  })

  it('refuses a number it cannot write', () => {
    for (const ordinal of [-1, 0x1000000, 1.5, Number.NaN])
      expect(() => sessionMarker(ordinal)).toThrow(RangeError)
  })
})
