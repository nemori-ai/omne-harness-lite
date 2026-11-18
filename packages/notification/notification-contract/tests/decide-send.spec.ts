import { describe, expect, it } from 'vitest'
import {
  decideSend,
  precheckSend,
  type NamedCheck,
  type SendLimits,
  type SourceLookup,
} from '@omne-harness/notification-contract'
import { agent, declaration, declared, event, identity, person } from './fixtures.ts'

const limits: SendLimits = { bodyLength: 100, causalDepth: 3 }
const registered: SourceLookup = { kind: 'registered', declaration: declaration() }
const request = (overrides: Parameters<typeof event>[0] = {}) => ({
  identity: identity('e1'),
  event: event(overrides),
})
const named = (ref = agent('a'), admissible: NamedCheck['admissible'] = 'allowed'): NamedCheck => ({
  recipient: ref,
  admissible,
})
const refused = (reason: string) => ({ kind: 'refused', reason })

describe('precheckSend: size, then authority', () => {
  it('refuses a body above the configured limit before it asks about authority', () => {
    const big = request({ content: { title: 'T', body: 'x'.repeat(101), locator: null } })
    expect(precheckSend(big, 'denied', limits)).toEqual(refused('too-large'))
    expect(precheckSend(big, 'unavailable', limits)).toEqual(refused('too-large'))
  })

  it('accepts a body at the limit', () => {
    const edge = request({ content: { title: 'T', body: 'x'.repeat(100), locator: null } })
    expect(precheckSend(edge, 'allowed', limits)).toEqual({ kind: 'proceed' })
  })

  it('maps the three answers of the authority', () => {
    expect(precheckSend(request(), 'allowed', limits)).toEqual({ kind: 'proceed' })
    expect(precheckSend(request(), 'denied', limits)).toEqual(refused('not-permitted'))
    expect(precheckSend(request(), 'unavailable', limits)).toEqual({ kind: 'basis-unavailable' })
  })
})

