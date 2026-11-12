// The pure matching rule of `search`, exhaustively: NFKC then lower case on both sides, words by
// white space, every word a substring of the name or the description joined by one newline, no
// words match everything.
import { describe, expect, it } from 'vitest'
import { matches } from '../src/match.ts'

describe('matches', () => {
  it.each([
    ['', true],
    ['   ', true],
    [' \t\n　', true],
  ])('matches everything for the query %j without words', (query, expected) => {
    expect(matches(query, 'review', 'Reviews a change.')).toBe(expected)
    expect(matches(query, 'review', undefined)).toBe(expected)
  })

  it.each([
    ['a word of the name', 'rev', true],
    ['a word of the description', 'change', true],
    ['a word in another case', 'REVIEWS', true],
    ['a word in fullwidth letters', 'ｒｅｖｉｅｗ', true],
    ['a word with a compatibility ligature', 'ﬁx', true],
    ['two words that both match', 'review change', true],
    ['two words of which one matches nothing', 'review nothing', false],
    ['a word that matches nothing', 'nothing', false],
    ['a word that spans the name and the description', 'reviewreviews', false],
    ['a word that spans them with the newline', 'review\nreviews', true],
  ])('%s: %j', (_case, query, expected) => {
    expect(matches(query, 'review', 'Reviews a ﬁx change.')).toBe(expected)
  })

  it('matches only the name when there is no description', () => {
    expect(matches('review', 'review', undefined)).toBe(true)
    expect(matches('change', 'review', undefined)).toBe(false)
    expect(matches('undefined', 'review', undefined)).toBe(false)
  })

  it('folds to lower case, not to upper case', () => {
    // ß has no one-letter upper case: upper case folds it to SS, lower case keeps it.
    expect(matches('ß', 'x', 'strasse')).toBe(false)
    expect(matches('ss', 'x', 'straße')).toBe(false)
    expect(matches('STRASSE', 'x', 'strasse')).toBe(true)
  })

  it('normalizes the name and the description too', () => {
    expect(matches('review', 'REVIEW', undefined)).toBe(true)
    expect(matches('ffice', 'x', 'ﬀice')).toBe(true)
  })

  it('splits the query on any white space, including ideographic space', () => {
    expect(matches('review　change', 'review', 'change')).toBe(true)
    expect(matches('review\tchange\nreview', 'review', 'change')).toBe(true)
  })
})
