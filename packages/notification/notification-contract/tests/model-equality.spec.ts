import { describe, expect, it } from 'vitest'
import {
  sameScope,
  sameSubscription,
  sameTerm,
  scopeMatches,
  subjectAccepted,
  type Creator,
  type Scope,
  type Subscription,
  type Term,
} from '@omne-harness/notification-contract'

const ALL: Scope = { kind: 'all' }
const exact = (equals: string): Scope => ({ kind: 'subject', equals })
const prefix = (text: string): Scope => ({ kind: 'subject-prefix', prefix: text })
const AT = '2026-11-18T06:00:00.000Z'

describe('two scopes are the same only when kind and text agree', () => {
  const scopes: readonly Scope[] = [
    ALL,
    exact('a'),
    exact('b'),
    prefix('a'),
    prefix('b'),
    prefix('undefined'),
  ]
  it.each(scopes.flatMap((a, i) => scopes.map((b, j) => [a, b, i === j] as const)))(
    '%j and %j: %s',
    (a, b, same) => {
      expect(sameScope(a, b)).toBe(same)
    },
  )
})

describe('two terms are the same only when kind and instant agree', () => {
  const terms = [
    { kind: 'standing' },
    { kind: 'once' },
    { kind: 'until', at: AT },
    { kind: 'until', at: '2026-11-19T06:00:00.000Z' },
  ] as readonly Term[]
  it.each(terms.flatMap((a, i) => terms.map((b, j) => [a, b, i === j] as const)))(
    '%j and %j: %s',
    (a, b, same) => {
      expect(sameTerm(a, b)).toBe(same)
    },
  )
})

describe('two subscriptions are the same only when every stored part agrees', () => {
  const base = {
    recipient: { kind: 'person' },
    source: 'demo.things',
    type: 'changed',
    scope: ALL,
    level: 'weak',
    note: null,
    term: { kind: 'standing' },
    creator: { kind: 'human', actorRef: 'owner' },
    expired: false,
  } as unknown as Subscription
  const agent = (session: string, call: string, actorRef = 'p') =>
    ({ kind: 'agent', actorRef, originatingSessionRef: session, originatingCallRef: call }) as const
  const creators = [
    { kind: 'human', actorRef: 'owner' },
    { kind: 'human', actorRef: 'p' },
    { kind: 'system', principalRef: 'owner' },
    { kind: 'system', principalRef: 'p' },
    agent('s1', 'c1'),
    agent('s1', 'c1', 'q'),
    agent('s1', 'c2'),
    agent('s2', 'c1'),
  ] as readonly Creator[]

  it.each(creators.flatMap((a, i) => creators.map((b, j) => [a, b, i === j] as const)))(
    'creator %j and %j: %s',
    (a, b, same) => {
      expect(sameSubscription({ ...base, creator: a }, { ...base, creator: b })).toBe(same)
    },
  )

  it.each([
    ['level', { level: 'strong' }],
    ['note', { note: 'n' }],
    ['term', { term: { kind: 'once' } }],
    ['expired', { expired: true }],
    ['scope', { scope: exact('a') }],
    ['recipient', { recipient: { kind: 'agent', ref: 'a' } }],
    ['source', { source: 'other.things' }],
    ['type', { type: 'other' }],
  ])('a different %s makes them different', (_part, change) => {
    expect(sameSubscription(base, { ...base, ...change } as Subscription)).toBe(false)
  })

  it('a subscription is the same as itself, and none is the same only as none', () => {
    expect(sameSubscription(base, { ...base })).toBe(true)
    expect(sameSubscription(null, null)).toBe(true)
    expect(sameSubscription(base, null)).toBe(false)
    expect(sameSubscription(null, base)).toBe(false)
  })
})

describe('a scope matches a subject', () => {
  it.each([
    [ALL, 'repo/a', true],
    [ALL, null, true],
    [exact('repo/a'), 'repo/a', true],
    [exact('repo/a'), 'repo/ab', false],
    [exact('repo/a'), 'repo', false],
    [exact('repo/a'), null, false],
    [prefix('repo/'), 'repo/a', true],
    [prefix('repo/'), 'repo', false],
    [prefix('repo/'), 'xrepo/a', false],
    [prefix('repo/'), null, false],
  ] as const)('%j against %j: %s', (scope, subject, matches) => {
    expect(scopeMatches(scope, subject)).toBe(matches)
  })
})

describe('a subject fits the rule of its event type', () => {
  const rule = (
    presence: 'none' | 'optional' | 'required',
    accepts?: (subject: string) => boolean,
  ) => ({
    presence,
    hint: '',
    ...(accepts === undefined ? {} : { accepts }),
  })
  it.each([
    ['required', null, false],
    ['required', 'a', true],
    ['optional', null, true],
    ['optional', 'a', true],
    ['none', null, true],
    ['none', 'a', false],
  ] as const)('presence %s with subject %j: %s', (presence, subject, fits) => {
    expect(subjectAccepted(rule(presence), subject)).toBe(fits)
  })

  it('asks the notation check of the type only for a subject that is there', () => {
    const asked: string[] = []
    const picky = rule('optional', subject => (asked.push(subject), subject === 'good'))
    expect(subjectAccepted(picky, 'good')).toBe(true)
    expect(subjectAccepted(picky, 'bad')).toBe(false)
    expect(subjectAccepted(picky, null)).toBe(true)
    expect(asked).toEqual(['good', 'bad'])
  })
})
