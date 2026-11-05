// The in-flight table: reservation is one step, only the same tenant and principal cancel, a key
// not in the table is unknown, a changed generation is unknown, a cancel between the reservation
// and the send keeps the call from being sent, and a cancel fires the stop signal of the call.
import { describe, expect, it } from 'vitest'
import type { Generation } from '@omne-harness/mcp-contract'
import type { ConnectionView } from '../src/internal/entry.ts'
import { InFlightCalls, type InFlightKey } from '../src/internal/in-flight.ts'
import { settled } from './doubles/deferred.ts'
import { correlationKeyOf, generationOf } from '@omne-harness/mcp-contract/testing'
import { away, home } from './doubles/identities.ts'

const correlation = correlationKeyOf

/** A connection view whose current generation the test moves. */
function connectionAt(generation: Generation): ConnectionView & { current: Generation } {
  const view = {
    current: generation,
    get generation() {
      return view.current
    },
    isCurrent: (asked: Generation) => asked === view.current,
  }
  return view
}

const aliceCall: InFlightKey = {
  tenant: home,
  principalKey: 'alice',
  correlationKey: correlation('c1'),
}
const bobCall: InFlightKey = {
  tenant: home,
  principalKey: 'bob',
  correlationKey: correlation('c1'),
}
const malloryCall: InFlightKey = {
  tenant: away,
  principalKey: 'alice',
  correlationKey: correlation('c1'),
}

describe('InFlightCalls.reserve', () => {
  it('reserves once and answers in-use to a second reservation of the same key', () => {
    const calls = new InFlightCalls()
    expect(calls.reserve(aliceCall)).toBe('reserved')
    expect(calls.reserve(aliceCall)).toBe('in-use')
  })

  it('gives exactly one of two concurrent callers the reservation', async () => {
    const calls = new InFlightCalls()
    const caller = async () => {
      const answer = calls.reserve(aliceCall)
      await settled()
      return answer
    }
    const answers = await Promise.all([caller(), caller()])
    expect(answers.filter(answer => answer === 'reserved')).toHaveLength(1)
    expect(answers.filter(answer => answer === 'in-use')).toHaveLength(1)
  })

  it('keys by tenant and principal, so other principals reserve the same correlation key', () => {
    const calls = new InFlightCalls()
    expect(calls.reserve(aliceCall)).toBe('reserved')
    expect(calls.reserve(bobCall)).toBe('reserved')
    expect(calls.reserve(malloryCall)).toBe('reserved')
  })

  it('lets an ended key be reserved again, and a released reservation too', () => {
    const calls = new InFlightCalls()
    calls.reserve(aliceCall)
    calls.markSent(aliceCall, connectionAt(generationOf(1)))
    calls.markEnded(aliceCall)
    expect(calls.reserve(aliceCall)).toBe('reserved')
    calls.release(aliceCall)
    expect(calls.reserve(aliceCall)).toBe('reserved')
  })
})

describe('InFlightCalls.cancel', () => {
  it('answers unknown for a key not in the table', () => {
    const calls = new InFlightCalls()
    expect(calls.cancel(aliceCall)).toBe('unknown')
  })

  it('answers unknown to another principal and to another tenant of the same correlation key', () => {
    const calls = new InFlightCalls()
    calls.reserve(aliceCall)
    calls.markSent(aliceCall, connectionAt(generationOf(1)))
    expect(calls.cancel(bobCall)).toBe('unknown')
    expect(calls.cancel(malloryCall)).toBe('unknown')
    expect(calls.cancel(aliceCall)).toBe('signalled')
  })

  it('signals a sent call of the current generation and fires its stop signal', () => {
    const calls = new InFlightCalls()
    calls.reserve(aliceCall)
    const stop = calls.stopOf(aliceCall)
    expect(calls.markSent(aliceCall, connectionAt(generationOf(3)))).toBe('sent')
    expect(calls.stopOf(aliceCall)).toBe(stop)
    expect(stop?.aborted).toBe(false)
    expect(calls.cancel(aliceCall)).toBe('signalled')
    expect(stop?.aborted).toBe(true)
  })

  it('answers unknown once the connection generation has changed, and fires nothing', () => {
    const calls = new InFlightCalls()
    calls.reserve(aliceCall)
    const connection = connectionAt(generationOf(3))
    calls.markSent(aliceCall, connection)
    connection.current = generationOf(4)
    expect(calls.cancel(aliceCall)).toBe('unknown')
    expect(calls.stopOf(aliceCall)?.aborted).toBe(false)
  })

  it('answers no-call-in-flight for an ended key, which has no stop signal', () => {
    const calls = new InFlightCalls()
    calls.reserve(aliceCall)
    calls.markSent(aliceCall, connectionAt(generationOf(3)))
    calls.markEnded(aliceCall)
    expect(calls.cancel(aliceCall)).toBe('no-call-in-flight')
    expect(calls.stopOf(aliceCall)).toBeUndefined()
  })

  it('keeps a call reserved but not yet sent from being sent, and fires its stop signal', () => {
    const calls = new InFlightCalls()
    calls.reserve(aliceCall)
    const stop = calls.stopOf(aliceCall)
    expect(calls.cancel(aliceCall)).toBe('signalled')
    expect(stop?.aborted).toBe(true)
    expect(calls.markSent(aliceCall, connectionAt(generationOf(1)))).toBe('cancelled')
    expect(calls.stopOf(aliceCall)).toBeUndefined()
    expect(calls.cancel(aliceCall)).toBe('no-call-in-flight')
  })

  it('answers unknown after a reservation is released', () => {
    const calls = new InFlightCalls()
    calls.reserve(aliceCall)
    calls.release(aliceCall)
    expect(calls.cancel(aliceCall)).toBe('unknown')
    expect(calls.stopOf(aliceCall)).toBeUndefined()
  })
})

describe('InFlightCalls precondition', () => {
  it('refuses markSent for a key that is not reserved', () => {
    const calls = new InFlightCalls()
    expect(() => calls.markSent(aliceCall, connectionAt(generationOf(1)))).toThrow(TypeError)
  })

  it('leaves a sent entry alone on release', () => {
    const calls = new InFlightCalls()
    calls.reserve(aliceCall)
    calls.markSent(aliceCall, connectionAt(generationOf(1)))
    calls.release(aliceCall)
    expect(calls.cancel(aliceCall)).toBe('signalled')
  })
})
