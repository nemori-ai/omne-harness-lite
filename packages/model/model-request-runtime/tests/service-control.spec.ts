import { describe, expect, it } from 'vitest'
import { classifyInterrupt, classifyRelease, type ControlFacts } from '../src/service-control.ts'

const absent: ControlFacts = { durable: { absent: true }, localCall: false }
const unavailable: ControlFacts = { durable: { unavailable: true }, localCall: true }
const known = (
  phase: Extract<ControlFacts['durable'], { phase: unknown }>['phase'],
  intentExists = false,
): ControlFacts => ({ durable: { phase, intentExists }, localCall: true })

describe('RT7 S-31/S-32 control admission from owned facts', () => {
  it('distinguishes absent, unknown, and an unrecorded open call', () => {
    expect(classifyInterrupt(absent)).toEqual({ rejected: 'callNotFound' })
    expect(classifyRelease(absent)).toEqual({ rejected: 'callNotFound' })
    expect(classifyInterrupt(unavailable)).toEqual({ rejected: 'unavailable' })
    expect(classifyRelease(unavailable)).toEqual({ rejected: 'unavailable' })
    expect(classifyInterrupt({ durable: { absent: true }, localCall: true })).toEqual({
      stage: 'before_dispatch',
      intentExists: false,
    })
    expect(
      classifyInterrupt({ durable: { noDispatch: true, intentExists: true }, localCall: true }),
    ).toEqual({ stage: 'before_dispatch', intentExists: true })
    expect(
      classifyInterrupt({ durable: { noDispatch: true, intentExists: true }, localCall: false }),
    ).toEqual({ rejected: 'unavailable' })
  })

  it('returns the durable control stage and preserves an existing intent', () => {
    expect(classifyInterrupt(known('awaiting_decision'))).toEqual({
      stage: 'before_dispatch',
      intentExists: false,
    })
    expect(classifyInterrupt(known('resumable', true))).toEqual({
      stage: 'before_dispatch',
      intentExists: true,
    })
    expect(classifyInterrupt(known('in_flight', true))).toEqual({
      stage: 'in_flight',
      intentExists: true,
    })
    expect(classifyInterrupt(known('speaking'))).toEqual({
      stage: 'speaking',
      intentExists: false,
    })
  })

  it('absorbs terminal phases and a local pending reply before examining intent', () => {
    for (const phase of ['complete', 'interrupted', 'handed_up'] as const) {
      expect(classifyInterrupt(known(phase, true))).toEqual({ rejected: 'alreadyEnded' })
      expect(classifyRelease(known(phase, true))).toEqual({ rejected: 'alreadyEnded' })
    }
    const pending: ControlFacts = {
      ...known('speaking', true),
      operation: { phase: 'reply_pending' },
    }
    expect(classifyInterrupt(pending)).toEqual({ rejected: 'alreadyEnded' })
    expect(classifyRelease(pending)).toEqual({ wrongPhase: 'reply_pending' })
  })

  it('releases only awaiting_decision or resumable', () => {
    expect(classifyRelease(known('awaiting_decision'))).toEqual({ allowed: true })
    expect(classifyRelease(known('resumable'))).toEqual({ allowed: true })
    expect(classifyRelease(known('in_flight'))).toEqual({ wrongPhase: 'in_flight' })
    expect(classifyRelease({ durable: { absent: true }, localCall: true })).toEqual({
      wrongPhase: 'open',
    })
  })
})
