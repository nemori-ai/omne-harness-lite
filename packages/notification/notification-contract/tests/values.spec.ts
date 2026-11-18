import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  BODY_CEILING,
  parseSendRequest,
  parseWith,
  scopeSchema,
  termSchema,
} from '@omne-harness/notification-contract'

const valid = {
  identity: { tenant: 't1', source: 'demo.things', eventId: 'e1' },
  event: {
    type: 'changed',
    subject: null,
    at: '2026-11-18T06:00:00.000Z',
    content: { title: 'Changed', body: '', locator: null },
    replaceKey: null,
    renotify: false,
    named: [],
    origin: null,
  },
}
const withIdentity = (patch: object) => ({ ...valid, identity: { ...valid.identity, ...patch } })
const withEvent = (patch: object) => ({ ...valid, event: { ...valid.event, ...patch } })

describe('a send request is parsed at the boundary', () => {
  it('accepts a complete request', () => {
    expect(parseSendRequest(valid)).toEqual({ ok: valid })
  })

  it.each([
    ['no dot', 'demo'],
    ['upper case', 'Demo.things'],
    ['three segments', 'demo.things.more'],
    ['empty name', 'demo.'],
  ])('refuses a source name with %s', (_case, name) => {
    expect(parseSendRequest(withIdentity({ source: name }))).toEqual({
      refused: 'invalid-source-name',
    })
  })

  it.each([
    ['tenant', { tenant: '' }],
    ['event id', { eventId: '' }],
  ])('refuses an identity with an empty %s', (_case, patch) => {
    expect(parseSendRequest(withIdentity(patch))).toEqual({ refused: 'incomplete-identity' })
  })

  it('refuses a body above the ceiling and accepts one at the ceiling', () => {
    const content = (size: number) => ({ title: 'T', body: 'x'.repeat(size), locator: null })
    expect(parseSendRequest(withEvent({ content: content(BODY_CEILING + 1) }))).toEqual({
      refused: 'content-too-large',
    })
    expect(parseSendRequest(withEvent({ content: content(BODY_CEILING) }))).toHaveProperty('ok')
  })

  it.each([
    ['an unknown field', { ...valid, extra: 1 }],
    ['an instant without milliseconds', withEvent({ at: '2026-11-18T06:00:00Z' })],
    ['an instant that is not a date', withEvent({ at: '2026-13-40T06:00:00.000Z' })],
    ['an empty title', withEvent({ content: { title: '', body: '', locator: null } })],
    ['a recipient of an unknown kind', withEvent({ named: [{ kind: 'team' }] })],
    ['a negative causal depth', withEvent({ origin: { emitter: { kind: 'person' }, depth: -1 } })],
  ])('refuses %s as an invalid request', (_case, input) => {
    expect(parseSendRequest(input)).toEqual({ refused: 'invalid-request' })
  })
})

describe('scope and term are closed sets', () => {
  const holder = z.strictObject({ scope: scopeSchema, term: termSchema })
  const good = { scope: { kind: 'all' }, term: { kind: 'standing' } }

  it('accepts the three scopes and the three terms', () => {
    for (const scope of [
      { kind: 'all' },
      { kind: 'subject', equals: 'a' },
      { kind: 'subject-prefix', prefix: 'a/' },
    ])
      expect(parseWith(holder, { ...good, scope })).toHaveProperty('ok')
    for (const term of [
      { kind: 'standing' },
      { kind: 'once' },
      { kind: 'until', at: '2026-11-19T00:00:00.000Z' },
    ])
      expect(parseWith(holder, { ...good, term })).toHaveProperty('ok')
  })

  it.each([
    ['a suffix scope', { kind: 'subject-suffix', suffix: 'a' }],
    ['an empty prefix', { kind: 'subject-prefix', prefix: '' }],
    ['a scope with a stray field', { kind: 'all', equals: 'a' }],
  ])('refuses %s', (_case, scope) => {
    expect(parseWith(holder, { ...good, scope })).toEqual({ refused: 'invalid-scope' })
  })

  it.each([
    ['a term of an unknown kind', { kind: 'twice' }],
    ['an until term without an instant', { kind: 'until' }],
  ])('refuses %s', (_case, term) => {
    expect(parseWith(holder, { ...good, term })).toEqual({ refused: 'invalid-term' })
  })
})
