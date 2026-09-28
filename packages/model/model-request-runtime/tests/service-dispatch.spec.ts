import { expect, test } from 'vitest'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import {
  dispatchAdmission,
  dispatchAgainAdmission,
  positiveDurationMs,
} from '../src/service-dispatch.ts'
import type { CallHistoryResult } from '../src/call-history.ts'
import type { ModelProfileSnapshot } from '@omne-harness-lite/model-profile'

const session = unwrap(parseOpaqueIdentifier('session_dispatch', 'SessionRef'))
const key = { session, callId: 'call_dispatch' }
const snapshot: ModelProfileSnapshot = {
  adaptation: {
    implementation: { name: 'test', revision: '1' },
    definition: { modelId: 'model_dispatch', revision: '1' },
    configuration: { revision: '1', values: {} },
  },
  providers: ['first', 'fallback'],
  allowFallback: true,
  inputModalities: ['text'],
  outputModalities: ['text'],
  maxInputTokens: 100,
  maxOutputTokens: 100,
  inputConstraints: {},
  upstreamInputLimits: {
    maxInputTokens: { status: 'unknown' },
    maxRequestBytes: { status: 'unknown' },
  },
  updatedAt: '2026-09-28T00:00:00Z',
}

test('keeps a positive fractional-millisecond Duration without rounding or a default', () => {
  expect(positiveDurationMs('PT0.0001S')).toBe(0.1)
  expect(positiveDurationMs('PT1H2M3.5S')).toBe(3_723_500)
  expect(positiveDurationMs('PT0S')).toBeUndefined()
  expect(positiveDurationMs(`PT${'9'.repeat(400)}H`)).toBeUndefined()
})

function known(
  phase: NonNullable<Extract<CallHistoryResult, { known: object }>['known']['phase']>,
  opened = false,
  cause = 'upstream_unavailable',
): CallHistoryResult {
  return {
    known: {
      session,
      callId: key.callId,
      phase,
      dispatches: [
        {
          opened: opened ? ({} as never) : null,
          record: { provider: 'first' },
          response: { projection: { failure: { cause } } },
        } as never,
      ],
      intent: null,
      ending: null,
    },
  }
}

test('first dispatch uses the new call and a resumable call keeps its last provider', () => {
  expect(dispatchAdmission({ absent: true }, { phase: 'ready' }, 'first')).toEqual({
    allowed: true,
    dispatch: 1,
    provider: 'first',
  })
  expect(dispatchAdmission(known('resumable'), { phase: 'ready' }, 'fallback')).toEqual({
    allowed: true,
    dispatch: 2,
    provider: 'first',
  })
})

test('durable opened fact and terminal phase bar both first send and retry', () => {
  expect(dispatchAdmission(known('speaking', true), { phase: 'ready' }, 'first')).toEqual({
    retryRefused: { why: 'already_spoke' },
  })
  expect(
    dispatchAgainAdmission(key, known('awaiting_decision', true), undefined, snapshot, {
      provider: 'fallback',
    }),
  ).toEqual({ retryRefused: { why: 'already_spoke' } })
  expect(
    dispatchAgainAdmission(key, known('handed_up', true), undefined, snapshot, {
      provider: 'fallback',
    }),
  ).toEqual({ alreadyEnded: true })
})

test('retry checks the same fact-class and provider rules as the public guard', () => {
  expect(
    dispatchAgainAdmission(
      key,
      known('awaiting_decision', false, 'request_rejected'),
      undefined,
      snapshot,
      {
        provider: 'fallback',
      },
    ),
  ).toEqual({ retryRefused: { why: 'fact_class' } })
  expect(
    dispatchAgainAdmission(key, known('awaiting_decision'), undefined, snapshot, {
      provider: 'outsider',
    }),
  ).toEqual({ retryRefused: { why: 'provider_not_allowed' } })
})
