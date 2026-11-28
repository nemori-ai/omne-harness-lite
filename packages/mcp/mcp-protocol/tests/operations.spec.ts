import { expectRoundTrip } from './fixtures/samples.ts'
import { describe, expect, it } from 'vitest'
import { mcpProtocol } from '@omne-harness/mcp-protocol'

const { operations } = mcpProtocol

describe('mcp/v1', () => {
  it('is mcp major 1 with the nine operations and the one observation', () => {
    expect(mcpProtocol.name).toBe('mcp')
    expect(mcpProtocol.major).toBe(1)
    expect(Object.keys(operations)).toEqual([
      'list-endpoints',
      'read-endpoint',
      'refresh-endpoint',
      'begin-connect',
      'disconnect',
      'list-event-types',
      'subscribe-events',
      'unsubscribe-events',
      'read-events',
    ])
    expect(Object.keys(mcpProtocol.observations)).toEqual(['observe-endpoints'])
  })

  // C208: only a person's login connects or disconnects; both came at revision 3.
  it('begin-connect and disconnect came at revision 3, want a login and commit', () => {
    for (const name of ['begin-connect', 'disconnect'] as const) {
      const operation = operations[name]
      expect([operation.identity, operation.effect, operation.since], name).toEqual([
        'login',
        'commit',
        3,
      ])
    }
  })

  it('list-event-types came at revision 4, wants a login and only reads (C301)', () => {
    const operation = operations['list-event-types']
    expect([operation.identity, operation.effect, operation.since]).toEqual(['login', 'read', 4])
    expectRoundTrip(operation.outcomes.succeeded, {
      events: { kind: 'acquired', types: [{ name: 'a', description: '', delivery: ['push'] }] },
    })
    expectRoundTrip(operation.outcomes.succeeded, { events: { kind: 'not-declared' } })
    expectRoundTrip(operation.outcomes.succeeded, { events: { kind: 'not-acquired' } })
  })

  // C302, MC-35: a person subscribes, unsubscribes and reads what came; agents have no way in.
  it('the three subscription operations came at revision 4 and want a login', () => {
    const shapes = ['subscribe-events', 'unsubscribe-events', 'read-events'] as const
    expect(
      shapes.map(name => [
        operations[name].identity,
        operations[name].effect,
        operations[name].since,
      ]),
    ).toEqual([
      ['login', 'commit', 4],
      ['login', 'commit', 4],
      ['login', 'read', 4],
    ])
    const subscription = {
      name: 'incident.created',
      arguments: { queue: 'ops' },
      delivery: 'push',
      state: 'terminated',
      reason: 'refused',
      subscribers: 1,
    }
    expectRoundTrip(operations['subscribe-events'].outcomes.succeeded, { subscription })
    expectRoundTrip(operations['subscribe-events'].outcomes.unsupported, { reason: 'webhook-only' })
    expectRoundTrip(operations['read-events'].outcomes.succeeded, {
      subscription: { ...subscription, state: 'receiving', reason: null },
      items: [
        {
          seq: 1,
          receivedAt: '2026-11-27T22:00:00.000Z',
          kind: 'event',
          eventId: 'e1',
          name: 'incident.created',
          timestamp: '2026-11-27T21:59:59Z',
          data: { id: 'e1' },
        },
        { seq: 2, receivedAt: '2026-11-27T22:00:00.000Z', kind: 'gap', reason: 'possibly-missed' },
      ],
    })
  })

  it('observe-endpoints came at revision 2, wants a login and has no end of its own', () => {
    const observation = mcpProtocol.observations['observe-endpoints']
    expect({
      identity: observation.identity,
      since: observation.since,
      ends: observation.ends,
    }).toEqual({ identity: 'login', since: 2, ends: [] })
  })

  it('the two reads are login reads and the refresh is a login commit, all of the small limit', () => {
    const shape = (name: keyof typeof operations) => ({
      identity: operations[name].identity,
      effect: operations[name].effect,
      limit: operations[name].limit,
    })
    expect(shape('list-endpoints')).toEqual({ identity: 'login', effect: 'read', limit: 'small' })
    expect(shape('read-endpoint')).toEqual({ identity: 'login', effect: 'read', limit: 'small' })
    expect(shape('refresh-endpoint')).toEqual({
      identity: 'login',
      effect: 'commit',
      limit: 'small',
    })
  })

  it('answers each operation with exactly its own outcomes and the fixed ones', () => {
    const outcomes = (name: keyof typeof operations) =>
      Object.keys(operations[name].outcomes).sort()
    expect(outcomes('list-endpoints')).toEqual(
      ['basis-unavailable', 'denied', 'protocol-rejected', 'succeeded'].sort(),
    )
    expect(outcomes('read-endpoint')).toEqual(
      ['basis-unavailable', 'denied', 'not-visible', 'protocol-rejected', 'succeeded'].sort(),
    )
    expect(outcomes('refresh-endpoint')).toEqual(
      [
        'basis-unavailable',
        'denied',
        'not-visible',
        'protocol-rejected',
        'succeeded',
        'unknown',
      ].sort(),
    )
  })
})
