// The Connection aggregate: every lawful transition under both generation policies, with the
// generation value it leaves, every unlawful transition, and the late-result test `isCurrent`.
import { describe, expect, it } from 'vitest'
import type { ConnectionKey } from '@omne-harness/mcp-contract'
import { Connection, type GenerationPolicy } from '../src/internal/connection.ts'
import {
  adoptionRevisionOf,
  credentialBindingOf,
  generationOf,
  peerIdentityOf,
  endpointRefOf,
} from '@omne-harness/mcp-contract/testing'
import { home } from './doubles/identities.ts'

const key: ConnectionKey = {
  tenant: home,
  holding: endpointRefOf('files').holding,
  adoptionRevision: adoptionRevisionOf('r1'),
  account: { kind: 'credential', binding: credentialBindingOf('main') },
}
const peer = peerIdentityOf()

type StateKind = 'none' | 'preparing' | 'ready' | 'degraded' | 'lost' | 'closed'
type Event = 'attempt' | 'ready' | 'degrade' | 'lose' | 'close'

const STATES: readonly StateKind[] = ['none', 'preparing', 'ready', 'degraded', 'lost', 'closed']
const EVENTS: readonly Event[] = ['attempt', 'ready', 'degrade', 'lose', 'close']

/** The lawful transitions of the group state machine, as (from, event) -> to. */
const LAWFUL: ReadonlyMap<string, StateKind> = new Map([
  ['none attempt', 'preparing'],
  ['lost attempt', 'preparing'],
  ['preparing ready', 'ready'],
  ['degraded ready', 'ready'],
  ['ready degrade', 'degraded'],
  ['preparing lose', 'lost'],
  ['ready lose', 'lost'],
  ['degraded lose', 'lost'],
  ['none close', 'closed'],
  ['preparing close', 'closed'],
  ['ready close', 'closed'],
  ['degraded close', 'closed'],
  ['lost close', 'closed'],
])

function fire(connection: Connection, event: Event): void {
  switch (event) {
    case 'attempt':
      connection.attempt()
      return
    case 'ready':
      connection.ready(peer)
      return
    case 'degrade':
      connection.degrade('list-failed')
      return
    case 'lose':
      connection.lose('preparation-failed')
      return
    case 'close':
      connection.close()
      return
    default: {
      const exhaustive: never = event
      return exhaustive
    }
  }
}

/** A connection brought into `state` along a lawful path. */
function inState(policy: GenerationPolicy, state: StateKind): Connection {
  const connection = new Connection(key, policy)
  const path: Record<StateKind, readonly Event[]> = {
    none: [],
    preparing: ['attempt'],
    ready: ['attempt', 'ready'],
    degraded: ['attempt', 'ready', 'degrade'],
    lost: ['attempt', 'lose'],
    closed: ['close'],
  }
  for (const event of path[state]) fire(connection, event)
  return connection
}

