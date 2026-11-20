import { describe, expect, it } from 'vitest'
import {
  consentBasis,
  decideSubscription,
  subscriptionChangeSchema,
  subscriptionKeySchema,
  type ConsentAnswer,
  type SubscriptionActor,
  type SubscriptionChange,
  type SubscriptionDecisionInput,
} from '@omne-harness/notification-contract'
import { agent, at, declared, person, source, subscription, typeName } from './fixtures.ts'

const a = agent('a')
const now = at(10)
const owner: SubscriptionActor = { kind: 'owner' }
const self: SubscriptionActor = { kind: 'agent', recipient: a }

function change(overrides: Partial<SubscriptionChange> = {}): SubscriptionChange {
  return {
    recipient: a,
    source,
    type: typeName,
    scope: { kind: 'all' },
    level: 'strong',
    note: null,
    term: { kind: 'standing' },
    ...overrides,
  }
}

const decide = (overrides: Partial<SubscriptionDecisionInput> = {}) =>
  decideSubscription({
    change: change(),
    current: null,
    actor: self,
    declared: declared(),
    now,
    ...overrides,
  })

const refused = (reason: string) => ({ kind: 'refused', reason })
const NEEDS_CONSENT = { kind: 'needs-consent' }

describe('decideSubscription: what anyone meets first', () => {
  it('refuses a term that has already passed', () => {
    for (const minute of [9, 10])
      expect(
        decide({ change: change({ term: { kind: 'until', at: at(minute) } }), actor: owner }),
      ).toEqual(refused('term-in-past'))
    expect(
      decide({ change: change({ term: { kind: 'until', at: at(11) } }), actor: owner }),
    ).toEqual({
      kind: 'set',
      basis: { kind: 'owner' },
    })
  })

  it('refuses a kind of recipient the type does not let subscribe', () => {
    expect(decide({ declared: declared({ subscribable: ['person'] }), actor: owner })).toEqual(
      refused('not-subscribable'),
    )
  })

  it.each([
    [
      'a subject scope on a type without subjects',
      { kind: 'subject', equals: 'x' },
      { presence: 'none', hint: '' },
    ],
    [
      'a prefix scope on a type without subjects',
      { kind: 'subject-prefix', prefix: 'x' },
      { presence: 'none', hint: '' },
    ],
    [
      'a subject the type does not accept',
      { kind: 'subject', equals: 'x' },
      { presence: 'optional', hint: '', accepts: () => false },
    ],
  ] as const)('refuses %s', (_case, scope, subject) => {
    expect(
      decide({ change: change({ scope }), declared: declared({ subject }), actor: owner }),
    ).toEqual(refused('scope-does-not-fit'))
  })

  it('accepts the scope all on a type without subjects', () => {
    const subject = { presence: 'none', hint: '' } as const
    expect(decide({ declared: declared({ subject }), actor: owner })).toEqual({
      kind: 'set',
      basis: { kind: 'owner' },
    })
  })

  it('accepts a prefix scope without asking the notation rule', () => {
    const subject = { presence: 'optional', hint: '', accepts: () => false } as const
    const scope = { kind: 'subject-prefix', prefix: 'repo/' } as const
    expect(
      decide({ change: change({ scope }), declared: declared({ subject }), actor: owner }),
    ).toEqual({
      kind: 'set',
      basis: { kind: 'owner' },
    })
  })
})

describe('decideSubscription: the owner', () => {
  it('sets a subscription for any recipient on its own authority', () => {
    for (const recipient of [person, a])
      expect(decide({ change: change({ recipient }), actor: owner })).toEqual({
        kind: 'set',
        basis: { kind: 'owner' },
      })
  })

  it('is recalled when nothing would change, and sets when anything would', () => {
    const current = subscription(a, { kind: 'all' }, { level: 'strong' })
    expect(decide({ current, actor: owner })).toEqual({ kind: 'recalled', current })
    for (const next of [{ level: 'weak' }, { note: 'new' }, { term: { kind: 'once' } }] as const)
      expect(decide({ current, change: change(next), actor: owner })).toEqual({
        kind: 'set',
        basis: { kind: 'owner' },
      })
  })

  it('sets anew over an expired subscription', () => {
    const current = subscription(a, { kind: 'all' }, { level: 'strong', expired: true })
    expect(decide({ current, actor: owner })).toEqual({ kind: 'set', basis: { kind: 'owner' } })
  })
})

