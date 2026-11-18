import { describe, expect, it } from 'vitest'
import { notificationProtocol } from '@omne-harness/notification-protocol'
import { expectRoundTrip, readSample, tenant } from './fixtures/samples.ts'

const { operations, observations } = notificationProtocol
const person = { kind: 'person' }
const agent = { kind: 'agent', ref: 'session-7' }
const instant = '2026-11-18T06:00:00Z'
const marks = { seenAt: null, resolved: null, supersededBy: null }
const resolved = {
  seenAt: instant,
  resolved: { how: 'done', at: instant },
  supersededBy: { source: 'demo.builds', event: 'b2' },
}
const summary = {
  source: 'demo.builds',
  event: 'b1',
  recipient: person,
  sequence: 3,
  type: 'failed',
  title: 'Build b1 failed',
  level: 'strong',
  cause: { kind: 'subscription', scope: { kind: 'subject-prefix', prefix: 'repo/' }, note: null },
  acceptedAt: instant,
  marks,
}
const subscription = {
  recipient: agent,
  source: 'demo.builds',
  type: 'failed',
  scope: { kind: 'subject', equals: 'repo/a' },
  level: 'strong',
  note: 'open a card',
  term: { kind: 'until', at: instant },
  basis: { kind: 'granular', decision: 'card-17' },
  expired: false,
}
const destination = {
  recipient: person,
  id: 'default',
  channel: 'in-app',
  address: '',
  minLevel: 'weak',
  builtin: true,
  blockedSince: null,
  state: 'enabled',
}
const READS = [
  'list-inbox',
  'read-notification',
  'query-send',
  'list-subscriptions',
  'read-beat',
  'list-destinations',
  'list-sources',
  'list-channels',
]
const COMMITS = [
  'mark',
  'set-subscription',
  'remove-subscription',
  'set-beat',
  'add-destination',
  'change-destination',
  'remove-destination',
]

describe('notification/v1', () => {
  it('is notification major 1 with eight reads, seven commits and one observation', () => {
    expect([notificationProtocol.name, notificationProtocol.major]).toEqual(['notification', 1])
    expect(Object.keys(operations).sort()).toEqual([...READS, ...COMMITS].sort())
    expect(Object.keys(observations)).toEqual(['observe-changes'])
    for (const [name, operation] of Object.entries(operations)) {
      expect([name, operation.effect]).toEqual([name, READS.includes(name) ? 'read' : 'commit'])
      expect([operation.identity, operation.limit, operation.countsAsAccess]).toEqual([
        'login',
        'small',
        true,
      ])
    }
  })

  it('gives every commit an answer for nothing changed and for an unknown result, and no read either', () => {
    for (const [name, operation] of Object.entries(operations)) {
      const outcomes = Object.keys(operation.outcomes)
      expect([name, outcomes.includes('unknown')]).toEqual([name, COMMITS.includes(name)])
      expect([name, outcomes.includes('no-change')]).toEqual([name, COMMITS.includes(name)])
      for (const fixed of ['denied', 'basis-unavailable', 'protocol-rejected'])
        expect([name, fixed, outcomes.includes(fixed)]).toEqual([name, fixed, true])
    }
  })
})

