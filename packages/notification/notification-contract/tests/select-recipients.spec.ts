import { describe, expect, it } from 'vitest'
import { selectRecipients, type Subscription } from '@omne-harness/notification-contract'
import { agent, at, declared, event, person, subscription } from './fixtures.ts'

const a = agent('a')
const b = agent('b')
const now = at(5)
const select = (
  subscriptions: readonly Subscription[],
  overrides: Parameters<typeof event>[0] = {},
  recipients = [person, a, b],
) => selectRecipients(event(overrides), declared(), recipients, subscriptions, now)

describe('selectRecipients', () => {
  it('uses the default of the type when no subscription matches', () => {
    expect(select([])).toEqual([
      { recipient: person, level: 'weak', cause: { kind: 'type-default' }, hit: null },
    ])
  })

  it('answers nobody when every value is off', () => {
    expect(select([subscription(person, { kind: 'all' }, { level: 'off' })])).toEqual([])
  })

  it('takes the level, the cause and the note from the matching subscription', () => {
    const sub = subscription(a, { kind: 'all' }, { level: 'strong', note: 'triage it' })
    expect(select([sub], {}, [a])).toEqual([
      {
        recipient: a,
        level: 'strong',
        cause: { kind: 'subscription', scope: { kind: 'all' }, note: 'triage it' },
        hit: { recipient: a, source: sub.source, type: sub.type, scope: { kind: 'all' } },
      },
    ])
  })

  it.each([
    [
      'equality beats a prefix',
      { kind: 'subject', equals: 'repo/a' },
      { kind: 'subject-prefix', prefix: 'repo/' },
    ],
    [
      'a longer prefix beats a shorter one',
      { kind: 'subject-prefix', prefix: 'repo/' },
      { kind: 'subject-prefix', prefix: 're' },
    ],
    ['a prefix beats all', { kind: 'subject-prefix', prefix: 'r' }, { kind: 'all' }],
  ] as const)('%s', (_case, specific, general) => {
    const strong = subscription(a, specific, { level: 'strong' })
    const weak = subscription(a, general, { level: 'weak' })
    for (const order of [
      [strong, weak],
      [weak, strong],
    ])
      expect(select(order, {}, [a])[0]).toMatchObject({
        level: 'strong',
        cause: { scope: specific },
      })
  })

  it('lets a specific off silence a general strong', () => {
    const subs = [
      subscription(a, { kind: 'all' }, { level: 'strong' }),
      subscription(a, { kind: 'subject', equals: 'repo/a' }, { level: 'off' }),
    ]
    expect(select(subs, {}, [a])).toEqual([])
  })

  it('does not match a subject scope when the event has no subject', () => {
    const subs = [
      subscription(a, { kind: 'subject', equals: 'repo/a' }),
      subscription(a, { kind: 'subject-prefix', prefix: 'repo/' }),
    ]
    expect(select(subs, { subject: null }, [a])).toEqual([])
    expect(select([subscription(a, { kind: 'all' })], { subject: null }, [a])).toHaveLength(1)
  })

  it('ignores a subscription of another recipient', () => {
    expect(select([subscription(b, { kind: 'all' })], {}, [a])).toEqual([])
  })

  it('always selects a named recipient, as weak when its value is off', () => {
    expect(select([], { named: [a] }, [a])).toEqual([
      { recipient: a, level: 'weak', cause: { kind: 'named' }, hit: null },
    ])
    const off = subscription(a, { kind: 'all' }, { level: 'off' })
    expect(select([off], { named: [a] }, [a])).toEqual([
      { recipient: a, level: 'weak', cause: { kind: 'named' }, hit: null },
    ])
  })

  it('keeps the subscribed level of a named recipient and records the hit', () => {
    const strong = subscription(a, { kind: 'all' }, { level: 'strong' })
    expect(select([strong], { named: [a] }, [a])).toEqual([
      {
        recipient: a,
        level: 'strong',
        cause: { kind: 'named' },
        hit: { recipient: a, source: strong.source, type: strong.type, scope: { kind: 'all' } },
      },
    ])
  })

  it('selects subscribers and named recipients together', () => {
    const selected = select([subscription(b, { kind: 'all' })], { named: [person] })
    expect(selected.map(entry => entry.recipient)).toEqual([person, b])
  })

  it('never selects the emitter, named or subscribed', () => {
    const origin = { emitter: a, depth: 1 }
    expect(select([subscription(a, { kind: 'all' })], { origin, named: [a] }, [a])).toEqual([])
  })

  it('does not hit an expired subscription or one whose term has passed', () => {
    const expired = subscription(a, { kind: 'all' }, { term: { kind: 'once' }, expired: true })
    const passed = subscription(a, { kind: 'all' }, { term: { kind: 'until', at: now } })
    const live = subscription(a, { kind: 'all' }, { term: { kind: 'until', at: at(6) } })
    expect(select([expired], {}, [a])).toEqual([])
    expect(select([passed], {}, [a])).toEqual([])
    expect(select([live], {}, [a])).toHaveLength(1)
  })
})
