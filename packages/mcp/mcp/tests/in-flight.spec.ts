// The in-flight table: reservation is one step, only the same tenant and principal cancel, a key
// not in the table is unknown, a changed generation is unknown, and a cancel between the
// reservation and the send keeps the call from being sent.
import { describe, expect, it } from 'vitest'
import { isCorrelationKey, type CorrelationKey } from '@omne-harness/mcp-contract'
import { InFlightCalls, type InFlightKey } from '../src/internal/in-flight.ts'
import { settled } from './doubles/deferred.ts'
import { generationOf } from '@omne-harness/mcp-contract/testing'
import { away, home } from './doubles/identities.ts'

function correlation(text: string): CorrelationKey {
  if (!isCorrelationKey(text)) throw new TypeError('bad correlation key sample')
  return text
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
    calls.markSent(aliceCall, 'req-1', generationOf(1))
    calls.markEnded(aliceCall)
    expect(calls.reserve(aliceCall)).toBe('reserved')
    calls.release(aliceCall)
    expect(calls.reserve(aliceCall)).toBe('reserved')
  })
})

describe('InFlightCalls.cancel', () => {
  it('answers unknown for a key not in the table', () => {
    const calls = new InFlightCalls()
    expect(calls.cancel(aliceCall, generationOf(1))).toBe('unknown')
  })

  it('answers unknown to another principal and to another tenant of the same correlation key', () => {
    const calls = new InFlightCalls()
    calls.reserve(aliceCall)
    calls.markSent(aliceCall, 'req-1', generationOf(1))
    expect(calls.cancel(bobCall, generationOf(1))).toBe('unknown')
    expect(calls.cancel(malloryCall, generationOf(1))).toBe('unknown')
    expect(calls.cancel(aliceCall, generationOf(1))).toBe('signalled')
  })

  it('signals a sent call of the current generation and keeps its request identifier', () => {
    const calls = new InFlightCalls()
    calls.reserve(aliceCall)
    expect(calls.markSent(aliceCall, 'req-7', generationOf(3))).toBe('sent')
    expect(calls.requestIdOf(aliceCall)).toBe('req-7')
    expect(calls.cancel(aliceCall, generationOf(3))).toBe('signalled')
    expect(calls.requestIdOf(aliceCall)).toBe('req-7')
  })

  it('answers unknown once the connection generation has changed', () => {
    const calls = new InFlightCalls()
    calls.reserve(aliceCall)
    calls.markSent(aliceCall, 'req-7', generationOf(3))
    expect(calls.cancel(aliceCall, generationOf(4))).toBe('unknown')
  })

  it('answers no-call-in-flight for an ended key', () => {
    const calls = new InFlightCalls()
    calls.reserve(aliceCall)
    calls.markSent(aliceCall, 'req-7', generationOf(3))
    calls.markEnded(aliceCall)
    expect(calls.cancel(aliceCall, generationOf(3))).toBe('no-call-in-flight')
    expect(calls.requestIdOf(aliceCall)).toBeUndefined()
  })

  it('keeps a call reserved but not yet sent from being sent', () => {
    const calls = new InFlightCalls()
    calls.reserve(aliceCall)
    expect(calls.cancel(aliceCall, generationOf(1))).toBe('signalled')
    expect(calls.markSent(aliceCall, 'req-1', generationOf(1))).toBe('cancelled')
    expect(calls.requestIdOf(aliceCall)).toBeUndefined()
    expect(calls.cancel(aliceCall, generationOf(1))).toBe('no-call-in-flight')
  })

  it('answers unknown after a reservation is released', () => {
    const calls = new InFlightCalls()
    calls.reserve(aliceCall)
    calls.release(aliceCall)
    expect(calls.cancel(aliceCall, generationOf(1))).toBe('unknown')
  })
})

describe('InFlightCalls precondition', () => {
  it('refuses markSent for a key that is not reserved', () => {
    const calls = new InFlightCalls()
    expect(() => calls.markSent(aliceCall, 'req-1', generationOf(1))).toThrow(TypeError)
  })

  it('leaves a sent entry alone on release', () => {
    const calls = new InFlightCalls()
    calls.reserve(aliceCall)
    calls.markSent(aliceCall, 'req-1', generationOf(1))
    calls.release(aliceCall)
    expect(calls.requestIdOf(aliceCall)).toBe('req-1')
  })
})
