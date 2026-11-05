// The in-flight table: reservation is one step and hands out the call's one stop signal, only
// the same tenant and principal cancel, a key not in the table is unknown, a changed generation
// is unknown, a cancel fires the stop signal of the call, and the one conclusion of a key goes by
// the phase the call reached and whether its stop signal fired.
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

/** A reservation of `key` under a caller signal the test controls; answers the stop signal. */
function reserved(calls: InFlightCalls, key: InFlightKey, controller = new AbortController()) {
  const stop = calls.reserve(key, controller.signal)
  if (stop === 'in-use') throw new Error('the key is in use')
  return { stop, controller }
}

describe('InFlightCalls.reserve', () => {
  it('reserves once and answers in-use to a second reservation of the same key', () => {
    const calls = new InFlightCalls()
    expect(calls.reserve(aliceCall, new AbortController().signal)).not.toBe('in-use')
    expect(calls.reserve(aliceCall, new AbortController().signal)).toBe('in-use')
  })

  it('gives exactly one of two concurrent callers the reservation', async () => {
    const calls = new InFlightCalls()
    const caller = async () => {
      const answer = calls.reserve(aliceCall, new AbortController().signal)
      await settled()
      return answer
    }
    const answers = await Promise.all([caller(), caller()])
    expect(answers.filter(answer => answer !== 'in-use')).toHaveLength(1)
    expect(answers.filter(answer => answer === 'in-use')).toHaveLength(1)
  })

  it('keys by tenant and principal, so other principals reserve the same correlation key', () => {
    const calls = new InFlightCalls()
    expect(calls.reserve(aliceCall, new AbortController().signal)).not.toBe('in-use')
    expect(calls.reserve(bobCall, new AbortController().signal)).not.toBe('in-use')
    expect(calls.reserve(malloryCall, new AbortController().signal)).not.toBe('in-use')
  })

  it('hands out a stop signal that the caller signal fires', () => {
    const calls = new InFlightCalls()
    const { stop, controller } = reserved(calls, aliceCall)
    expect(stop.aborted).toBe(false)
    controller.abort()
    expect(stop.aborted).toBe(true)
  })

  it('hands out a stop signal that has fired when the caller signal fired already', () => {
    const calls = new InFlightCalls()
    const controller = new AbortController()
    controller.abort()
    expect(reserved(calls, aliceCall, controller).stop.aborted).toBe(true)
  })

  it('lets an ended key be reserved again, and a key whose place was given back too', () => {
    const calls = new InFlightCalls()
    reserved(calls, aliceCall)
    calls.markSent(aliceCall, connectionAt(generationOf(1)), generationOf(1))
    calls.conclude(aliceCall, 'sent')
    reserved(calls, aliceCall)
    calls.conclude(aliceCall, 'unsent')
    expect(calls.reserve(aliceCall, new AbortController().signal)).not.toBe('in-use')
  })
})

