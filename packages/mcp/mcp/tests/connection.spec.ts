import { describe, expect, it } from 'vitest'
import type { ConnectionKey } from '@omne-harness/mcp-contract'
import { Connection } from '../src/internal/connection.ts'
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

function inState(state: StateKind): Connection {
  const connection = new Connection(key)
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

describe('Connection', () => {
  it('starts in none with generation 0 and no peer', () => {
    const connection = new Connection(key)
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
          const connection = inState(from)
          const before = connection.state
          const generationBefore = connection.generation
          expect(() => fire(connection, event)).toThrow(TypeError)
          expect(connection.state).toEqual(before)
          expect(connection.generation).toBe(generationBefore)
        })
      else
        it(`moves from ${from} to ${to} on ${event}`, () => {
          const connection = inState(from)
          fire(connection, event)
          expect(connection.state.kind).toBe(to)
        })
    }

  it('records the degraded reason and the lost reason', () => {
    const degraded = inState('ready')
    degraded.degrade('discover-failed')
    expect(degraded.state).toEqual({ kind: 'degraded', reason: 'discover-failed' })
    const lost = inState('preparing')
    lost.lose('stream-broken')
    expect(lost.state).toEqual({ kind: 'lost', reason: 'stream-broken' })
    const lostWithout = inState('ready')
    lostWithout.lose('session-ended')
    expect(lostWithout.state).toEqual({ kind: 'lost', reason: 'session-ended' })
  })

  it('keeps the peer from ready through degraded and back', () => {
    const connection = inState('ready')
    expect(connection.peer).toBe(peer)
    connection.degrade('list-failed')
    expect(connection.peer).toBe(peer)
    const other = peerIdentityOf('2025-11-25')
    connection.ready(other)
    expect(connection.peer).toBe(other)
  })

  it('is current only for the present generation while ready or degraded', () => {
    const connection = inState('ready')
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
    const connection = new Connection(key, generationOf(7))
    expect(connection.generation).toBe(7)
    const attempt = connection.attempt()
    expect(attempt).toBe(8)
    connection.ready(peer)
    expect(connection.generation).toBe(8)
  })
})

describe('Connection generation under on-negotiation', () => {
  it('adds one only when a negotiation succeeds', () => {
    const connection = new Connection(key)
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
    const connection = inState('degraded')
    connection.ready(peer)
    expect(connection.generation).toBe(1)
  })
})
