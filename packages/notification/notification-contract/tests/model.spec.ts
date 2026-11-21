import { describe, expect, it } from 'vitest'
import {
  sameScope,
  sameSubscription,
  sameSubscriptionKey,
  sameTerm,
  type Scope,
  type Subscription,
} from '@omne-harness/notification-contract'
import { agent, at, person, subscription } from './fixtures.ts'

const scopes: readonly Scope[] = [
  { kind: 'all' },
  { kind: 'subject', equals: 'a' },
  { kind: 'subject', equals: 'b' },
  { kind: 'subject-prefix', prefix: 'a' },
  { kind: 'subject-prefix', prefix: 'b' },
]

describe('equality of the stored values', () => {
  it('holds between two scopes only when kind and value agree', () => {
    for (const [i, a] of scopes.entries())
      for (const [j, b] of scopes.entries()) expect(sameScope(a, { ...b })).toBe(i === j)
  })

  it('holds between two terms only when kind and instant agree', () => {
    const terms = [
      { kind: 'standing' },
      { kind: 'once' },
      { kind: 'until', at: at(1) },
      { kind: 'until', at: at(2) },
    ] as const
    for (const [i, a] of terms.entries())
      for (const [j, b] of terms.entries()) expect(sameTerm(a, { ...b })).toBe(i === j)
  })

  it('tells subscription keys apart by each of their four parts', () => {
    const base = subscription(agent('a'), { kind: 'all' })
    expect(sameSubscriptionKey(base, { ...base })).toBe(true)
    const others = [
      { ...base, recipient: agent('b') },
      { ...base, recipient: person },
      { ...base, source: 'other.source' as never },
      { ...base, type: 'other' as never },
      { ...base, scope: { kind: 'subject', equals: 'a' } as const },
    ]
    for (const other of others) expect(sameSubscriptionKey(base, other)).toBe(false)
  })

  it('tells subscriptions apart by every stored part, and null only equals null', () => {
    const base = subscription(agent('a'), { kind: 'all' }, { note: 'n' })
    expect(sameSubscription(base, { ...base })).toBe(true)
    expect(sameSubscription(null, null)).toBe(true)
    expect(sameSubscription(base, null)).toBe(false)
    expect(sameSubscription(null, base)).toBe(false)
    const changes: Partial<Subscription>[] = [
      { level: 'weak' },
      { note: null },
      { term: { kind: 'once' } },
      { basis: { kind: 'blanket', scope: 'standing', grant: 'g' } },
      { basis: { kind: 'granular', grant: 'g' } },
      { expired: true },
      { scope: { kind: 'subject-prefix', prefix: 'x' } },
    ]
    for (const change of changes) expect(sameSubscription(base, { ...base, ...change })).toBe(false)
    const blanket = { ...base, basis: { kind: 'blanket', scope: 'standing', grant: 'g' } } as const
    for (const basis of [
      { kind: 'blanket', scope: 'session', grant: 'g' },
      { kind: 'blanket', scope: 'standing', grant: 'h' },
    ] as const)
      expect(sameSubscription(blanket, { ...blanket, basis })).toBe(false)
    const granular = { ...base, basis: { kind: 'granular', grant: 'd' } } as const
    expect(
      sameSubscription(granular, { ...granular, basis: { kind: 'granular', grant: 'e' } }),
    ).toBe(false)
    expect(sameSubscription(granular, { ...granular })).toBe(true)
  })
})
