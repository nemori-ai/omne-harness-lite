import {
  publishSessionModelCallContent,
  sessionModelRequestPreparation,
} from '@omne-harness-lite/session-runtime-local'
import { positiveDurationMs } from '@omne-harness-lite/session-runtime-local'
import { modelCategory, modelValue, replaceModelValue } from './log-codec-fixture.ts'
import { prepareAttemptFact } from './attempt-fact-fixture.ts'
// @module-tag slow
// 归慢层：整套装配＋真库：用例经会话选择宿主起租户、时钟与评估输入的整套装配（SQLite 文件库），并开真实 SQL journal 会话日志。
import { expect, test } from 'vitest'
import { createModalityProjection } from '@omne-harness-lite/model-message-projection'
import { messageLogPayload } from '@omne-harness-lite/session-log'
import { judgeMessage } from '@omne-harness-lite/messages'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import type { AvailabilityReport } from '@omne-harness-lite/asset-registry'
import {
  parseOpaqueIdentifier,
  parseTenantId,
  tenantIdEquals,
  unwrap,
} from '@omne-harness-lite/identity-values'
import { createCallContainerStore } from '../src/service-container.ts'
import { createServiceCalls } from '../src/service-calls.ts'
import { createServiceControl } from '../src/service-control.ts'
import { createServiceDispatch, settlementEvent } from '../src/service-dispatch.ts'
import { createRuntimeReads } from '../src/service-reads.ts'
import { createModelCallContentStore } from '../src/reference-content.ts'
import { createModelCallFacts } from '../src/reference-facts.ts'
import { createRuntimeAcquire } from '../src/service-acquire.ts'
import { interpretCallHistory } from '@omne-harness-lite/model-request-runtime'
import {
  captureModelLogValue,
  prepareModelLogEntry,
} from '@omne-harness-lite/model-request-runtime'
import { policy as invocationPolicy } from './invoke-policy-fixture.ts'
import { noWaitScheduler, policy as settlementPolicy } from './settlement-fixture.ts'
import { payload, transport, type TestPlan } from './anchored-invocation-fixture.ts'
import { profile, selectionHost } from './session-selection-fixture.ts'
import { dispatchAdmission, dispatchAgainAdmission } from '../src/service-dispatch.ts'
import type { UnacknowledgedCallHistory } from '@omne-harness-lite/model-request-runtime'
import type { ModelProfileSnapshot } from '@omne-harness-lite/model-profile'
import type { SessionRuntimeBinding } from '@omne-harness-lite/model-request-runtime'
import type { RuntimeConstruction } from '../src/service-types.ts'
import type { PlanFailure } from '@omne-harness-lite/model-request-runtime'
import type {
  DiagnosticAssociation,
  DiagnosticScope,
} from '@omne-harness-lite/model-request-runtime'
import type { DiagnosticCollector } from '../src/diagnostics-types.ts'
import type { DiagnosticEvent } from '@omne-harness-lite/model-request-runtime'

