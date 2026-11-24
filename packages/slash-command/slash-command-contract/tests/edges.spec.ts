import {
  codeMask,
  isFullName,
  isName,
  judgeListing,
  lookupOf,
  NAME_MAX,
  placeOf,
  recognize,
  RESERVED_SPACE,
  unescape,
} from '@omne-harness/slash-command-contract'
import { describe, expect, it } from 'vitest'
import { entries, outcome } from './fixture.ts'

const lookup = lookupOf({ entries, missing: [] })
const masked = (text: string): string => [...codeMask(text)].map(bit => String(bit)).join('')

describe('names', () => {
  it.each([
    ['review', true],
    ['deploy-check', true],
    ['a1-b2', true],
    ['Review', false],
    ['-review', false],
    ['review-', false],
    ['re view', false],
    ['x review', false],
    ['review x', false],
    ['', false],
  ])('isName(%j) is %s', (text, wanted) => expect(isName(text)).toBe(wanted))

  it.each([
    ['skill:review', true],
    ['omne-official:model', true],
    [':review', false],
    ['skill:', false],
    ['review', false],
    ['skill:re view', false],
    ['sk ill:review', false],
    [`skill:${'a'.repeat(NAME_MAX - 6)}`, true],
    [`skill:${'a'.repeat(NAME_MAX - 5)}`, false],
  ])('isFullName(%j) is %s', (text, wanted) => expect(isFullName(text)).toBe(wanted))

  it('places a reference anywhere and every other kind at the head; the reserved space is omne-official', () => {
    expect([placeOf('reference'), placeOf('prompt'), placeOf('system')]).toEqual([
      'anywhere',
      'head',
      'head',
    ])
    expect(RESERVED_SPACE).toBe('omne-official')
  })

  it('reads a typed name of at most NAME_MAX characters; a longer one is no candidate at all', () => {
    expect(outcome(recognize(`/${'a'.repeat(NAME_MAX)}`, lookup))).toBe('X:no-such-command')
    expect(outcome(recognize(`/${'a'.repeat(NAME_MAX + 1)}`, lookup))).toBe('T')
  })
})

describe('code is never read for commands', () => {
  it.each([
    ['a `b` c', '0011100'],
    ['`a\nb`', '00000'],
    ['```x``` y', '111111100'],
    ['a ```x', '001111'],
    ['```a``````b```', '11111111111111'],
    ['``', '11'],
  ])('masks %j as %s', (text, wanted) => expect(masked(text)).toBe(wanted))

  it('drops only a backslash that stands before a slash outside code', () => {
    expect(unescape('a\\b c/d \\/e `\\/f`')).toBe('a\\b c/d /e `\\/f`')
    expect(unescape('\\\\/x')).toBe('\\/x')
  })
})

describe('references', () => {
  it('marks only the first mention of each entry as first', () => {
    const said = recognize('用 /review 和 /review，再 /tmp', lookup)
    expect(
      said.kind === 'message' &&
        said.references.map(reference => [reference.name, reference.first]),
    ).toEqual([
      ['skill:review', true],
      ['skill:review', false],
      ['skill:tmp', true],
    ])
  })

  it('keeps reading right after a name that a closing mark ends', () => {
    expect(outcome(recognize('(/review)/deploy-check', lookup))).toBe(
      'R:skill:review,skill:deploy-check',
    )
    expect(outcome(recognize('用 /skill:deploy-check 看', lookup))).toBe('R:skill:deploy-check')
    expect(outcome(recognize('用 /skill:code-review 看', lookup))).toBe('R:skill:code-review')
  })
})

describe('a listing a source hands over', () => {
  const official = { source: { space: RESERVED_SPACE }, official: true }
  const tenant = { source: { space: 'skill' }, official: false }
  const entry = (space: string, name: string) =>
    ({ space, name, kind: 'reference', title: name }) as const

  it('counts only entries of its own namespace, without repeats', () => {
    expect(judgeListing(tenant, [entry('skill', 'a'), entry('skill', 'b')])).toEqual({
      ok: [entry('skill', 'a'), entry('skill', 'b')],
    })
    expect(judgeListing(tenant, [entry('prompt', 'a')])).toEqual({
      failure: { name: 'prompt:a', reason: 'outside-space' },
    })
    expect(judgeListing(tenant, [entry('skill', 'a'), entry('skill', 'a')])).toEqual({
      failure: { name: 'skill:a', reason: 'duplicate' },
    })
    expect(judgeListing(tenant, [entry('skill', 'A')])).toEqual({
      failure: { name: 'skill:A', reason: 'bad-name' },
    })
  })

  it('lets only an official source use the reserved namespace', () => {
    expect(judgeListing(official, [entry(RESERVED_SPACE, 'model')])).toEqual({
      ok: [entry(RESERVED_SPACE, 'model')],
    })
    expect(
      judgeListing({ ...official, official: false }, [entry(RESERVED_SPACE, 'model')]),
    ).toEqual({
      failure: { name: 'omne-official:model', reason: 'reserved-space' },
    })
  })
})
