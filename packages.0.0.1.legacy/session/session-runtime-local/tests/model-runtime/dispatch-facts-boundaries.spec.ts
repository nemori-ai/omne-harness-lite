import { describe, expect, it } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import type {
  SettlementDiagnostic,
  UnacknowledgedCallHistory,
} from '@omne-harness-lite/model-request-runtime'
import type { ModelProfileSnapshot } from '@omne-harness-lite/model-profile'
import {
  dispatchAdmission,
  dispatchAgainAdmission,
  settlementEvent,
} from '../../dist/model-runtime/service-dispatch.js'

const session = unwrap(parseOpaqueIdentifier('p6_dispatch_facts', 'SessionRef'))
const tenant = unwrap(parseTenantId({ organization: 'p6_dispatch', account: 'p6_dispatch' }))
const key = { session, callId: 'p6_dispatch_call' }
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

function diagnostic(kind: string): SettlementDiagnostic {
  return {
    kind,
    tenant,
    session,
    call: key.callId,
    dispatch: 7,
    response: 'p6_dispatch_response',
    owner: 'p6_owner',
    policy: 'p6_policy',
    submissions: 3,
    tailConflicts: 2,
  }
}

function known(
  phase: Extract<UnacknowledgedCallHistory, { known: object }>['known']['phase'],
): UnacknowledgedCallHistory {
  return {
    known: {
      ...key,
      phase,
      dispatches: [],
      intent: null,
      ending: null,
      acknowledged: null,
    },
  }
}

describe('settlement diagnostic projection boundaries', () => {
  it.each([
    ['settlement.enter', 'started', 'unsettled'],
    ['settlement.wait', 'waiting', 'unsettled'],
    ['settlement.tail_changed_this', 'waiting', 'unsettled'],
    ['settlement.collision', 'waiting', 'unsettled'],
    ['settlement.append', 'accepted', 'submitted'],
    ['settlement.recognized', 'completed', 'committed'],
    ['settlement.committed', 'completed', 'committed'],
    ['settlement.receipt_unconfirmed', 'unknown', 'unknown'],
    ['settlement.unknown_retained', 'unknown', 'unknown'],
    ['settlement.stop_unconfirmed', 'unknown', 'unknown'],
    ['settlement.stop_request_failed', 'failed', 'unknown'],
    ...[
      'dependency',
      'policy',
      'closed',
      'concurrent',
      'budget',
      'cancelled',
      'generation',
      'log',
      'prefix',
      'anchor',
      'members',
      'run_history_unavailable',
      'opened_unknown',
      'write_unknown',
      'task',
      'candidate',
    ].map(reason => [`settlement.unavailable.${reason}`, 'unavailable', 'unknown']),
  ])('preserves the complete projection for %s', (kind, outcome, settlement) => {
    expect(settlementEvent(diagnostic(kind))).toEqual({
      source: 'runtime',
      stage: 'settlement',
      outcome,
      facts: {
        kind: 'progress',
        settlement,
        owner: 'p6_owner',
        policy: 'p6_policy',
        submissions: 3,
        tailConflicts: 2,
      },
    })
  })

  it.each(['settlement.enter', 'settlement.unavailable.log', 'settlement.unavailable.unlisted'])(
    'preserves kind read count and field order for %s',
    kind => {
      const trace: string[] = []
      const event: SettlementDiagnostic = {
        ...diagnostic(kind),
        get kind() {
          trace.push('kind')
          return kind
        },
        get owner() {
          trace.push('owner')
          return 'p6_owner'
        },
        get policy() {
          trace.push('policy')
          return 'p6_policy'
        },
        get submissions() {
          trace.push('submissions')
          return 3
        },
        get tailConflicts() {
          trace.push('tailConflicts')
          return 2
        },
      }
      const result = settlementEvent(event)
      const reads = kind === 'settlement.enter' ? ['kind'] : ['kind', 'kind']
      if (kind.endsWith('unlisted')) {
        expect(result).toBeUndefined()
        expect(trace).toEqual(reads)
      } else {
        expect(result).toEqual(settlementEvent(diagnostic(kind)))
        expect(trace).toEqual([...reads, 'owner', 'policy', 'submissions', 'tailConflicts'])
      }
    },
  )

  it('propagates a facts getter error after selecting a supported kind', () => {
    const fault = new Error('original diagnostic field fault')
    const event = {
      ...diagnostic('settlement.append'),
      get owner(): string {
        throw fault
      },
    }
    expect(() => settlementEvent(event)).toThrow(fault)
  })
})

describe('pure dispatch admission projection boundaries', () => {
  it('preserves absent, unknown, null-phase and empty-provider ordering', () => {
    expect(dispatchAdmission({ unavailable: true, reason: 'history' }, undefined, '')).toEqual({
      unavailable: true,
    })
    expect(dispatchAdmission({ absent: true }, undefined, '')).toEqual({ callNotFound: true })
    expect(dispatchAdmission({ absent: true }, { phase: 'ready' }, '')).toEqual({
      unavailable: true,
    })
    expect(dispatchAdmission(known(null), undefined, 'first')).toEqual({ unavailable: true })
    expect(dispatchAdmission(known(null), { phase: 'ready' }, 'first')).toEqual({
      allowed: true,
      dispatch: 1,
      provider: 'first',
    })
    expect(dispatchAdmission(known('open'), undefined, 'first')).toEqual({
      allowed: true,
      dispatch: 1,
      provider: 'first',
    })
    expect(dispatchAdmission(known('resumable'), undefined, 'fallback')).toEqual({
      allowed: true,
      dispatch: 1,
      provider: 'fallback',
    })
    expect(dispatchAdmission(known('in_flight'), { phase: 'ready' }, '')).toEqual({
      wrongPhase: { phase: 'in_flight' },
    })
    for (const phase of ['complete', 'handed_up', 'interrupted', 'reply_pending'] as const)
      expect(dispatchAdmission(known(phase), { phase: 'ready' }, '')).toEqual({
        alreadyEnded: true,
      })
  })

  it('checks retry plan before reading history and keeps phase refusals closed', () => {
    const fault = new Error('history read before malformed retry plan')
    const history: UnacknowledgedCallHistory = {
      get known(): never {
        throw fault
      },
    }
    expect(dispatchAgainAdmission(key, history, undefined, snapshot, { provider: '' })).toEqual({
      invalidInput: { reason: 'malformed' },
    })
    expect(
      dispatchAgainAdmission(key, { absent: true }, undefined, snapshot, { provider: 'first' }),
    ).toEqual({ callNotFound: true })
    expect(
      dispatchAgainAdmission(key, { unavailable: true, reason: 'history' }, undefined, snapshot, {
        provider: 'first',
      }),
    ).toEqual({ unavailable: true })
    expect(
      dispatchAgainAdmission(key, known('open'), undefined, snapshot, { provider: 'first' }),
    ).toEqual({ wrongPhase: { phase: 'open' } })
    expect(
      dispatchAgainAdmission(key, known('awaiting_decision'), undefined, snapshot, {
        provider: 'first',
      }),
    ).toEqual({ unavailable: true })
    for (const phase of ['complete', 'handed_up', 'interrupted', 'reply_pending'] as const)
      expect(
        dispatchAgainAdmission(key, known(phase), undefined, snapshot, { provider: 'first' }),
      ).toEqual({ alreadyEnded: true })
  })
})