describe('the inbox', () => {
  it('lists a page of summaries with a cursor', () => {
    const body = { tenant, recipient: person, filter: 'unresolved', after: null, limit: 20 }
    expectRoundTrip(operations['list-inbox'].body, body)
    expectRoundTrip(operations['list-inbox'].body, {
      ...body,
      recipient: agent,
      filter: 'all',
      after: 7,
    })
    expectRoundTrip(operations['list-inbox'].outcomes.succeeded, { entries: [summary], next: 3 })
    expectRoundTrip(operations['list-inbox'].outcomes.succeeded, { entries: [], next: null })
    expectRoundTrip(operations['list-inbox'].outcomes['not-found'], {})
    for (const bad of [
      { ...body, limit: 0 },
      { ...body, limit: 101 },
      { ...body, after: -1 },
      { ...body, filter: 'open' },
      { ...body, recipient: { kind: 'team' } },
      { ...body, recipient: { kind: 'agent', ref: '' } },
      { ...body, extra: true },
    ])
      expect(readSample(operations['list-inbox'].body, bad).ok).toBe(false)
  })

  it('reads one notification in full, with every kind of cause and every mark', () => {
    expectRoundTrip(operations['read-notification'].body, {
      tenant,
      recipient: person,
      source: 'demo.builds',
      event: 'b1',
    })
    const view = {
      ...summary,
      subject: 'repo/a',
      at: instant,
      body: '',
      locator: { kind: 'build', ref: 'b1' },
    }
    expectRoundTrip(operations['read-notification'].outcomes.succeeded, view)
    for (const cause of [{ kind: 'named' }, { kind: 'type-default' }])
      expectRoundTrip(operations['read-notification'].outcomes.succeeded, {
        ...view,
        cause,
        marks: resolved,
        subject: null,
        locator: null,
        level: 'weak',
      })
    expect(
      readSample(operations['read-notification'].outcomes.succeeded, { ...view, level: 'off' }).ok,
    ).toBe(false)
    expect(
      readSample(operations['read-notification'].outcomes.succeeded, { ...view, title: '' }).ok,
    ).toBe(false)
  })

  it('marks with one of four operations and says why a mark conflicts', () => {
    const body = {
      tenant,
      recipient: person,
      source: 'demo.builds',
      event: 'b1',
      operation: 'done',
    }
    for (const operation of ['seen', 'done', 'dismiss', 'restore'])
      expectRoundTrip(operations.mark.body, { ...body, operation })
    expect(readSample(operations.mark.body, { ...body, operation: 'archive' }).ok).toBe(false)
    expectRoundTrip(operations.mark.outcomes.succeeded, resolved)
    expectRoundTrip(operations.mark.outcomes['no-change'], marks)
    for (const reason of ['restore-first', 'superseded'])
      expectRoundTrip(operations.mark.outcomes.conflict, { reason })
    expect(readSample(operations.mark.outcomes.conflict, { reason: 'other' }).ok).toBe(false)
  })

  it('answers what became of a send', () => {
    expectRoundTrip(operations['query-send'].body, { tenant, source: 'demo.builds', event: 'b1' })
    expectRoundTrip(operations['query-send'].outcomes.succeeded, { kind: 'not-submitted' })
    expectRoundTrip(operations['query-send'].outcomes.succeeded, {
      kind: 'accepted',
      notifications: [
        { recipient: person, marks },
        { recipient: agent, marks: resolved },
      ],
    })
  })
})

describe('subscriptions and the beat', () => {
  it('sets, lists and removes a subscription over every scope, level, term and basis', () => {
    const { basis: _basis, expired: _expired, ...change } = subscription
    expectRoundTrip(operations['set-subscription'].body, { tenant, ...change })
    for (const scope of [{ kind: 'all' }, { kind: 'subject-prefix', prefix: 'repo/' }])
      for (const term of [{ kind: 'standing' }, { kind: 'once' }])
        for (const level of ['off', 'weak', 'strong'])
          expectRoundTrip(operations['set-subscription'].body, {
            tenant,
            ...change,
            scope,
            term,
            level,
            note: null,
          })
    for (const basis of [{ kind: 'owner' }, { kind: 'blanket', generation: 0 }])
      expectRoundTrip(operations['set-subscription'].outcomes.succeeded, {
        ...subscription,
        basis,
        expired: true,
      })
    expectRoundTrip(operations['set-subscription'].outcomes['no-change'], subscription)
    expectRoundTrip(operations['list-subscriptions'].outcomes.succeeded, {
      subscriptions: [subscription],
    })
    const { level: _level, note: _note, term: _term, ...key } = change
    expectRoundTrip(operations['remove-subscription'].body, { tenant, ...key })
    expect(readSample(operations['remove-subscription'].body, { tenant, ...change }).ok).toBe(false)
    expectRoundTrip(operations['remove-subscription'].outcomes.succeeded, {})
    expectRoundTrip(operations['remove-subscription'].outcomes['no-change'], {})
    for (const bad of [
      { ...change, scope: { kind: 'subject-suffix', suffix: 'x' } },
      { ...change, term: { kind: 'until' } },
      { ...change, level: 'loud' },
      { ...change, note: '' },
    ])
      expect(readSample(operations['set-subscription'].body, { tenant, ...bad }).ok).toBe(false)
  })

  it('reads and sets a beat', () => {
    const beats = [{ kind: 'default' }, { kind: 'off' }, { kind: 'every', minutes: 30 }]
    for (const beat of beats) {
      expectRoundTrip(operations['set-beat'].body, { tenant, recipient: person, beat })
      expectRoundTrip(operations['set-beat'].outcomes.succeeded, beat)
      expectRoundTrip(operations['set-beat'].outcomes['no-change'], beat)
      expectRoundTrip(operations['read-beat'].outcomes.succeeded, beat)
    }
    const zero = { tenant, recipient: person, beat: { kind: 'every', minutes: 0 } }
    expect(readSample(operations['set-beat'].body, zero).ok).toBe(false)
  })
})