describe('InFlightCalls.cancel', () => {
  it('answers unknown for a key not in the table', () => {
    const calls = new InFlightCalls()
    expect(calls.cancel(aliceCall)).toBe('unknown')
  })

  it('answers unknown to another principal and to another tenant of the same correlation key', () => {
    const calls = new InFlightCalls()
    reserved(calls, aliceCall)
    calls.markSent(aliceCall, connectionAt(generationOf(1)), generationOf(1))
    expect(calls.cancel(bobCall)).toBe('unknown')
    expect(calls.cancel(malloryCall)).toBe('unknown')
    expect(calls.cancel(aliceCall)).toBe('signalled')
  })

  it('signals a sent call of the current generation and fires its stop signal', () => {
    const calls = new InFlightCalls()
    const { stop } = reserved(calls, aliceCall)
    calls.markSent(aliceCall, connectionAt(generationOf(3)), generationOf(3))
    expect(stop.aborted).toBe(false)
    expect(calls.cancel(aliceCall)).toBe('signalled')
    expect(stop.aborted).toBe(true)
  })

  it('answers unknown once the connection generation has changed, and fires nothing', () => {
    const calls = new InFlightCalls()
    const { stop } = reserved(calls, aliceCall)
    const connection = connectionAt(generationOf(3))
    calls.markSent(aliceCall, connection, generationOf(3))
    connection.current = generationOf(4)
    expect(calls.cancel(aliceCall)).toBe('unknown')
    expect(stop.aborted).toBe(false)
  })

  it('judges a sent call by the generation it was sent on, not by the generation of the view when it was recorded', () => {
    const calls = new InFlightCalls()
    const { stop } = reserved(calls, aliceCall)
    const connection = connectionAt(generationOf(2))
    calls.markSent(aliceCall, connection, generationOf(1))
    expect(calls.cancel(aliceCall)).toBe('unknown')
    expect(stop.aborted).toBe(false)
  })

  it('answers no-call-in-flight for an ended key', () => {
    const calls = new InFlightCalls()
    reserved(calls, aliceCall)
    calls.markSent(aliceCall, connectionAt(generationOf(3)), generationOf(3))
    calls.conclude(aliceCall, 'sent')
    expect(calls.cancel(aliceCall)).toBe('no-call-in-flight')
  })

  it('fires the stop signal of a call reserved but not yet sent, which then ends unsent', () => {
    const calls = new InFlightCalls()
    const { stop } = reserved(calls, aliceCall)
    expect(calls.cancel(aliceCall)).toBe('signalled')
    expect(stop.aborted).toBe(true)
    calls.conclude(aliceCall, 'unsent')
    expect(calls.cancel(aliceCall)).toBe('no-call-in-flight')
  })

  it('answers unknown after a reservation gave its place back', () => {
    const calls = new InFlightCalls()
    reserved(calls, aliceCall)
    calls.conclude(aliceCall, 'unsent')
    expect(calls.cancel(aliceCall)).toBe('unknown')
  })
})

describe('InFlightCalls.conclude', () => {
  it('ends a call not sent whose caller signal fired, like one that was cancelled', () => {
    const calls = new InFlightCalls()
    const { controller } = reserved(calls, aliceCall)
    controller.abort()
    calls.conclude(aliceCall, 'unsent')
    expect(calls.cancel(aliceCall)).toBe('no-call-in-flight')
  })

  it('gives the place back for a call not sent whose stop signal did not fire', () => {
    const calls = new InFlightCalls()
    reserved(calls, aliceCall)
    calls.conclude(aliceCall, 'unsent')
    expect(calls.cancel(aliceCall)).toBe('unknown')
    expect(calls.reserve(aliceCall, new AbortController().signal)).not.toBe('in-use')
  })

  it('ends a sent call, whether its stop signal fired or not', () => {
    const calls = new InFlightCalls()
    reserved(calls, aliceCall)
    calls.markSent(aliceCall, connectionAt(generationOf(1)), generationOf(1))
    calls.conclude(aliceCall, 'sent')
    expect(calls.cancel(aliceCall)).toBe('no-call-in-flight')
    const { controller } = reserved(calls, bobCall)
    calls.markSent(bobCall, connectionAt(generationOf(1)), generationOf(1))
    controller.abort()
    calls.conclude(bobCall, 'sent')
    expect(calls.cancel(bobCall)).toBe('no-call-in-flight')
  })

  it('ends a call that reached the sent phase without a record (a call that breached), and leaves an ended or absent key alone', () => {
    const calls = new InFlightCalls()
    reserved(calls, aliceCall)
    calls.conclude(aliceCall, 'sent')
    expect(calls.cancel(aliceCall)).toBe('no-call-in-flight')
    calls.conclude(aliceCall, 'unsent')
    expect(calls.cancel(aliceCall)).toBe('no-call-in-flight')
    calls.conclude(bobCall, 'unsent')
    expect(calls.cancel(bobCall)).toBe('unknown')
  })
})

describe('InFlightCalls precondition', () => {
  it('refuses markSent for a key that is not reserved', () => {
    const calls = new InFlightCalls()
    expect(() => calls.markSent(aliceCall, connectionAt(generationOf(1)), generationOf(1))).toThrow(
      TypeError,
    )
  })
})
