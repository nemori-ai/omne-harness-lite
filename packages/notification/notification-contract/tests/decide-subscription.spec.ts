import { describe, expect, it } from 'vitest'
import {
  decideSubscription,
  subscriptionChangeSchema,
  subscriptionKeySchema,
  type Creator,
  type SubscriptionActor,
  type SubscriptionChange,
  type SubscriptionDecisionInput,
} from '@omne-harness/notification-contract'
import { agent, at, declared, person, source, subscription, typeName } from './fixtures.ts'

const a = agent('a')
const now = at(10)
const owner: SubscriptionActor = { kind: 'owner' }
const self: SubscriptionActor = { kind: 'agent', recipient: a }
const HUMAN: Creator = { kind: 'human', actorRef: 'acc' }
const AGENT: Creator = {
  kind: 'agent',
  actorRef: 'p',
  originatingSessionRef: 'session-a',
  originatingCallRef: 'call-1',
}

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
    creator: overrides.actor?.kind === 'owner' ? HUMAN : AGENT,
    declared: declared(),
    now,
    ...overrides,
  })

const refused = (reason: string) => ({ kind: 'refused', reason })
const BY_OWNER = { kind: 'set', creator: HUMAN }
const BY_AGENT = { kind: 'set', creator: AGENT }

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
      creator: HUMAN,
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
      creator: HUMAN,
    })
  })

  it('accepts a prefix scope without asking the notation rule', () => {
    const subject = { presence: 'optional', hint: '', accepts: () => false } as const
    const scope = { kind: 'subject-prefix', prefix: 'repo/' } as const
    expect(
      decide({ change: change({ scope }), declared: declared({ subject }), actor: owner }),
    ).toEqual({
      kind: 'set',
      creator: HUMAN,
    })
  })
})

describe('decideSubscription: the owner', () => {
  it('sets a subscription for any recipient on its own authority', () => {
    for (const recipient of [person, a])
      expect(decide({ change: change({ recipient }), actor: owner })).toEqual({
        kind: 'set',
        creator: HUMAN,
      })
  })

  it('is recalled when nothing would change, and sets when anything would', () => {
    const current = subscription(a, { kind: 'all' }, { level: 'strong' })
    expect(decide({ current, actor: owner })).toEqual({ kind: 'recalled', current })
    for (const next of [{ level: 'weak' }, { note: 'new' }, { term: { kind: 'once' } }] as const)
      expect(decide({ current, change: change(next), actor: owner })).toEqual({
        kind: 'set',
        creator: HUMAN,
      })
  })

  it('sets anew over an expired subscription', () => {
    const current = subscription(a, { kind: 'all' }, { level: 'strong', expired: true })
    expect(decide({ current, actor: owner })).toEqual(BY_OWNER)
  })
})

describe('decideSubscription: an agent', () => {
  it('sets its subscription at once, and names itself, its session and its call as the creator', () => {
    const creator = {
      kind: 'agent',
      actorRef: 'principal/a',
      originatingSessionRef: 'session-a',
      originatingCallRef: 'call-7',
    } as const
    expect(decide({ creator })).toEqual({ kind: 'set', creator })
    expect(decide({ creator, change: change({ level: 'off' }) })).toEqual({ kind: 'set', creator })
  })

  it('may only subscribe for itself', () => {
    for (const recipient of [person, agent('b')])
      expect(decide({ change: change({ recipient }), declared: declared() })).toEqual(
        refused('not-own-recipient'),
      )
  })

  const held = subscription(a, { kind: 'all' }, { level: 'strong', creator: AGENT })

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
  ] as const)('sets any change at once, lower or higher: %s', (_case, current, next) => {
    expect(decide({ current, change: change(next) })).toEqual(BY_AGENT)
  })

  it('is recalled when nothing would change, whoever made the subscription', () => {
    expect(decide({ current: held })).toEqual({ kind: 'recalled', current: held })
    const byOwner = subscription(a, { kind: 'all' }, { level: 'strong', creator: HUMAN })
    expect(decide({ current: byOwner })).toEqual({ kind: 'recalled', current: byOwner })
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
