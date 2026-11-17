import { describe, expect, it } from 'vitest'
import type {
  CallState,
  DurableEvidence,
  RetryDecision,
  RetryPosition,
  Termination,
} from '@omne-harness/model-contract'
import { afterDispatch } from '../src/after-dispatch.ts'
import { fixture, op, proof } from './memory-fixture.ts'

const f = fixture()
const supplier = f.admit.request.suppliers[0]
const NOW = '2026-10-19T00:00:10Z'
const failed: Termination = {
  kind: 'failed',
  fault: { cause: 'upstream-unavailable', diagnostic: 'http-503', upstreamStatus: '503' },
}
const completed: Termination = { kind: 'completed', reason: 'stop' }
const base = {
  call: f.admit.call,
  revision: '3',
  consumer: f.admit.consumer,
  control: { kind: 'none' },
  custody: { kind: 'producer' },
} as unknown as CallState
const dispatch = 'mdisp_one'
const running = (firstContent: 'none-proven' | 'observed' | 'uncertain') =>
  ({ ...base, phase: 'running', dispatch, firstContent }) as CallState
const deciding = { ...base, phase: 'retry-decision', dispatch } as CallState
const controlled = (state: CallState) =>
  ({
    ...state,
    control: { kind: 'requested', operation: op('stop'), propagation: 'sent', upstream: 'unknown' },
  }) as CallState
const position: RetryPosition = {
  operation: op('position'),
  dispatch: dispatch as RetryPosition['dispatch'],
  policy: f.admit.request.retryPolicy,
  consumer: { owner: 'policy', work: f.admit.call, position: dispatch, purpose: 'model-retry' },
}
const source: DurableEvidence = proof('decision', 'retry')
const again = (notBefore: string): RetryDecision => ({
  kind: 'retry',
  supplier,
  notBefore,
  basis: f.admit.request.retryPolicy,
})
const stop: RetryDecision = {
  kind: 'stop',
  fault: { cause: 'upstream-unavailable', diagnostic: 'budget', upstreamStatus: null },
}
type Record = Parameters<typeof afterDispatch>[0]['recovery']
const none = { retry: null, retryPosition: null, retrySource: null }
const step = (recovery: Record, termination: Termination = failed) =>
  afterDispatch({ recovery, termination, now: NOW })

describe('the step of the driver after one dispatch ended', () => {
  it('a settled call has ended', () => {
    const settled = { ...base, phase: 'settled', settlement: {} } as unknown as CallState
    expect(step({ state: settled, ...none })).toEqual({ kind: 'ended' })
  })

  it.each([
    ['a completion', running('observed'), completed],
    ['a failure after content', running('observed'), failed],
    ['a failure whose first content is uncertain', running('uncertain'), failed],
  ] as const)('%s settles with the terminal of the dispatch', (_name, state, termination) => {
    expect(step({ state, ...none }, termination)).toEqual({ kind: 'settle', termination })
  })

  it('a failure with no content proven and no retry record takes the retry position', () => {
    expect(step({ state: running('none-proven'), ...none })).toEqual({
      kind: 'position',
      dispatch,
    })
  })

  it('a position without a decision asks the policy', () => {
    expect(
      step({ state: deciding, retry: null, retryPosition: position, retrySource: null }),
    ).toEqual({
      kind: 'ask-policy',
      position,
      failure: failed.fault,
    })
  })

  it('a decision to stop settles with the fault of the decision, also after a stop request', () => {
    const recovery = { retry: stop, retryPosition: position, retrySource: source }
    const expected = { kind: 'settle', termination: { kind: 'failed', fault: stop.fault } }
    expect(step({ state: deciding, ...recovery })).toEqual(expected)
    expect(step({ state: controlled(deciding), ...recovery })).toEqual(expected)
  })

  it('a decision to send again waits until its instant, then sends with the evidence of the decision', () => {
    const later = {
      retry: again('2026-10-19T00:00:11Z'),
      retryPosition: position,
      retrySource: source,
    }
    expect(step({ state: deciding, ...later })).toEqual({
      kind: 'wait',
      until: '2026-10-19T00:00:11Z',
    })
    const due = { retry: again(NOW), retryPosition: position, retrySource: source }
    expect(step({ state: deciding, ...due })).toEqual({
      kind: 'redispatch',
      supplier,
      decision: source,
    })
  })

  it.each([
    ['no retry record', none, running('none-proven')],
    ['a position', { retry: null, retryPosition: position, retrySource: null }, deciding],
    [
      'a decision to send again',
      { retry: again(NOW), retryPosition: position, retrySource: source },
      deciding,
    ],
  ] as const)(
    'after a stop request, %s settles with the terminal of the failed dispatch',
    (_name, record, state) => {
      expect(step({ state: controlled(state), ...record })).toEqual({
        kind: 'settle',
        termination: failed,
      })
    },
  )
})
