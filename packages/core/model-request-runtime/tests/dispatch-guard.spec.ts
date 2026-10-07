import { describe, expect, it } from 'vitest'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { dispatchGuard, type DispatchGuardPhase, type DispatchGuardInput } from '../src/index.ts'
import { guardInput, profile } from './dispatch-guard-fixture.ts'

function callAt(phase: DispatchGuardPhase): DispatchGuardInput['call'] {
  return { known: { session: 'session', callId: 'call', phase: { known: phase } } }
}
const spoke: DispatchGuardInput['dispatches'] = {
  known: { session: 'session', callId: 'call', opened: [{ known: true }, { known: false }] },
}

describe('RT4 S30/S50/S60 dispatchGuard', () => {
  it('recognizes known absence separately from unavailable authority and checks call identity', () => {
    expect(dispatchGuard(guardInput({ call: { known: null } }))).toEqual({
      rejected: 'callNotFound',
    })
    expect(dispatchGuard(guardInput({ call: { unknown: true } }))).toEqual({
      rejected: 'unavailable',
    })
    expect(
      dispatchGuard(
        guardInput({
          call: {
            known: {
              session: 'another-session',
              callId: 'call',
              phase: { known: 'complete' },
            },
          },
        }),
      ),
    ).toEqual({ rejected: 'callNotFound' })
    expect(
      dispatchGuard(
        guardInput({
          dispatches: {
            known: {
              session: 'session',
              callId: 'another-call',
              opened: [{ known: true }],
            },
          },
        }),
      ),
    ).toEqual({ rejected: 'invalidInput' })
  })

  it.each(['complete', 'handed_up', 'interrupted', 'reply_pending'] satisfies DispatchGuardPhase[])(
    'returns alreadyEnded for %s before opened or later unavailable facts',
    phase => {
      expect(dispatchGuard(guardInput({ call: callAt(phase), dispatches: spoke }))).toEqual({
        rejected: 'alreadyEnded',
      })
      expect(
        dispatchGuard(
          guardInput({
            call: callAt(phase),
            dispatches: { unknown: true },
            snapshot: { unknown: true },
            latestFailure: { unknown: true },
          }),
        ),
      ).toEqual({ rejected: 'alreadyEnded' })
    },
  )

  it('retains an older attempt opening even when a later dispatch has no opening and phase is wrong', () => {
    expect(dispatchGuard(guardInput({ call: callAt('resumable'), dispatches: spoke }))).toEqual({
      refused: { why: 'already_spoke' },
    })
    expect(
      dispatchGuard(
        guardInput({
          call: callAt('open'),
          dispatches: {
            known: {
              session: 'session',
              callId: 'call',
              opened: [{ unknown: true }, { known: true }],
            },
          },
        }),
      ),
    ).toEqual({ refused: { why: 'already_spoke' } })
  })

  it('does not answer wrongPhase or allowed by skipping unknown call, phase or opening facts', () => {
    expect(
      dispatchGuard(
        guardInput({
          call: {
            known: {
              session: 'session',
              callId: 'call',
              phase: { unknown: true },
            },
          },
          dispatches: spoke,
        }),
      ),
    ).toEqual({ rejected: 'unavailable' })
    for (const phase of ['open', 'awaiting_decision'] satisfies DispatchGuardPhase[]) {
      expect(
        dispatchGuard(guardInput({ call: callAt(phase), dispatches: { unknown: true } })),
      ).toEqual({ rejected: 'unavailable' })
      expect(
        dispatchGuard(
          guardInput({
            call: callAt(phase),
            dispatches: {
              known: {
                session: 'session',
                callId: 'call',
                opened: [{ known: false }, { unknown: true }],
              },
            },
          }),
        ),
      ).toEqual({ rejected: 'unavailable' })
    }
  })

  it('answers unopened wrongPhase before fact/provider rules are evaluated', () => {
    expect(
      dispatchGuard(
        guardInput({
          call: callAt('resumable'),
          latestFailure: { known: 'credential_unavailable' },
          plan: { provider: 'outside' },
        }),
      ),
    ).toEqual({ rejected: 'wrongPhase', phase: 'resumable' })
    expect(
      dispatchGuard(
        guardInput({
          call: callAt('open'),
          latestFailure: { unknown: true },
          snapshot: { unknown: true },
        }),
      ),
    ).toEqual({ rejected: 'wrongPhase', phase: 'open' })
  })

  it.each(['credential_unavailable', 'request_rejected'] as const)(
    'prioritizes fact_class for %s over a disallowed or unreadable provider snapshot',
    cause => {
      expect(
        dispatchGuard(
          guardInput({ latestFailure: { known: cause }, plan: { provider: 'outside' } }),
        ),
      ).toEqual({ refused: { why: 'fact_class' } })
      expect(
        dispatchGuard(guardInput({ latestFailure: { known: cause }, snapshot: { unknown: true } })),
      ).toEqual({ refused: { why: 'fact_class' } })
    },
  )

  it('requires the latest failure and the original snapshot when their decisions are reached', () => {
    expect(
      dispatchGuard(
        guardInput({ latestFailure: { unknown: true }, plan: { provider: 'outside' } }),
      ),
    ).toEqual({ rejected: 'unavailable' })
    expect(dispatchGuard(guardInput({ snapshot: { unknown: true } }))).toEqual({
      rejected: 'unavailable',
    })
    expect(dispatchGuard(guardInput({ latestFailure: { known: 'unrecognized' } }))).toEqual({
      allowed: true,
    })
  })

  it('uses the original ordered provider list and fallback declaration without replacing a requested provider', () => {
    expect(dispatchGuard(guardInput())).toEqual({ allowed: true })
    expect(dispatchGuard(guardInput({ plan: { provider: 'outside' } }))).toEqual({
      refused: { why: 'provider_not_allowed' },
    })
    // ProviderName is only nonempty; its adapter-owned lexicon is not an identity rule.
    expect(dispatchGuard(guardInput({ plan: { provider: ' first' } }))).toEqual({
      refused: { why: 'provider_not_allowed' },
    })
    const snapshot = { known: { ...profile, allowFallback: false } }
    expect(dispatchGuard(guardInput({ snapshot }))).toEqual({
      refused: { why: 'provider_not_allowed' },
    })
    expect(dispatchGuard(guardInput({ snapshot, plan: { provider: 'first' } }))).toEqual({
      allowed: true,
    })
    expect(
      dispatchGuard(
        guardInput({
          snapshot: { known: { ...profile, providers: ['second', 'first'], allowFallback: false } },
        }),
      ),
    ).toEqual({ allowed: true })
  })

  it('accepts exact Duration spelling without interpreting, rounding or scheduling it', () => {
    for (const after of [
      'PT0S',
      'PT1H30M0.5S',
      'PT900719925474099312345678901234567890.000000000000001S',
    ]) {
      const input = guardInput({ plan: { provider: 'second', after } })
      const before = writeJsonLossless(input)
      expect(dispatchGuard(input)).toEqual({ allowed: true })
      expect(writeJsonLossless(input)).toBe(before)
    }
  })

  it('rejects malformed representation before semantic decisions, including terminal', () => {
    const terminal = guardInput({ call: callAt('complete') })
    const plans: unknown[] = [
      { provider: 'first', target: 'new-model' },
      { provider: 'first', after: 0 },
      { provider: 'first', after: 'P1D' },
      { provider: 'first', after: 'PT-1S' },
      { provider: 'first', after: 'PT' },
      { provider: 'first', after: 'PT1S\n' },
      { provider: '' },
      {},
      { provider: 'first', after: undefined },
    ]
    for (const plan of plans)
      expect(dispatchGuard({ ...terminal, plan })).toEqual({ rejected: 'invalidInput' })
    for (const bad of [
      undefined,
      null,
      {},
      { ...terminal, latestFailure: { known: 'other' } },
      { ...terminal, call: { unknown: false } },
      { ...terminal, session: 'session\n' },
      { ...terminal, snapshot: { known: { providers: ['first'], allowFallback: true } } },
      { ...terminal, snapshot: { known: { ...profile, providers: ['first', 'first'] } } },
      {
        ...terminal,
        dispatches: { known: { session: 'session', callId: 'call', opened: Array(1) } },
      },
      { ...terminal, extra: true },
    ])
      expect(dispatchGuard(bad)).toEqual({ rejected: 'invalidInput' })
  })

  it('never invokes getters, changes the caller input, or retains authority between calls', () => {
    let reads = 0
    const accessor = { ...guardInput() }
    Object.defineProperty(accessor, 'call', {
      enumerable: true,
      get: () => {
        reads++
        throw new Error('getter')
      },
    })
    expect(dispatchGuard(accessor)).toEqual({ rejected: 'invalidInput' })
    expect(reads).toBe(0)
    const input = guardInput()
    const before = writeJsonLossless(input)
    const answer = dispatchGuard(input)
    expect(dispatchGuard(input)).toEqual(answer)
    expect(writeJsonLossless(input)).toBe(before)
    expect(Object.isFrozen(answer)).toBe(true)
    const providers = ['first', 'second']
    const changing = guardInput({ snapshot: { known: { ...profile, providers } } })
    expect(dispatchGuard(changing)).toEqual({ allowed: true })
    providers.splice(1, 1)
    expect(dispatchGuard(changing)).toEqual({ refused: { why: 'provider_not_allowed' } })
    expect(answer).toEqual({ allowed: true })
  })
})
