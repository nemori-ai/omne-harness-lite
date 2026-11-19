import { describe, expect, it } from 'vitest'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { expectRoundTrip, readSample, session, tenant } from './fixtures/samples.ts'

const search = sessionProtocol.operations['search-history']
const literals = { kind: 'literals', all: ['受理'], caseSensitive: false }
const least = { tenant, content: literals, cursor: null }
const hit = {
  session,
  position: '17',
  kind: 'message.user',
  at: '2026-11-19T01:02:03.004Z',
  snippet: { before: '关于', match: '受理', after: '的设计' },
}

describe('search-history', () => {
  it('is a login read of the small limit that counts as access, with invalid and limited of its own', () => {
    expect({ identity: search.identity, effect: search.effect, limit: search.limit }).toEqual({
      identity: 'login',
      effect: 'read',
      limit: 'small',
    })
    expect(search.countsAsAccess).toBe(true)
    expect(Object.keys(search.outcomes)).toEqual(expect.arrayContaining(['invalid', 'limited']))
  })

  it('reads the least body, and one with every part of the range, the type and the content', () => {
    expectRoundTrip(search.body, least)
    expectRoundTrip(search.body, {
      tenant,
      sessions: [session],
      archived: 'archived',
      from: '2026-11-01T00:00:00Z',
      to: null,
      kinds: ['message.user', 'message.compaction'],
      modelReadable: 'any',
      content: { kind: 'regex', pattern: 'a+b', caseSensitive: true },
      cursor: 'sealed',
      limit: 20,
    })
    expectRoundTrip(search.body, {
      ...least,
      sessions: null,
      content: { ...literals, all: ['a', ' b '] },
    })
  })

  it.each([
    ['without a tenant', { content: literals, cursor: null }],
    ['without content', { tenant, cursor: null }],
    ['without a cursor', { tenant, content: literals }],
    ['with no literal at all', { ...least, content: { ...literals, all: [] } }],
    ['with nine literals', { ...least, content: { ...literals, all: Array(9).fill('a') } }],
    ['with a literal that is no text', { ...least, content: { ...literals, all: [7] } }],
    ['with content of an unknown kind', { ...least, content: { kind: 'glob', pattern: '*' } }],
    ['with a pattern and no case flag', { ...least, content: { kind: 'regex', pattern: 'a' } }],
    ['with an entry kind that cannot be searched', { ...least, kinds: ['message.delivered'] }],
    ['with sixty-five sessions', { ...least, sessions: Array(65).fill(session) }],
    ['with a session that is not one', { ...least, sessions: [''] }],
    ['with an archive filter it does not know', { ...least, archived: 'both' }],
    ['with a time that is no instant', { ...least, from: 'yesterday' }],
    ['with a limit of zero', { ...least, limit: 0 }],
    ['with a field it does not know', { ...least, roles: ['user'] }],
  ])('refuses a body %s', (_label, sample) => {
    expect(readSample(search.body, sample)).toEqual({ ok: false })
  })

  it('answers a page that is through, and one that says why it is not', () => {
    expectRoundTrip(search.outcomes.succeeded, {
      hits: [],
      next: null,
      complete: true,
      incomplete: null,
    })
    expectRoundTrip(search.outcomes.succeeded, {
      hits: [hit, { ...hit, kind: 'message.tool', at: null }],
      next: 'sealed',
      complete: false,
      incomplete: { reason: 'tail-budget', behind: 3, progress: null },
    })
    expectRoundTrip(search.outcomes.succeeded, {
      hits: [],
      next: null,
      complete: false,
      incomplete: { reason: 'rebuilding', behind: 12, progress: { indexed: 4, total: 16 } },
    })
  })

  it.each([
    ['a page with no word on whether it is through', { hits: [], next: null, incomplete: null }],
    ['a reason it does not know', { reason: 'slow', behind: 0, progress: null }],
    ['a count below zero', { reason: 'budget', behind: -1, progress: null }],
  ])('does not answer %s', (_label, sample) => {
    const page =
      'reason' in sample ? { hits: [], next: null, complete: false, incomplete: sample } : sample
    expect(readSample(search.outcomes.succeeded, page)).toEqual({ ok: false })
  })

  it('says which part of a search it refuses and why, and nothing with limited', () => {
    expectRoundTrip(search.outcomes.invalid, { field: 'query', reason: 'pattern-invalid' })
    expectRoundTrip(search.outcomes.invalid, { field: 'cursor', reason: 'the index was rebuilt' })
    expect(readSample(search.outcomes.invalid, { field: 'tenant', reason: 'x' })).toEqual({
      ok: false,
    })
    expect(expectRoundTrip(search.outcomes.limited, {})).toEqual({})
  })
})