describe('decideSend: recall, then the source, then naming, then depth', () => {
  it('proceeds with the declared type', () => {
    expect(decideSend(null, request(), registered, [], limits)).toEqual({
      kind: 'proceed',
      declared: declared(),
    })
  })

  describe('an identity that was accepted before', () => {
    const known = { event: event() }

    it.each([
      ['absent', { kind: 'absent' }],
      ['unreadable', { kind: 'unreadable' }],
      ['registered', registered],
    ] as const)('is recalled while the source is %s', (_case, lookup) => {
      expect(decideSend(known, request(), lookup, [], limits)).toEqual({ kind: 'recalled' })
    })

    it('is recalled when only the instant, the renotify switch or the origin differ', () => {
      const again = request({
        at: '2026-11-18T07:00:00.000Z',
        renotify: true,
        origin: { emitter: person, depth: 9 },
      })
      expect(decideSend(known, again, registered, [], limits)).toEqual({ kind: 'recalled' })
    })

    it.each([
      ['type', { type: 'other' }],
      ['subject', { subject: 'repo/b' }],
      ['title', { content: { title: 'Other', body: 'It changed.', locator: null } }],
      ['body', { content: { title: 'Changed', body: 'Other.', locator: null } }],
      [
        'locator',
        { content: { title: 'Changed', body: 'It changed.', locator: { kind: 'x', ref: 'y' } } },
      ],
      ['named recipients', { named: [person] }],
      ['replace key', { replaceKey: 'k' }],
    ])('conflicts when the %s differs', (_case, overrides) => {
      expect(decideSend(known, request(overrides), registered, [], limits)).toEqual(
        refused('conflict'),
      )
    })
  })

  it.each([
    ['absent', { kind: 'absent' }],
    ['unreadable', { kind: 'unreadable' }],
  ] as const)('answers basis-unavailable while the source is %s', (_case, lookup) => {
    expect(decideSend(null, request(), lookup, [], limits)).toEqual({ kind: 'basis-unavailable' })
  })

  it('refuses a type the source did not declare', () => {
    expect(decideSend(null, request({ type: 'other' }), registered, [], limits)).toEqual(
      refused('unknown-event-type'),
    )
  })

  it('refuses a standing type', () => {
    const standing: SourceLookup = {
      kind: 'registered',
      declaration: declaration(declared({ kind: { kind: 'standing', binding: 'b' } })),
    }
    expect(decideSend(null, request(), standing, [], limits)).toEqual(refused('standing-type'))
  })

  it.each([
    ['a subject where the type takes none', { presence: 'none', hint: '' }, 'repo/a'],
    ['no subject where the type requires one', { presence: 'required', hint: '' }, null],
    [
      'a subject the type does not accept',
      { presence: 'optional', hint: '', accepts: () => false },
      'repo/a',
    ],
  ] as const)('refuses %s', (_case, subject, value) => {
    const lookup: SourceLookup = {
      kind: 'registered',
      declaration: declaration(declared({ subject })),
    }
    expect(decideSend(null, request({ subject: value }), lookup, [], limits)).toEqual(
      refused('invalid-subject'),
    )
  })

  it('refuses naming a kind the type does not allow', () => {
    const lookup: SourceLookup = {
      kind: 'registered',
      declaration: declaration(declared({ nameable: ['person'] })),
    }
    const naming = request({ named: [agent('a')] })
    expect(decideSend(null, naming, lookup, [named()], limits)).toEqual(
      refused('naming-not-allowed'),
    )
    const none: SourceLookup = {
      kind: 'registered',
      declaration: declaration(declared({ nameable: [] })),
    }
    expect(decideSend(null, request({ named: [person] }), none, [named(person)], limits)).toEqual(
      refused('naming-not-allowed'),
    )
  })

  it('refuses a named recipient that is not admissible in this tenant', () => {
    const naming = request({ named: [agent('a')] })
    expect(decideSend(null, naming, registered, [named(agent('a'), 'denied')], limits)).toEqual(
      refused('recipient-not-admissible'),
    )
    expect(decideSend(null, naming, registered, [], limits)).toEqual(
      refused('recipient-not-admissible'),
    )
  })

  it('proceeds when every named recipient is admissible', () => {
    const naming = request({ named: [agent('a'), person] })
    const checks = [named(agent('a')), named(person)]
    expect(decideSend(null, naming, registered, checks, limits)).toHaveProperty('kind', 'proceed')
  })

  it('conflicts when only the reference of the locator differs', () => {
    const locator = (ref: string) => ({
      content: { title: 'Changed', body: 'It changed.', locator: { kind: 'session', ref } },
    })
    const known = { event: event(locator('s1')) }
    expect(decideSend(known, request(locator('s2')), registered, [], limits)).toEqual(
      refused('conflict'),
    )
    expect(decideSend(known, request(locator('s1')), registered, [], limits)).toEqual({
      kind: 'recalled',
    })
  })

  it('answers basis-unavailable when admissibility cannot be decided', () => {
    const naming = request({ named: [agent('a')] })
    expect(
      decideSend(null, naming, registered, [named(agent('a'), 'unavailable')], limits),
    ).toEqual({
      kind: 'basis-unavailable',
    })
  })

  it('refuses a causal depth above the limit and accepts one at the limit', () => {
    const depth = (value: number) => request({ origin: { emitter: agent('a'), depth: value } })
    expect(decideSend(null, depth(4), registered, [], limits)).toEqual(
      refused('causal-depth-exceeded'),
    )
    expect(decideSend(null, depth(3), registered, [], limits)).toHaveProperty('kind', 'proceed')
  })

  it('checks naming before depth and the source before naming', () => {
    const both = request({ named: [agent('a')], origin: { emitter: agent('b'), depth: 9 } })
    expect(decideSend(null, both, registered, [named(agent('a'), 'denied')], limits)).toEqual(
      refused('recipient-not-admissible'),
    )
    expect(
      decideSend(null, both, { kind: 'absent' }, [named(agent('a'), 'denied')], limits),
    ).toEqual({
      kind: 'basis-unavailable',
    })
  })
})