describe('decideSubscription: an agent', () => {
  it('may only subscribe for itself', () => {
    for (const recipient of [person, agent('b')])
      expect(decide({ change: change({ recipient }), declared: declared() })).toEqual(
        refused('not-own-recipient'),
      )
  })

  it('needs the consent of its call for a first subscription', () => {
    expect(decide()).toEqual(NEEDS_CONSENT)
    expect(decide({ change: change({ level: 'off' }) })).toEqual(NEEDS_CONSENT)
  })

  const held = subscription(
    a,
    { kind: 'all' },
    { level: 'strong', basis: { kind: 'granular', grant: 'g0' } },
  )

  it.each([
    ['strong to weak', held, { level: 'weak' }],
    ['strong to off', held, { level: 'off' }],
    ['a shorter term', held, { term: { kind: 'until', at: at(60) } }],
    ['standing to once', held, { term: { kind: 'once' } }],
    ['weak to strong', subscription(a, { kind: 'all' }, { level: 'weak' }), {}],
    [
      'a longer until',
      subscription(a, { kind: 'all' }, { term: { kind: 'until', at: at(30) } }),
      { term: { kind: 'until', at: at(60) } },
    ],
    ['a changed note', held, { note: 'do something else' }],
    [
      'an expired subscription set again as it was',
      subscription(a, { kind: 'all' }, { level: 'strong', expired: true }),
      {},
    ],
  ] as const)(
    'needs the consent of its call for any change, lower or higher: %s',
    (_case, current, next) => {
      expect(decide({ current, change: change(next) })).toEqual(NEEDS_CONSENT)
    },
  )

  it('is recalled when nothing would change, without asking for consent', () => {
    expect(decide({ current: held })).toEqual({ kind: 'recalled', current: held })
  })
})

describe('consentBasis: what the consent of the call makes of a write', () => {
  const grant = '{"via":"once"}'
  it.each([
    [
      'a blanket consent that stands',
      { kind: 'consented', basis: { kind: 'blanket', scope: 'standing', grant } },
      { kind: 'basis', basis: { kind: 'blanket', scope: 'standing', grant } },
    ],
    [
      'a blanket consent of this session',
      { kind: 'consented', basis: { kind: 'blanket', scope: 'session', grant } },
      { kind: 'basis', basis: { kind: 'blanket', scope: 'session', grant } },
    ],
    [
      'a granular consent, whose layer is always this session',
      { kind: 'consented', basis: { kind: 'granular', scope: 'session', grant } },
      { kind: 'basis', basis: { kind: 'granular', grant } },
    ],
    ['no consent', { kind: 'none' }, { kind: 'refused', reason: 'consent-required' }],
    ['a consent that cannot be read', { kind: 'unavailable' }, { kind: 'unavailable' }],
  ] as const)('%s', (_case, answer, expected) => {
    expect(consentBasis(answer as ConsentAnswer)).toEqual(expected)
  })
})

describe('the shapes a subscription request must have', () => {
  const valid = {
    recipient: { kind: 'agent', ref: 'a' },
    source: 'demo.things',
    type: 'changed',
    scope: { kind: 'all' },
  }

  it('parses a key and a change, and refuses a stray or a missing field', () => {
    expect(subscriptionKeySchema.parse(valid)).toEqual(valid)
    expect(subscriptionKeySchema.safeParse({ ...valid, level: 'weak' }).success).toBe(false)
    expect(subscriptionKeySchema.safeParse({ ...valid, scope: undefined }).success).toBe(false)
    const full = { ...valid, level: 'weak', note: null, term: { kind: 'once' } }
    expect(subscriptionChangeSchema.parse(full)).toEqual(full)
    expect(subscriptionChangeSchema.safeParse({ ...full, extra: 1 }).success).toBe(false)
    expect(subscriptionChangeSchema.safeParse({ ...full, note: '' }).success).toBe(false)
    expect(subscriptionChangeSchema.safeParse(valid).success).toBe(false)
  })
})
