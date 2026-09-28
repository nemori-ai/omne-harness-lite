import { expect, test } from 'vitest'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { createCallContainerStore } from '../src/service-container.ts'
import { createServiceCalls } from '../src/service-calls.ts'
import { createServiceDispatch } from '../src/service-dispatch.ts'
import { interpretCallHistory } from '../src/call-history.ts'
import { policy as invocationPolicy } from './invoke-policy-fixture.ts'
import { noWaitScheduler, policy as settlementPolicy } from './settlement-fixture.ts'
import { payload, transport, type TestPlan } from './anchored-invocation-fixture.ts'
import { selectionHost } from './session-selection-fixture.ts'
import {
  dispatchAdmission,
  dispatchAgainAdmission,
  positiveDurationMs,
} from '../src/service-dispatch.ts'
import type { CallHistoryResult } from '../src/call-history.ts'
import type { ModelProfileSnapshot } from '@omne-harness-lite/model-profile'
import type { RuntimeConstruction, SessionRuntimeBinding } from '../src/service-types.ts'
import type { PlanFailure } from '../src/types.ts'

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

test('service dispatch writes both anchors before handing out a complete pending response', async () => {
  const host = await selectionHost(true, true)
  try {
    const selected = host.create()
    expect(await selected.component.selectModel('example/model-a')).toEqual({
      selected: 'example/model-a',
    })
    const effective = await selected.component.effectiveModel()
    if (!('ok' in effective)) throw new Error('effective model')
    const wire = transport()
    let finalPlanFailure: PlanFailure | undefined
    let nextCall = 0
    let nextResponse = 0
    let nextMessage = 0
    let sendCount = 0
    let failSend = false
    let evaluationReads = 0
    let credentialAvailable = true
    const calls = createCallContainerStore<TestPlan, object>()
    let released = 0
    const binding: SessionRuntimeBinding = {
      log: selected.input.binding,
      selection: { ...selected.input, projection: async () => ({ known: [] }) },
      catalog: host.catalog,
      currentEvaluationInputs: {
        async read(session, tenant) {
          evaluationReads++
          return await host.reader.read(session, tenant)
        },
      },
      credentials: {
        async value() {
          return credentialAvailable
            ? {
                scope: { layer: 'factory' as const },
                value: new TextEncoder().encode('test-secret'),
              }
            : { failure: 'credentialUnavailable' as const }
        },
      },
      tools: {
        async lookup() {
          throw new Error('no tools requested')
        },
      },
    }
    const runtime: RuntimeConstruction<TestPlan, object> = {
      sessions: { bind: async () => ({ binding }) },
      calls,
      transport: {
        acquire: () => ({
          lease: {
            binding: {
              implementation: { name: 'test', revision: '1' },
              definition: { modelId: 'example/model-a', revision: '1' },
              configuration: { revision: '1', values: {} },
            },
            transport: {
              ...wire.adapter,
              plan(input) {
                return finalPlanFailure ?? wire.adapter.plan(input)
              },
              async send(planned, credential, signal) {
                sendCount++
                return failSend
                  ? { failed: { source: 'http_status', statusCode: 503 } }
                  : await wire.adapter.send(planned, credential, signal)
              },
            },
            signal: new AbortController().signal,
            async track<T>(completion: Promise<T>) {
              return await completion
            },
            release() {
              released++
            },
          },
        }),
      },
      settlementContention: settlementPolicy(),
      settlementScheduler: noWaitScheduler,
      reservationWaitPolicy: { maxWaitersPerCall: 2, timeoutMs: 100 },
      tokenMargin: { multiplier: 1, reserveTokens: 0 },
      policy: { ...invocationPolicy(), schedule: () => () => {} },
      identities: {
        call: () => `actual-call-${++nextCall}`,
        response: () => `actual-response-${++nextResponse}`,
        message: () =>
          unwrap(parseOpaqueIdentifier(`actual-message-${++nextMessage}`, 'MessageId')),
      },
      history: {
        call: (prefix, callId) => interpretCallHistory({ prefix, callId }),
        failure: (prefix, callId) => {
          const found = interpretCallHistory({ prefix, callId })
          const last = 'known' in found ? found.known.dispatches.at(-1) : undefined
          return last?.response?.projection.outcome === 'failed'
            ? {
                subject: {
                  failure: 'upstream_unavailable',
                  profile: last.record.profileSnapshot,
                  dispatches: [last.record],
                  retryConclusions: [],
                },
              }
            : { unavailable: true }
        },
        run: () => ({ unavailable: true }),
      },
      recovery: { enter: async () => ({ unavailable: true }) },
      diagnostic() {},
    }
    const opening = createServiceCalls(runtime)
    const opened = await opening.openCall({
      session: host.session,
      target: effective.ok.routeName,
      basis: effective.ok,
      messages: [],
      tools: [],
      host: binding,
    })
    expect(opened).toEqual({ callId: 'actual-call-1', state: 'open' })
    const dispatch = createServiceDispatch(runtime)
    const result = await dispatch.dispatch({ session: host.session, callId: 'actual-call-1' })
    const read = await host.log.readSince(host.session, 0)
    if (!('entries' in read)) throw new Error('log read')
    const records = read.entries.map(entry => payload(entry).kind).filter(Boolean)
    expect(records).toEqual([
      'model_selection_changed',
      'model_call_dispatched',
      'model_call_opened',
    ])
    expect(result).toHaveProperty('replyPending')
    expect(wire.sends()).toBe(1)
    expect(evaluationReads).toBe(1)
    expect(sendCount).toBe(1)
    expect(
      calls.find({ session: host.session, callId: 'actual-call-1' })?.view().operation.phase,
    ).toBe('reply_pending')
    expect(await dispatch.dispatch({ session: host.session, callId: 'actual-call-1' })).toEqual({
      alreadyEnded: true,
    })
    expect(wire.sends()).toBe(1)
    expect(released).toBe(0)
    expect(
      await opening.openCall({
        session: host.session,
        target: effective.ok.routeName,
        basis: effective.ok,
        messages: [],
        tools: [],
        host: binding,
      }),
    ).toEqual({ callId: 'actual-call-2', state: 'open' })
    finalPlanFailure = {
      rejected: 'invalidInput',
      reason: 'input_limit_exceeded',
      basis: 'estimated',
      metric: 'maxInputTokens',
      estimatedTokens: 101,
      admissionTokens: 111,
      limit: 100,
    }
    expect(await dispatch.dispatch({ session: host.session, callId: 'actual-call-2' })).toEqual({
      invalidInput: {
        reason: 'input_limit_exceeded',
        basis: 'estimated',
        metric: 'maxInputTokens',
        estimatedTokens: 101,
        admissionTokens: 111,
        limit: 100,
      },
    })
    finalPlanFailure = { rejected: 'orphan_tool_call' }
    expect(await dispatch.dispatch({ session: host.session, callId: 'actual-call-2' })).toEqual({
      invalidInput: { reason: 'malformed' },
    })
    expect(wire.sends()).toBe(1)
    expect(sendCount).toBe(1)
    const finalLog = await host.log.readSince(host.session, 0)
    if (!('entries' in finalLog)) throw new Error('log read')
    expect(finalLog.entries).toHaveLength(3)
    finalPlanFailure = undefined
    failSend = true
    expect(
      await opening.openCall({
        session: host.session,
        target: effective.ok.routeName,
        basis: effective.ok,
        messages: [],
        tools: [],
        host: binding,
      }),
    ).toEqual({ callId: 'actual-call-3', state: 'open' })
    const failed = await dispatch.dispatch({ session: host.session, callId: 'actual-call-3' })
    expect(failed).toMatchObject({
      settled: { outcome: 'failed', failure: { cause: 'upstream_unavailable' } },
      failureSubject: { failure: 'upstream_unavailable', retryConclusions: [] },
    })
    expect(sendCount).toBe(2)
    failSend = false
    const retry = await dispatch.dispatchAgain({
      session: host.session,
      callId: 'actual-call-3',
      plan: { provider: 'test' },
    })
    expect(retry).toHaveProperty('replyPending')
    expect(sendCount).toBe(3)
    expect(evaluationReads).toBe(5)
    const afterRetry = await host.log.readSince(host.session, 0)
    if (!('entries' in afterRetry)) throw new Error('log read')
    expect(afterRetry.entries.map(entry => payload(entry).kind).filter(Boolean)).toEqual([
      'model_selection_changed',
      'model_call_dispatched',
      'model_call_opened',
      'model_call_dispatched',
      'model_call_dispatched',
      'model_call_opened',
    ])
    const durableDispatches = afterRetry.entries
      .map(payload)
      .filter(value => value.kind === 'model_call_dispatched')
    expect(durableDispatches).toHaveLength(3)
    expect(durableDispatches[1]?.profileSnapshot).toEqual(durableDispatches[2]?.profileSnapshot)
    expect(durableDispatches[1]?.adaptation).toEqual(durableDispatches[2]?.adaptation)
    expect(durableDispatches[1]?.response).not.toBe(durableDispatches[2]?.response)
    expect(
      await opening.openCall({
        session: host.session,
        target: effective.ok.routeName,
        basis: effective.ok,
        messages: [],
        tools: [],
        host: binding,
      }),
    ).toEqual({ callId: 'actual-call-4', state: 'open' })
    selected.owner.openedState = {
      unknown: {
        completion: Promise.resolve(null),
        stopped: Promise.resolve(),
        requestStop() {},
      },
    }
    expect(await dispatch.dispatch({ session: host.session, callId: 'actual-call-4' })).toEqual({
      unavailable: true,
    })
    expect(sendCount).toBe(3)
    expect(evaluationReads).toBe(5)
    selected.owner.openedState = { confirmed: true }
    expect(
      await opening.openCall({
        session: host.session,
        target: effective.ok.routeName,
        basis: effective.ok,
        messages: [],
        tools: [],
        host: binding,
      }),
    ).toEqual({ callId: 'actual-call-5', state: 'open' })
    credentialAvailable = false
    expect(await dispatch.dispatch({ session: host.session, callId: 'actual-call-5' })).toEqual({
      callId: 'actual-call-5',
      state: 'handed_up',
      undispatched: 'credential_unavailable',
    })
    expect(sendCount).toBe(3)
    expect(released).toBe(1)
    expect(calls.find({ session: host.session, callId: 'actual-call-5' })).toBeUndefined()
  } finally {
    await host.close()
  }
})
