// @module-tag slow
// 归慢层：整套装配＋真库：用例经会话选择宿主起租户、时钟与评估输入的整套装配（SQLite 文件库），并开真实 SQL journal 会话日志。
import { createServer } from 'node:http'
import { describe, expect, it } from 'vitest'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { judgeModelResponse, type ModelResponse } from '@omne-harness-lite/model-response'
import type { RuntimeConstruction, SessionRuntimeBinding } from '../src/service-types.ts'
import type { ModelCallHost } from '@omne-harness-lite/model-request-runtime'
import { createCallContainerStore } from '../src/service-container.ts'
import { createModelRuntime } from '../src/service-runtime.ts'
import { interpretCallHistory } from '../src/call-history.ts'
import { policy as invocationPolicy } from './invoke-policy-fixture.ts'
import {
  ControlledSettlementOwner,
  noWaitScheduler,
  policy as settlementPolicy,
} from './settlement-fixture.ts'
import { transport, type TestPlan } from './anchored-invocation-fixture.ts'
import { selectionHost } from './session-selection-fixture.ts'
import { referencePorts } from './reference-ports-fixture.ts'

function isResponse(value: unknown): value is ModelResponse {
  return 'ok' in judgeModelResponse(value)
}

describe('RT10 thirteen-operation noRun public service gate', () => {
  it('uses one owned service with actual SQLite/SL3 state and exactly two local HTTP sends', async () => {
    const host = await selectionHost(true, true)
    let httpRequests = 0
    const server = createServer((_request, response) => {
      httpRequests++
      response.writeHead(200).end('ok')
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    let runtime: ReturnType<typeof createModelRuntime<TestPlan, object>> | undefined
    try {
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('HTTP address')
      const url = `http://127.0.0.1:${address.port}/model`
      const selected = host.create()
      const held = new Set<Parameters<ModelCallHost['register']>[0]>()
      const callHost: ModelCallHost = {
        signal: new AbortController().signal,
        stopping: () => false,
        register(close) {
          held.add(close)
          return {
            registration: {
              unregister: () => {
                held.delete(close)
              },
            },
          }
        },
      }
      const wire = transport()
      const recoveryOwner = new ControlledSettlementOwner()
      let failSend = false
      const binding: SessionRuntimeBinding = {
        log: selected.input.binding,
        sourceVersions: { fixture: 'public-operations-v1' },
        selection: { ...selected.input, projection: async () => ({ known: [] }) },
        catalog: host.catalog,
        currentEvaluationInputs: host.reader,
        credentials: {
          async value() {
            return {
              scope: { layer: 'factory' as const },
              value: new TextEncoder().encode('local-test-secret'),
            }
          },
        },
        tools: {
          async lookup() {
            throw new Error('no tools requested')
          },
        },
      }
      let issuedCalls = 0
      let issuedResponses = 0
      const parsedMessage = parseOpaqueIdentifier('thirteen-message', 'MessageId')
      if (!('ok' in parsedMessage)) throw new Error('message id')
      const calls = createCallContainerStore<TestPlan, object>()
      const config: RuntimeConstruction<TestPlan, object> = {
        ...referencePorts(host, calls),
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
                async send(planned, credential, signal, diagnostics) {
                  const response = await fetch(url, {
                    method: 'POST',
                    body: 'request',
                    signal,
                  })
                  if (!response.ok) throw new Error('local HTTP send failed')
                  if (failSend) return { failed: { source: 'http_status', statusCode: 503 } }
                  return await wire.adapter.send(planned, credential, signal, diagnostics)
                },
              },
              signal: new AbortController().signal,
              async track<T>(completion: Promise<T>) {
                return await completion
              },
              release() {},
            },
          }),
        },
        settlementContention: settlementPolicy(),
        settlementScheduler: noWaitScheduler,
        reservationWaitPolicy: { maxWaitersPerCall: 2, timeoutMs: 100 },
        acknowledgementCleanup: { next: () => ({ stop: true }) },
        tokenMargin: { multiplier: 1, reserveTokens: 0 },
        policy: { ...invocationPolicy(), schedule: () => () => {} },
        identities: {
          call: () => `thirteen-call-${++issuedCalls}`,
          response: () => `thirteen-response-${++issuedResponses}`,
          message: () => parsedMessage.ok,
        },
        history: {
          call: (prefix, callId) => interpretCallHistory({ prefix, callId }),
          calibration: () => ({ sourceUnavailable: true }),
          failure: (prefix, callId) => {
            const found = interpretCallHistory({ prefix, callId })
            if (!('known' in found)) return { unavailable: true }
            const latest = found.known.dispatches.at(-1)
            const value: unknown = latest?.response?.value
            if (!isResponse(value) || value.outcome !== 'failed' || latest === undefined)
              return { unavailable: true }
            const records = found.known.dispatches.map(item => item.record)
            const first = records[0]
            if (first === undefined) return { unavailable: true }
            const base = {
              failure: value.failure.cause,
              profile: latest.record.profileSnapshot,
              dispatches: [first, ...records.slice(1)] as const,
              // This fixture has no runner conclusions; their source is outside this test.
              retryConclusions: [] as const,
            }
            if (value.failure.inBand === true) {
              if (value.failure.statusCode === undefined) return { unavailable: true }
              return {
                subject: { ...base, statusCode: value.failure.statusCode, inBand: true as const },
              }
            }
            return {
              subject: {
                ...base,
                ...(value.failure.statusCode === undefined
                  ? {}
                  : { statusCode: value.failure.statusCode }),
              },
            }
          },
          run: () => ({ unavailable: true }),
        },
        recovery: {
          enter: async () => ({
            scope: {
              binding: { log: selected.input.binding },
              owner: recoveryOwner,
              originalInvocation: () => ({ unavailable: true }),
              close: async () => {},
            },
          }),
        },
        diagnostic() {},
      }
      runtime = createModelRuntime(config)
      const service = runtime.service
      const targets = await service.legalTargets({ session: host.session })
      expect(targets).toMatchObject({ legalTargets: expect.arrayContaining(['example/model-a']) })
      expect(
        await service.selectModel({ session: host.session, routeName: 'example/model-a' }),
      ).toEqual({ selected: 'example/model-a' })
      const listing = await service.displayList({ session: host.session })
      expect(listing).toHaveProperty('displayList')
      const effective = await service.effectiveModel({ session: host.session })
      if (!('effectiveModel' in effective)) throw new Error('effective model')
      expect(effective.effectiveModel.routeName).toBe('example/model-a')

      const open = await service.openCall({
        creationKey: unwrap(parseOpaqueIdentifier('operations_create_1', 'CreationKey')),
        session: host.session,
        target: effective.effectiveModel.routeName,
        basis: effective.effectiveModel,
        messages: [],
        tools: [],
        host: callHost,
      })
      expect(open).toEqual({
        ref: { session: host.session, callId: 'thirteen-call-1' },
        callId: 'thirteen-call-1',
        state: 'open',
      })
      const first = { session: host.session, callId: 'thirteen-call-1' }
      expect(await service.readAttempts(first)).toEqual({ state: 'open', dispatches: [] })
      const retry = { provider: 'first' }
      expect(await service.canDispatchAgain({ ...first, plan: retry })).toHaveProperty('wrongPhase')
      expect(await service.releaseCall(first)).toHaveProperty('wrongPhase')
      expect(httpRequests).toBe(0)

      expect(await service.dispatch(first)).toHaveProperty('replyPending')
      expect(httpRequests).toBe(1)
      expect(wire.sends()).toBe(1)
      expect(await service.canDispatchAgain({ ...first, plan: retry })).toEqual({
        alreadyEnded: true,
      })
      expect(await service.dispatchAgain({ ...first, plan: retry })).toEqual({
        alreadyEnded: true,
      })
      expect(httpRequests).toBe(1)
      expect(
        await service.settleReply({
          ...first,
          disposition: { vetoed: { by: 'acceptance-gate' } },
        }),
      ).toEqual({ callId: first.callId, state: 'complete' })
      expect(await service.readAttempts(first)).toMatchObject({
        state: 'complete',
        dispatches: [{ ordinal: 1 }],
      })
      expect(await service.dispatch(first)).toEqual({ alreadyEnded: true })
      expect(await service.releaseCall(first)).toEqual({ alreadyEnded: true })
      expect(await service.interrupt({ ...first, initiator: 'user' })).toEqual({
        alreadyEnded: true,
      })
      expect(httpRequests).toBe(1)
      const second = await service.openCall({
        creationKey: unwrap(parseOpaqueIdentifier('operations_create_2', 'CreationKey')),
        session: host.session,
        target: effective.effectiveModel.routeName,
        basis: effective.effectiveModel,
        messages: [],
        tools: [],
        host: callHost,
      })
      expect(second).toEqual({
        ref: { session: host.session, callId: 'thirteen-call-2' },
        callId: 'thirteen-call-2',
        state: 'open',
      })
      expect(
        await service.interrupt({
          session: host.session,
          callId: 'thirteen-call-2',
          initiator: 'user',
        }),
      ).toEqual({ stage: 'before_dispatch' })
      expect(await service.reconcile({ session: host.session })).toMatchObject({
        calls: expect.arrayContaining([{ callId: 'thirteen-call-2', state: 'interrupted' }]),
      })
      expect(httpRequests).toBe(1)
      const third = await service.openCall({
        creationKey: unwrap(parseOpaqueIdentifier('operations_create_3', 'CreationKey')),
        session: host.session,
        target: effective.effectiveModel.routeName,
        basis: effective.effectiveModel,
        messages: [],
        tools: [],
        host: callHost,
      })
      expect(third).toEqual({
        ref: { session: host.session, callId: 'thirteen-call-3' },
        callId: 'thirteen-call-3',
        state: 'open',
      })
      const failedCall = { session: host.session, callId: 'thirteen-call-3' }
      failSend = true
      expect(await service.dispatch(failedCall)).toMatchObject({
        settled: { outcome: 'failed', failure: { cause: 'upstream_unavailable' } },
      })
      expect(await service.readAttempts(failedCall)).toMatchObject({
        state: 'awaiting_decision',
        failureSubject: { failure: 'upstream_unavailable' },
      })
      expect(await service.canDispatchAgain({ ...failedCall, plan: { provider: 'test' } })).toEqual(
        {
          allowed: true,
        },
      )
      expect(await service.releaseCall(failedCall)).toEqual({
        callId: failedCall.callId,
        state: 'handed_up',
      })
      expect(await service.dispatchAgain({ ...failedCall, plan: { provider: 'test' } })).toEqual({
        alreadyEnded: true,
      })
      expect(httpRequests).toBe(2)
      expect(await runtime.close()).toEqual({ released: true })
      expect(held.size).toBe(0)
    } finally {
      if (runtime) await runtime.close()
      await host.close()
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve())),
      )
    }
  })
})