describe.each<GenerationPolicy>(['on-attempt', 'on-negotiation'])('Connection (%s)', policy => {
  it('starts in none with generation 0 and no peer', () => {
    const connection = new Connection(key, policy)
    expect(connection.state).toEqual({ kind: 'none' })
    expect(connection.generation).toBe(0)
    expect(connection.peer).toBeUndefined()
    expect(connection.key).toBe(key)
  })

  for (const from of STATES)
    for (const event of EVENTS) {
      const to = LAWFUL.get(`${from} ${event}`)
      if (to === undefined)
        it(`refuses ${event} from ${from} with TypeError and keeps the state`, () => {
          const connection = inState(policy, from)
          const before = connection.state
          const generationBefore = connection.generation
          expect(() => fire(connection, event)).toThrow(TypeError)
          expect(connection.state).toEqual(before)
          expect(connection.generation).toBe(generationBefore)
        })
      else
        it(`moves from ${from} to ${to} on ${event}`, () => {
          const connection = inState(policy, from)
          fire(connection, event)
          expect(connection.state.kind).toBe(to)
        })
    }

  it('records the degraded reason, the lost reason and the residual', () => {
    const degraded = inState(policy, 'ready')
    degraded.degrade('discover-failed')
    expect(degraded.state).toEqual({ kind: 'degraded', reason: 'discover-failed' })
    const lost = inState(policy, 'preparing')
    lost.lose('stream-broken', [{ kind: 'process', confirmed: 'root-only' }])
    expect(lost.state).toEqual({
      kind: 'lost',
      reason: 'stream-broken',
      residual: [{ kind: 'process', confirmed: 'root-only' }],
    })
    const lostWithout = inState(policy, 'ready')
    lostWithout.lose('process-exited')
    expect(lostWithout.state).toEqual({ kind: 'lost', reason: 'process-exited' })
  })

  it('keeps the peer from ready through degraded and back', () => {
    const connection = inState(policy, 'ready')
    expect(connection.peer).toBe(peer)
    connection.degrade('list-failed')
    expect(connection.peer).toBe(peer)
    const other = peerIdentityOf('2025-11-25')
    connection.ready(other)
    expect(connection.peer).toBe(other)
  })

  it('is current only for the present generation while ready or degraded', () => {
    const connection = inState(policy, 'ready')
    const current = connection.generation
    expect(connection.isCurrent(current)).toBe(true)
    expect(connection.isCurrent(generationOf(current + 1))).toBe(false)
    connection.degrade('list-failed')
    expect(connection.isCurrent(current)).toBe(true)
    connection.lose('stream-broken')
    expect(connection.isCurrent(current)).toBe(false)
    connection.attempt()
    expect(connection.isCurrent(current)).toBe(false)
    connection.ready(peer)
    expect(connection.isCurrent(current)).toBe(false)
    expect(connection.isCurrent(connection.generation)).toBe(true)
    connection.close()
    expect(connection.isCurrent(connection.generation)).toBe(false)
  })

  it('continues the generation it is given', () => {
    const connection = new Connection(key, policy, generationOf(7))
    expect(connection.generation).toBe(7)
    const attempt = connection.attempt()
    expect(attempt).toBe(8)
    connection.ready(peer)
    expect(connection.generation).toBe(8)
  })
})

describe('Connection generation under on-attempt', () => {
  it('adds one at every attempt, failed attempts included', () => {
    const connection = new Connection(key, 'on-attempt')
    expect(connection.attempt()).toBe(1)
    expect(connection.generation).toBe(1)
    connection.lose('preparation-failed')
    expect(connection.generation).toBe(1)
    expect(connection.attempt()).toBe(2)
    expect(connection.generation).toBe(2)
    connection.ready(peer)
    expect(connection.generation).toBe(2)
    connection.lose('process-exited')
    expect(connection.attempt()).toBe(3)
    expect(connection.generation).toBe(3)
  })

  it('does not add one on recovery from degraded', () => {
    const connection = inState('on-attempt', 'degraded')
    connection.ready(peer)
    expect(connection.generation).toBe(1)
  })
})

describe('Connection generation under on-negotiation', () => {
  it('adds one only when a negotiation succeeds', () => {
    const connection = new Connection(key, 'on-negotiation')
    expect(connection.attempt()).toBe(1)
    expect(connection.generation).toBe(0)
    connection.lose('authorization-required')
    expect(connection.generation).toBe(0)
    expect(connection.attempt()).toBe(1)
    expect(connection.generation).toBe(0)
    connection.ready(peer)
    expect(connection.generation).toBe(1)
    connection.lose('negotiation-invalid')
    expect(connection.attempt()).toBe(2)
    expect(connection.generation).toBe(1)
    connection.ready(peer)
    expect(connection.generation).toBe(2)
  })

  it('does not add one on recovery from degraded', () => {
    const connection = inState('on-negotiation', 'degraded')
    connection.ready(peer)
    expect(connection.generation).toBe(1)
  })
})