const session = unwrap(parseOpaqueIdentifier('session_dispatch', 'SessionRef'))
const creationKey = (value: string) => unwrap(parseOpaqueIdentifier(value, 'CreationKey'))
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
  phase: NonNullable<Extract<UnacknowledgedCallHistory, { known: object }>['known']['phase']>,
  opened = false,
  cause = 'upstream_unavailable',
): UnacknowledgedCallHistory {
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
      acknowledged: null,
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

// Real SQLite/SQL journal end to end: an explicit budget, since shared-host load alone crosses 5 s.
test('service dispatch writes both anchors before handing out a complete pending response', async () => {
  const host = await selectionHost(true, true)
  const contentStore = createModelCallContentStore({
    storage: host.storage,
    policy: { maxConcurrentWrites: 4, maxContentBytes: 1_000_000 },
  })
  try {
    const selected = host.create({
      projection: createModalityProjection({ tenant: host.tenant, session: host.session }),
    })
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
    let wrongCredentialScope = false
    const calibrationTargets: unknown[] = []
    let latestRunAttempt = 1
    const observed: unknown[] = []
    const diagnosticFaults: string[] = []
    let diagnosticFail = false
    const engineering: {
      scope: DiagnosticScope
      association: DiagnosticAssociation | undefined
      event: DiagnosticEvent
    }[] = []
    const diagnosticCollector = {
      emitter(scope: DiagnosticScope, association?: DiagnosticAssociation) {
        return {
          record(event: DiagnosticEvent) {
            if (diagnosticFail) throw new Error('diagnostic sink failed')
            engineering.push({ scope, association, event })
            return {
              recorded: { collectorId: 'service-test', sequence: String(engineering.length) },
            }
          },
          close() {},
        }
      },
    } as DiagnosticCollector
    let observerTargetAllowed = false
    let observerOpenCount = 0
    const calls = createCallContainerStore<TestPlan, object>()
    const callPresence = {
      async read(input, observed) {
        const local = calls.find(input.ref)?.view()
        return {
          read: await observed({
            ...(local === undefined
              ? {
                  kind: 'stopped' as const,
                  source: input.source,
                  executionGeneration: null,
                  sourceVersion: 'dispatch-log-v1',
                  target: null,
                  unknownBatches: [],
                }
              : {
                  kind: 'live' as const,
                  source: input.source,
                  executionGeneration: local.executionGeneration,
                  sourceVersion: 'dispatch-log-v1',
                }),
          }),
        }
      },
    } satisfies RuntimeConstruction<TestPlan, object>['callPresence']
    const callFacts = createModelCallFacts({
      content: contentStore,
      presence: callPresence,
      maxScopes: 4,
    })
    const callAccess: RuntimeConstruction<TestPlan, object>['callAccess'] = {
      async check(input, admitted) {
        const held = await host.tenancy.holdingTenant(input.ref.session)
        if (
          !('tenant' in held) ||
          !tenantIdEquals(held.tenant, input.binding.tenant) ||
          !('view' in (await callFacts.lookup({ binding: input.binding, ref: input.ref })))
        )
          return { unavailable: true }
        const found = await callFacts.lookup({ binding: input.binding, ref: input.ref })
        if (!('view' in found)) return { unavailable: true }
        const evidence = {
          action: input.action,
          ref: input.ref,
          source: found.view.source,
          sourceVersion: 'dispatch-log-v1',
          revoked: new AbortController().signal,
        }
        return { allowed: await admitted(evidence), evidence }
      },
    }
    const lifecycleHost = {
      signal: new AbortController().signal,
      stopping: () => false,
      register: () => ({ registration: { unregister() {} } }),
    }
    let released = 0
    const binding: SessionRuntimeBinding = {
      log: selected.input.binding,
      sourceVersions: { fixture: 'selection-host-recipe-v1' },
      selection: selected.input,
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
                scope: wrongCredentialScope
                  ? {
                      layer: 'tenant' as const,
                      tenant: unwrap(
                        parseTenantId({ organization: 'other-org', account: 'other-account' }),
                      ),
                    }
                  : { layer: 'factory' as const },
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
      observers: {
        authorize: () => ({
          observer: {
            check: () =>
              observerTargetAllowed
                ? { valid: true as const }
                : { invalidInput: { reason: 'observer_scope_mismatch' as const } },
            open: () => {
              observerOpenCount++
              return {
                receiver: {
                  receive(serialized: string) {
                    observed.push(JSON.parse(serialized))
                    return { completion: Promise.resolve(), stopped: Promise.resolve() }
                  },
                  stop() {},
                  stopped: Promise.resolve(),
                },
              }
            },
            close: async () => ({ released: true as const }),
          },
        }),
      },
    }
    expect(
      settlementEvent({
        kind: 'settlement.unavailable.unlisted',
        tenant: binding.log.tenant,
        session: binding.log.session,
        call: key.callId,
        dispatch: 1,
        response: 'response-test',
        owner: 'owner-test',
        policy: 'policy-test',
        submissions: 1,
        tailConflicts: 0,
      }),
    ).toBeUndefined()
    const runtime: RuntimeConstruction<TestPlan, object> = {
      recordPublication: publishSessionModelCallContent,
      requestPreparation: sessionModelRequestPreparation,
      callFacts,
      callPresence,
      callAccess,
      maxScopes: 4,
      sessions: { bind: async () => ({ binding }) },
      calls,
      transport: {
        clearReuseScope() {},
        acquire: () => ({
          lease: {
            binding: {
              implementation: { name: 'test', revision: '1' },
              definition: { modelId: 'example/model-a', revision: '1' },
              configuration: { revision: '1', values: {} },
            },
            transport: {
              ...wire.adapter,
              async plan(input, execution) {
                return finalPlanFailure ?? wire.adapter.plan(input, execution)
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
      acknowledgementCleanup: { next: () => ({ stop: true }) },
      tokenMargin: { multiplier: 1, reserveTokens: 0 },
      policy: {
        ...invocationPolicy(),
        schedule: () => () => {},
        diagnostic: event => diagnosticFaults.push(event.kind),
      },
      identities: {
        call: () => `actual-call-${++nextCall}`,
        response: () => `actual-response-${++nextResponse}`,
        message: () =>
          unwrap(parseOpaqueIdentifier(`actual-message-${++nextMessage}`, 'MessageId')),
      },
      history: {
        call: (prefix, callId) => interpretCallHistory({ prefix, callId }),
        calibration: (_prefix, _messages, target) => {
          calibrationTargets.push(target)
          return { sourceUnavailable: true }
        },
        failure: (prefix, callId) => {
          const found = interpretCallHistory({ prefix, callId })
          if (!('known' in found)) return { unavailable: true }
          const first = found.known.dispatches[0]?.record
          const last = found.known.dispatches.at(-1)
          return first !== undefined && last?.response?.projection.outcome === 'failed'
            ? {
                subject: {
                  failure: 'upstream_unavailable',
                  statusCode: 503,
                  profile: last.record.profileSnapshot,
                  dispatches: [first, ...found.known.dispatches.slice(1).map(item => item.record)],
                  retryConclusions: [],
                },
              }
            : { unavailable: true }
        },
        // This test injects a conditional G28 reading; the actual Run owner is external.
        run: (_prefix, run, originalAttempt) => ({
          known: { run, originalAttempt, latestAttempt: latestRunAttempt, terminal: 'open' },
        }),
      },
      recovery: {
        async authorize() {
          return { authorized: true as const }
        },
        enter: async () => ({ unavailable: true }),
      },
      diagnostic() {},
      diagnosticCollector,
    }
    const opening = createServiceCalls(runtime)
    const opened = await opening.openCall({
      creationKey: creationKey('create_dispatch_1'),
      session: host.session,
      target: effective.ok.routeName,
      basis: effective.ok,
      messages: [],
      tools: [],
      host: lifecycleHost,
      observer: {
        session: host.session,
        endpoint: {
          open: () => {
            throw new Error('authorized endpoint owns open')
          },
        },
        observer_max_buffered_events: 16,
        observer_max_buffered_bytes: 100_000,
      },
    })
    expect(opened).toEqual({
      ref: { session: host.session, callId: 'actual-call-1' },
      callId: 'actual-call-1',
      state: 'open',
    })
    const dispatch = createServiceDispatch(runtime)
    diagnosticFail = true
    expect(await dispatch.dispatch({ session: host.session, callId: 'actual-call-1' })).toEqual({
      invalidInput: { reason: 'observer_scope_mismatch' },
    })
    expect(diagnosticFaults).toContain('model_runtime.diagnostic_sink_failed')
    diagnosticFail = false
    expect(sendCount).toBe(0)
    expect(observerOpenCount).toBe(0)
    wrongCredentialScope = true
    expect(await dispatch.dispatch({ session: host.session, callId: 'actual-call-1' })).toEqual({
      unavailable: true,
    })
    expect(engineering).toContainEqual({
      scope: { kind: 'tenant', tenant: binding.log.tenant },
      association: expect.objectContaining({
        session: host.session,
        call: 'actual-call-1',
        dispatch: 1,
      }),
      event: {
        source: 'runtime',
        stage: 'binding',
        outcome: 'unavailable',
        facts: { kind: 'decision', cause: 'scope_disallowed' },
      },
    })
    wrongCredentialScope = false
    observerTargetAllowed = true
    const result = await dispatch.dispatch({ session: host.session, callId: 'actual-call-1' })
    const read = await host.log.readSince(host.session, 0)
    if (!('entries' in read)) throw new Error('log read')
    const records = read.entries.map(entry => payload(entry).kind).filter(Boolean)
    expect(records).toEqual([
      'model_selection_changed',
      'model_call_created',
      'model_call_dispatched',
      'model_call_opened',
      'model_call_reply_ready',
    ])
    expect(result).toHaveProperty('replyPending')
    const acquired = createRuntimeAcquire(runtime)
    const recovered = await acquired.acquireCall({
      ref: { session: host.session, callId: 'actual-call-1' },
      mode: 'read',
    })
    expect(recovered).toMatchObject({
      view: {
        ref: { session: host.session, callId: 'actual-call-1' },
        state: 'complete',
        result: { disposition: 'disposition_pending' },
      },
    })
    expect(await acquired.close()).toEqual({ released: true })
    // A second, empty projection reconstructs this ref from the real SQL journal/SQLite sources.
    const coldContent = createModelCallContentStore({
      storage: host.storage,
      policy: { maxConcurrentWrites: 4, maxContentBytes: 1_000_000 },
    })
    const coldFacts = createModelCallFacts({
      content: coldContent,
      presence: callPresence,
      maxScopes: 4,
    })
    const coldAcquire = createRuntimeAcquire({ ...runtime, callFacts: coldFacts })
    expect(
      await coldAcquire.acquireCall({
        ref: { session: host.session, callId: 'actual-call-1' },
        mode: 'read',
      }),
    ).toMatchObject({
      view: { state: 'complete', result: { disposition: 'disposition_pending' } },
    })
    expect(await coldAcquire.close()).toEqual({ released: true })
    expect(await coldFacts.close()).toEqual({ released: true })
    const acceptedCredentialIndex = engineering.findLastIndex(
      item =>
        item.association?.call === 'actual-call-1' &&
        item.event.source === 'runtime' &&
        item.event.stage === 'credential' &&
        item.event.outcome === 'accepted',
    )
    expect(acceptedCredentialIndex).toBeGreaterThanOrEqual(0)
    expect(
      engineering.find(
        item => item.association?.call === 'actual-call-1' && item.event.stage === 'first_content',
      )?.association,
    ).toMatchObject({
      response: 'actual-response-1',
      causedBy: { collectorId: 'service-test', sequence: String(acceptedCredentialIndex + 1) },
    })
    expect(engineering).toContainEqual({
      scope: { kind: 'tenant', tenant: binding.log.tenant },
      association: expect.objectContaining({
        session: host.session,
        call: 'actual-call-1',
        dispatch: 1,
      }),
      event: {
        source: 'runtime',
        stage: 'credential',
        outcome: 'accepted',
        facts: { kind: 'decision', credentialPresent: true, credentialScope: 'factory' },
      },
    })
    expect(JSON.stringify(engineering)).not.toContain('test-secret')
    expect(wire.sends()).toBe(1)
    expect(evaluationReads).toBe(3)
    expect(sendCount).toBe(1)
    expect(observerOpenCount).toBe(1)
    const observerQueue = calls.find({ session: host.session, callId: 'actual-call-1' })?.view()
      .observer?.queue
    if (observerQueue === undefined) throw new Error('observer queue missing')
    expect(observerQueue.start({ blocks: [], position: 0 })).toEqual({
      invalidInput: { reason: 'malformed' },
    })
    expect(engineering).toContainEqual({
      scope: { kind: 'tenant', tenant: binding.log.tenant },
      association: expect.objectContaining({
        session: host.session,
        call: 'actual-call-1',
        dispatch: 1,
      }),
      event: {
        source: 'observer',
        stage: 'observer',
        outcome: 'rejected',
        facts: {
          kind: 'observer',
          observerStage: 'offer',
          reason: 'malformed',
          bufferedEvents: new LosslessNumber('0'),
          bufferedBytes: new LosslessNumber('0'),
        },
      },
    })
    expect(observed[0]).toMatchObject({
      kind: 'snapshot',
      scope: {
        session: host.session,
        target: { kind: 'model_call', callId: 'actual-call-1', dispatch: 1 },
      },
    })
    expect(JSON.stringify(observed)).not.toContain('rawHeaders')
    expect(
      calls.find({ session: host.session, callId: 'actual-call-1' })?.view().operation.phase,
    ).toBe('complete')
    expect(await dispatch.dispatch({ session: host.session, callId: 'actual-call-1' })).toEqual({
      alreadyEnded: true,
    })
    expect(engineering.map(item => item.event)).toContainEqual({
      source: 'runtime',
      stage: 'admission',
      outcome: 'rejected',
      facts: { kind: 'decision' },
    })
    expect(wire.sends()).toBe(1)
    expect(released).toBe(1)
    expect(
      await opening.openCall({
        creationKey: creationKey('create_dispatch_2'),
        session: host.session,
        target: effective.ok.routeName,
        basis: effective.ok,
        messages: [],
        tools: [],
        host: lifecycleHost,
      }),
    ).toEqual({
      ref: { session: host.session, callId: 'actual-call-2' },
      callId: 'actual-call-2',
      state: 'open',
    })
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
    expect(finalLog.entries.map(entry => payload(entry).kind).filter(Boolean)).toEqual([
      'model_selection_changed',
      'model_call_created',
      'model_call_dispatched',
      'model_call_opened',
      'model_call_reply_ready',
      'model_call_created',
    ])
    finalPlanFailure = undefined
    failSend = true
    expect(
      await opening.openCall({
        creationKey: creationKey('create_dispatch_3'),
        session: host.session,
        target: effective.ok.routeName,
        basis: effective.ok,
        messages: [],
        tools: [],
        host: lifecycleHost,
      }),
    ).toEqual({
      ref: { session: host.session, callId: 'actual-call-3' },
      callId: 'actual-call-3',
      state: 'open',
    })
    const consumedFailure = await dispatch.dispatch(
      { session: host.session, callId: 'actual-call-3' },
      { consumeFailure: true },
    )
    const failed = consumedFailure.result
    expect(failed).toMatchObject({
      settled: { outcome: 'failed', failure: { cause: 'upstream_unavailable' } },
      failureSubject: { failure: 'upstream_unavailable', retryConclusions: [] },
    })
    if (consumedFailure.consumption.kind !== 'failure') throw new Error('failure source absent')
    const failureSource = consumedFailure.consumption.source
    const attemptedRun = { run: 'invented-run', attempt: 1 }
    if (!('failureSubject' in failed)) throw new Error('failed result missing subject')
    expect(failed.failureSubject).toBe(failureSource.subject)
    expect(failureSource.verify(failureSource.subject, attemptedRun)).toEqual({
      invalidInput: true,
    })
    expect(
      failureSource.verify({ ...failureSource.subject, failure: 'request_rejected' }, attemptedRun),
    ).toEqual({ invalidInput: true })
    const reads = createRuntimeReads(runtime)
    const callKey = { session: host.session, callId: 'actual-call-3' }
    expect(await reads.methods.readAttempts(callKey)).toMatchObject({
      state: 'awaiting_decision',
      failureSubject: { statusCode: 503 },
    })
    const fromRead = await reads.methods.readAttempts(callKey, { consumeFailure: true })
    expect(fromRead.result).toMatchObject({ state: 'awaiting_decision' })
    if (fromRead.consumption.kind !== 'failure') throw new Error('read source absent')
    const readSource = fromRead.consumption.source
    if (!('failureSubject' in fromRead.result)) throw new Error('read result missing subject')
    expect(fromRead.result.failureSubject).toBe(readSource.subject)
    expect(readSource.verify(readSource.subject, attemptedRun)).toEqual({ invalidInput: true })
    expect(await reads.close()).toEqual({ released: true })
    expect(readSource.verify(readSource.subject, attemptedRun)).toEqual({ unavailable: true })
    expect(
      engineering.some(
        item =>
          item.association?.call === 'actual-call-3' &&
          item.event.stage === 'settlement' &&
          item.event.outcome === 'completed' &&
          item.event.facts.kind === 'progress' &&
          item.event.facts.settlement === 'committed',
      ),
    ).toBe(true)
    expect(sendCount).toBe(2)
    failSend = false
    const previousCall3 = engineering
      .map((item, index) => ({ item, sequence: String(index + 1) }))
      .filter(({ item }) => item.association?.call === 'actual-call-3')
      .at(-1)
    expect(previousCall3).toBeDefined()
    const retry = await dispatch.dispatchAgain({
      session: host.session,
      callId: 'actual-call-3',
      plan: { provider: 'test' },
    })
    expect(retry).toHaveProperty('replyPending')
    const retryAdmission = engineering.find(
      item =>
        item.association?.call === 'actual-call-3' &&
        item.association.dispatch === 2 &&
        item.event.stage === 'admission',
    )
    expect(retryAdmission?.association?.causedBy).toEqual({
      collectorId: 'service-test',
      sequence: previousCall3?.sequence,
    })
    expect(retryAdmission?.association?.executionId).not.toBe(
      previousCall3?.item.association?.executionId,
    )
    expect(engineering).toContainEqual({
      scope: { kind: 'tenant', tenant: binding.log.tenant },
      association: expect.objectContaining({
        call: 'actual-call-3',
        dispatch: 2,
        executionId: retryAdmission?.association?.executionId,
      }),
      event: {
        source: 'runtime',
        stage: 'retry',
        outcome: 'started',
        facts: { kind: 'progress', retry: 'again' },
      },
    })
    expect(sendCount).toBe(3)
    // A later legitimate append does not invalidate the captured prefix.
    expect(failureSource.verify(failureSource.subject, attemptedRun)).toEqual({
      invalidInput: true,
    })
    failureSource.release()
    failureSource.release()
    expect(failureSource.verify(failureSource.subject, attemptedRun)).toEqual({ unavailable: true })
    expect(evaluationReads).toBe(7)
    const afterRetry = await host.log.readSince(host.session, 0)
    if (!('entries' in afterRetry)) throw new Error('log read')
    expect(afterRetry.entries.map(entry => payload(entry).kind).filter(Boolean)).toEqual([
      'model_selection_changed',
      'model_call_created',
      'model_call_dispatched',
      'model_call_opened',
      'model_call_reply_ready',
      'model_call_created',
      'model_call_created',
      'model_call_dispatched',
      'model_call_dispatched',
      'model_call_opened',
      'model_call_reply_ready',
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
        creationKey: creationKey('create_dispatch_4'),
        session: host.session,
        target: effective.ok.routeName,
        basis: effective.ok,
        messages: [],
        tools: [],
        host: lifecycleHost,
      }),
    ).toEqual({
      ref: { session: host.session, callId: 'actual-call-4' },
      callId: 'actual-call-4',
      state: 'open',
    })
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
    expect(evaluationReads).toBe(7)
    selected.owner.openedState = { confirmed: true }
    expect(
      await opening.openCall({
        creationKey: creationKey('create_dispatch_5'),
        session: host.session,
        target: effective.ok.routeName,
        basis: effective.ok,
        messages: [],
        tools: [],
        host: lifecycleHost,
      }),
    ).toEqual({
      ref: { session: host.session, callId: 'actual-call-5' },
      callId: 'actual-call-5',
      state: 'open',
    })
    credentialAvailable = false
    expect(await dispatch.dispatch({ session: host.session, callId: 'actual-call-5' })).toEqual({
      callId: 'actual-call-5',
      state: 'handed_up',
      undispatched: 'credential_unavailable',
    })
    expect(engineering).toContainEqual({
      scope: { kind: 'tenant', tenant: binding.log.tenant },
      association: expect.objectContaining({
        session: host.session,
        call: 'actual-call-5',
        dispatch: 1,
      }),
      event: {
        source: 'runtime',
        stage: 'credential',
        outcome: 'unavailable',
        facts: { kind: 'decision', cause: 'credential_unavailable', credentialPresent: false },
      },
    })
    expect(
      engineering
        .filter(item => item.association?.call === 'actual-call-5')
        .every(item => item.association?.response === undefined),
    ).toBe(true)
    expect(sendCount).toBe(3)
    expect(released).toBe(3)
    expect(calls.find({ session: host.session, callId: 'actual-call-5' })).toBeUndefined()
    credentialAvailable = true
    expect(
      await opening.openCall({
        creationKey: creationKey('create_dispatch_6'),
        session: host.session,
        target: effective.ok.routeName,
        basis: effective.ok,
        messages: [],
        tools: [],
        host: lifecycleHost,
      }),
    ).toEqual({
      ref: { session: host.session, callId: 'actual-call-6' },
      callId: 'actual-call-6',
      state: 'open',
    })
    const control = createServiceControl(runtime)
    expect(
      await control.interrupt({
        session: host.session,
        callId: 'actual-call-6',
        initiator: 'user',
      }),
    ).toEqual({ stage: 'before_dispatch' })
    expect(await control.close()).toEqual({ released: true })
    expect(released).toBe(4)
    expect(calls.find({ session: host.session, callId: 'actual-call-6' })).toBeUndefined()
    const run = 'calibration-dispatch-run'
    const appendAttempt = async (attempt: number) => {
      const entry = prepareAttemptFact({
        session: host.session,
        shell: { tenant: binding.log.tenant, run, attempt },
        key: `calibration-dispatch-attempt-${attempt}`,
        reason: attempt === 1 ? 'first' : 'resumed_after_interruption',
        at: '2026-09-29T00:00:00Z',
      })
      if (!('ok' in entry)) throw new Error('Run attempt entry')
      const appended = await binding.log.log.append(
        host.session,
        [entry.ok],
        { kind: 'fenced', run, attempt },
        { kind: 'unconditional' },
      )
      if ('failure' in appended) throw new Error('Run attempt append')
    }
    await appendAttempt(1)
    const report = {
      session: host.session,
      runId: run,
      attempt: 1,
    } as unknown as AvailabilityReport
    const runRequest = {
      creationKey: creationKey('create_dispatch_7'),
      session: host.session,
      target: effective.ok.routeName,
      basis: effective.ok,
      messages: [],
      tools: [],
      host: lifecycleHost,
      run,
      attempt: 1,
      report,
    }
    expect(await opening.openCall(runRequest)).toEqual({
      ref: { session: host.session, callId: 'actual-call-7' },
      callId: 'actual-call-7',
      state: 'open',
    })
    expect(
      await dispatch.dispatch({ session: host.session, callId: 'actual-call-7', attempt: 1 }),
    ).toHaveProperty('replyPending')
    expect(calibrationTargets.at(-1)).toEqual({
      callId: 'actual-call-7',
      dispatch: 1,
      run,
      attempt: 1,
    })
    failSend = true
    expect(
      await opening.openCall({ ...runRequest, creationKey: creationKey('create_dispatch_8') }),
    ).toEqual({
      ref: { session: host.session, callId: 'actual-call-8' },
      callId: 'actual-call-8',
      state: 'open',
    })
    const firstRunFailure = await dispatch.dispatch(
      { session: host.session, callId: 'actual-call-8', attempt: 1 },
      { consumeFailure: true },
    )
    expect(firstRunFailure.result).toHaveProperty('settled')
    if (firstRunFailure.consumption.kind !== 'failure') throw new Error('Run failure source absent')
    const firstRunSource = firstRunFailure.consumption.source
    expect(firstRunSource.verify(firstRunSource.subject, { run, attempt: 1 })).toHaveProperty(
      'authoritativeSubject',
    )
    expect(firstRunSource.verify(firstRunSource.subject, { run: 'other-run', attempt: 1 })).toEqual(
      {
        invalidInput: true,
      },
    )
    const runReads = createRuntimeReads(runtime)
    const readRunFailure = await runReads.methods.readAttempts(
      { session: host.session, callId: 'actual-call-8' },
      { consumeFailure: true },
    )
    if (readRunFailure.consumption.kind !== 'failure')
      throw new Error('Run read failure source absent')
    const readRunSource = readRunFailure.consumption.source
    expect(readRunSource.verify(readRunSource.subject, { run, attempt: 1 })).toHaveProperty(
      'authoritativeSubject',
    )
    expect(await runReads.close()).toEqual({ released: true })
    expect(readRunSource.verify(readRunSource.subject, { run, attempt: 1 })).toEqual({
      unavailable: true,
    })
    await appendAttempt(2)
    latestRunAttempt = 2
    const retryRunFailure = await dispatch.dispatchAgain(
      {
        session: host.session,
        callId: 'actual-call-8',
        attempt: 2,
        plan: { provider: 'test' },
      },
      { consumeFailure: true },
    )
    expect(retryRunFailure.result).toHaveProperty('settled')
    if (retryRunFailure.consumption.kind !== 'failure')
      throw new Error('Run retry failure source absent')
    const retryRunSource = retryRunFailure.consumption.source
    expect(retryRunSource.verify(retryRunSource.subject, { run, attempt: 2 })).toHaveProperty(
      'authoritativeSubject',
    )
    expect(firstRunSource.verify(firstRunSource.subject, { run, attempt: 2 })).toHaveProperty(
      'authoritativeSubject',
    )
    firstRunSource.release()
    retryRunSource.release()
    expect(calibrationTargets.at(-1)).toEqual({
      callId: 'actual-call-8',
      dispatch: 2,
      run,
      attempt: 2,
    })
    // F18-V6: the calibration target is the same Run/attempt as the new dispatched shell, while
    // the original dispatch and its response keep attempt 1.
    const durable = await binding.log.log.readSince(host.session, 0)
    if (!('entries' in durable)) throw new Error('durable Run prefix')
    const shells = durable.entries.flatMap(entry => {
      const payload = entry.payload
      if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return []
      if (modelCategory(payload) !== 'record') return []
      const value = modelValue(payload)
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return []
      const record = value as { readonly kind?: unknown; readonly call?: unknown }
      return record.kind === 'model_call_dispatched' && record.call === 'actual-call-8'
        ? [{ run: entry.run, attempt: entry.attempt }]
        : []
    })
    expect(shells).toEqual([
      { run, attempt: 1 },
      { run, attempt: 2 },
    ])
    const sendsBeforeRefusal = sendCount
    const openInput = {
      creationKey: creationKey('eligibility-check'),
      session: host.session,
      target: effective.ok.routeName,
      basis: effective.ok,
      messages: [],
      tools: [],
      host: lifecycleHost,
    }
    expect(
      await opening.openCall({
        ...openInput,
        target: 'example/not-registered',
        basis: {
          ...effective.ok,
          routeName: 'example/not-registered',
          profile: { ...effective.ok.profile, routeName: 'example/not-registered' },
        },
      }),
    ).toEqual({ profileNotFound: true })
    const image = judgeMessage({
      id: 'eligibility-image',
      type: 'user',
      createdAt: '2026-10-10T00:00:00Z',
      blocks: [
        {
          id: 'image',
          kind: 'image',
          mediaType: 'image/png',
          data: { inline: 'AA==' },
          visibility: { toModel: true, toHuman: true },
        },
      ],
    })
    if (!('ok' in image)) throw new Error('invalid history image')
    expect(
      await host.log.append(
        host.session,
        [{ tenant: host.tenant, readKeys: [], payload: messageLogPayload(image.ok) }],
        { kind: 'unfenced' },
        { kind: 'unconditional' },
      ),
    ).toHaveProperty('positions')
    expect(await opening.openCall(openInput)).toEqual({
      callId: 'actual-call-10',
      state: 'handed_up',
      undispatched: 'modality_mismatch',
    })
    const {
      registration: _registration,
      updatedAt: _updatedAt,
      ...content
    } = profile('example/withdrawn')
    const registered = await host.catalog.registerProfile(
      host.tenant,
      { layer: 'tenant', tenant: host.tenant },
      { ...content, origin: 'custom' },
    )
    if ('failure' in registered) throw new Error('actual model registration failed')
    expect(await host.catalog.withdrawProfile(host.tenant, registered.ref)).toHaveProperty(
      'registration',
      'withdrawn',
    )
    expect(
      await opening.openCall({
        ...openInput,
        target: 'example/withdrawn',
        basis: { ...effective.ok, routeName: 'example/withdrawn', profile: registered.ref },
      }),
    ).toEqual({ callId: 'actual-call-11', state: 'handed_up', undispatched: 'withdrawn' })
    expect(sendCount).toBe(sendsBeforeRefusal)
    const rejectedLog = await host.log.readSince(host.session, durable.tail)
    if (!('entries' in rejectedLog)) throw new Error('actual rejected call journal missing')
    expect(
      rejectedLog.entries.filter(entry => payload(entry).kind === 'model_call_dispatched'),
    ).toEqual([])
  } finally {
    await contentStore.close()
    await host.close()
  }
}, 30_000)
