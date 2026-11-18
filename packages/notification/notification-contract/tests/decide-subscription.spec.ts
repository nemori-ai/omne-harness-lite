import { describe, expect, it } from 'vitest'
import {
  confirmationContent,
  decideSubscription,
  tenantIdSchema,
  type ConsentMode,
  type Confirmation,
  type SubscriptionActor,
  type SubscriptionChange,
  type SubscriptionDecisionInput,
} from '@omne-harness/notification-contract'
import { agent, at, declared, person, source, subscription, typeName } from './fixtures.ts'

const tenant = tenantIdSchema.parse('t1')
const a = agent('a')
const now = at(10)
const owner: SubscriptionActor = { kind: 'owner' }
const self: SubscriptionActor = { kind: 'agent', recipient: a }
const perRequest: ConsentMode = { kind: 'per-request' }

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
    tenant,
    change: change(),
    current: null,
    actor: self,
    declared: declared(),
    mode: perRequest,
    confirmation: null,
    now,
    ...overrides,
  })

const refused = (reason: string) => ({ kind: 'refused', reason })
const confirmed = (overrides: Partial<Confirmation> = {}, of = change()): Confirmation => ({
  decision: 'card-1',
  content: confirmationContent(tenant, of),
  approved: true,
  ...overrides,
})

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
    expect(decide({ current, actor: owner })).toEqual({ kind: 'recalled' })
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

  it('takes effect at once under automatic consent, on the current generation', () => {
    expect(decide({ mode: { kind: 'automatic', generation: 3 } })).toEqual({
      kind: 'set',
      basis: { kind: 'blanket', generation: 3 },
    })
  })

  it('needs the owner for a new subscription under per-request consent', () => {
    expect(decide()).toEqual({
      kind: 'needs-confirmation',
      content: confirmationContent(tenant, change()),
    })
  })

  it('takes effect with a confirmation of the same content', () => {
    expect(decide({ confirmation: confirmed() })).toEqual({
      kind: 'set',
      basis: { kind: 'granular', decision: 'card-1' },
    })
  })

  it.each([
    ['other content', confirmed({}, change({ level: 'weak' }))],
    ['another note', confirmed({}, change({ note: 'do more' }))],
    [
      'another tenant',
      confirmed({ content: confirmationContent(tenantIdSchema.parse('t2'), change()) }),
    ],
    ['another recipient', confirmed({}, change({ recipient: agent('b') }))],
    ['a rejection', confirmed({ approved: false })],
  ])('refuses a confirmation of %s', (_case, confirmation) => {
    expect(decide({ confirmation })).toEqual(refused('confirmation-mismatch'))
  })

  const standingStrong = subscription(
    a,
    { kind: 'all' },
    { level: 'strong', basis: { kind: 'granular', decision: 'card-0' } },
  )

  it.each([
    ['strong to weak', { level: 'weak' }],
    ['strong to off', { level: 'off' }],
    ['a shorter term', { term: { kind: 'until', at: at(60) } }],
    ['standing to once', { term: { kind: 'once' } }],
  ] as const)('lowers without consent and keeps the basis: %s', (_case, next) => {
    expect(decide({ current: standingStrong, change: change(next) })).toEqual({
      kind: 'set',
      basis: { kind: 'granular', decision: 'card-0' },
    })
  })

  it.each([
    ['weak to strong', subscription(a, { kind: 'all' }, { level: 'weak' }), {}],
    ['off to weak', subscription(a, { kind: 'all' }, { level: 'off' }), { level: 'weak' }],
    [
      'a longer until',
      subscription(a, { kind: 'all' }, { term: { kind: 'until', at: at(30) } }),
      { term: { kind: 'until', at: at(60) } },
    ],
    [
      'until to standing',
      subscription(a, { kind: 'all' }, { term: { kind: 'until', at: at(30) } }),
      {},
    ],
    [
      'once to until',
      subscription(a, { kind: 'all' }, { term: { kind: 'once' } }),
      { term: { kind: 'until', at: at(60) } },
    ],
    [
      'until to once',
      subscription(a, { kind: 'all' }, { term: { kind: 'until', at: at(30) } }),
      { term: { kind: 'once' } },
    ],
    ['a changed note', standingStrong, { note: 'do something else' }],
    ['a first subscription that is off', null, { level: 'off' }],
    [
      'an expired subscription set again lower',
      subscription(a, { kind: 'all' }, { expired: true }),
      { level: 'weak' },
    ],
  ] as const)('needs consent for %s', (_case, current, next) => {
    expect(decide({ current, change: change(next) }).kind).toBe('needs-confirmation')
  })

  it('is recalled when nothing would change', () => {
    expect(decide({ current: standingStrong })).toEqual({ kind: 'recalled' })
  })

  it('keeps a subscription made under automatic consent valid after the mode changed', () => {
    const blanket = subscription(a, { kind: 'all' }, { basis: { kind: 'blanket', generation: 1 } })
    expect(decide({ current: blanket, mode: perRequest })).toEqual({ kind: 'recalled' })
  })
})