describe('destinations and the catalogue', () => {
  it('lists, adds, changes and removes a destination', () => {
    expectRoundTrip(operations['list-destinations'].outcomes.succeeded, {
      destinations: [
        destination,
        { ...destination, blockedSince: instant, state: 'channel-absent' },
      ],
    })
    const add = { tenant, recipient: person, channel: 'mail', address: 'me@x', minLevel: 'strong' }
    expectRoundTrip(operations['add-destination'].body, add)
    expect(readSample(operations['add-destination'].body, { ...add, minLevel: 'off' }).ok).toBe(
      false,
    )
    const ref = { tenant, recipient: person, id: 'default' }
    for (const patch of [
      { enabled: false },
      { minLevel: 'strong' },
      { enabled: true, minLevel: 'weak' },
      {},
    ])
      expectRoundTrip(operations['change-destination'].body, { ...ref, ...patch })
    expectRoundTrip(operations['change-destination'].outcomes['not-found'], {})
    expectRoundTrip(operations['remove-destination'].body, ref)
    expectRoundTrip(operations['remove-destination'].outcomes['not-writable'], {})
  })

  it('lists sources with their event types, and channels', () => {
    const type = {
      name: 'failed',
      label: 'Build failed',
      description: '',
      kind: 'event',
      subject: { presence: 'optional', hint: '' },
      subscribable: ['person', 'agent'],
      nameable: [],
      defaults: { person: 'strong', agent: 'off' },
      external: false,
    }
    expectRoundTrip(operations['list-sources'].body, { tenant })
    expectRoundTrip(operations['list-sources'].outcomes.succeeded, {
      sources: [
        { name: 'demo.builds', label: 'Builds', types: [type, { ...type, kind: 'standing' }] },
      ],
    })
    expectRoundTrip(operations['list-channels'].outcomes.succeeded, {
      channels: [{ name: 'in-app', label: '应用内', leavesSystem: false, addressHint: '' }],
    })
  })
})

describe('the observation', () => {
  it('opens for a tenant and says only what may have changed', () => {
    const observe = observations['observe-changes']
    expect([observe.identity, observe.ends]).toEqual(['login', []])
    expectRoundTrip(observe.open, { tenant })
    for (const about of ['inbox', 'catalog'])
      expectRoundTrip(observe.frame, { kind: 'changed', about })
    expect(readSample(observe.frame, { kind: 'changed', about: 'inbox', entries: [] }).ok).toBe(
      false,
    )
    expect(readSample(observe.frame, { kind: 'changed', about: 'everything' }).ok).toBe(false)
  })
})

describe('the invalid outcome', () => {
  const INVALID: Record<string, readonly string[]> = {
    'list-inbox': [],
    'read-notification': [],
    mark: [],
    'query-send': [],
    'list-subscriptions': [],
    'set-subscription': ['term-in-past', 'not-subscribable', 'scope-does-not-fit'],
    'remove-subscription': [],
    'read-beat': [],
    'set-beat': ['out-of-range'],
    'list-destinations': [],
    'add-destination': ['address'],
    'change-destination': [],
    'remove-destination': [],
  }

  it('names the value rules of the domain and, where there are any, what else it refuses', () => {
    const all = operations as Record<string, { outcomes: Record<string, unknown> }>
    const declared = Object.keys(all).filter(name => 'invalid' in all[name]!.outcomes)
    expect(declared.sort()).toEqual(Object.keys(INVALID).sort())
    for (const [name, more] of Object.entries(INVALID)) {
      const codec = all[name]!.outcomes.invalid as never
      for (const reason of ['request', ...more]) expectRoundTrip(codec, { reason })
      const foreign = ['out-of-range', 'address', 'term-in-past'].filter(r => !more.includes(r))
      for (const reason of ['', ...foreign]) expect(readSample(codec, { reason }).ok).toBe(false)
    }
  })
})
