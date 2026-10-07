// @module-tag slow
// 归慢层：整套装配＋真库：用例经会话选择宿主起租户、时钟与评估输入的整套装配（SQLite 文件库），并开真实 JSONL 会话日志。
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { judgeModelResponse, type ModelResponse } from '@omne-harness-lite/model-response'
import type { ModelCallHost, SessionRuntimeBinding } from '@omne-harness-lite/model-request-runtime'
import type { RuntimeConstruction } from '../src/service-types.ts'
import { createCallContainerStore } from '../src/service-container.ts'
import { createModelRuntime } from '../src/service-runtime.ts'
import { interpretCallHistory } from '@omne-harness-lite/model-request-runtime'
import { policy as invocationPolicy } from './invoke-policy-fixture.ts'
import {
  ControlledSettlementOwner,
  noWaitScheduler,
  policy as settlementPolicy,
} from './settlement-fixture.ts'
import { payload, transport, type TestPlan } from './anchored-invocation-fixture.ts'
import { AT, selectionHost } from './session-selection-fixture.ts'
import { referencePorts } from './reference-ports-fixture.ts'

function isResponse(value: unknown): value is ModelResponse {
  return 'ok' in judgeModelResponse(value)
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

async function ready() {
  const source = await selectionHost(true, true)
  const selected = source.create()
  expect(await selected.component.selectModel('example/model-a')).toEqual({
    selected: 'example/model-a',
  })
  const effective = await selected.component.effectiveModel()
  if (!('ok' in effective)) throw new Error('current selection missing')
  const basis = effective.ok
  const server = createServer((_request, response) => {
    requests++
    response.writeHead(200).end('received')
  })
  let requests = 0
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('local HTTP address')
  const url = `http://127.0.0.1:${address.port}/model`
  const wire = transport()
  const observedCredentials: string[] = []
  const observedPlans: TestPlan[] = []
  const scheduled: number[] = []
  let currentCredential = 'test-first-credential'
  let currentUnreadable = false
  let credentialMissing = false
  let failSend = true
  let issuedCalls = 0
  let issuedResponses = 0
  const message = parseOpaqueIdentifier('t15-fresh-message', 'MessageId')
  if (!('ok' in message)) throw new Error('message id')
  const host: ModelCallHost = {
    signal: new AbortController().signal,
    stopping: () => false,
    register: () => ({ registration: { unregister() {} } }),
  }
  const owner = new ControlledSettlementOwner()
  const binding: SessionRuntimeBinding = {
    log: selected.input.binding,
    sourceVersions: { fixture: 't15-fresh-v1' },
    selection: { ...selected.input, projection: async () => ({ known: [] }) },
    catalog: source.catalog,
    currentEvaluationInputs: {
      async read(session, tenant) {
        return currentUnreadable
          ? { failure: 'unavailable' as const }
          : await source.reader.read(session, tenant)
      },
    },
    credentials: {
      async value() {
        return credentialMissing
          ? ({ failure: 'credentialUnavailable' } as const)
          : {
              scope: { layer: 'factory' as const },
              value: new TextEncoder().encode(currentCredential),
            }
      },
    },
    tools: {
      async lookup() {
        throw new Error('no tools in this call')
      },
    },
  }
  const calls = createCallContainerStore<TestPlan, object>()
  const config: RuntimeConstruction<TestPlan, object> = {
    ...referencePorts(source, calls),
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
              observedPlans.push(planned)
              observedCredentials.push(digest(credential))
              const sent = await fetch(url, { method: 'POST', body: 'request', signal })
              if (!sent.ok) throw new Error('local HTTP did not accept the request')
              return failSend
                ? { failed: { source: 'http_status', statusCode: 503 } }
                : await wire.adapter.send(planned, credential, signal, diagnostics)
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
    policy: {
      ...invocationPolicy(),
      schedule(milliseconds) {
        scheduled.push(milliseconds)
        return () => {}
      },
    },
    identities: {
      call: () => `t15-fresh-call-${++issuedCalls}`,
      response: () => `t15-fresh-response-${++issuedResponses}`,
      message: () => message.ok,
    },
    history: {
      call: (prefix, callId) => interpretCallHistory({ prefix, callId }),
      calibration: () => ({ sourceUnavailable: true }),
      failure: (prefix, callId) => {
        const found = interpretCallHistory({ prefix, callId })
        if (!('known' in found)) return { unavailable: true }
        const first = found.known.dispatches[0]?.record
        const latest = found.known.dispatches.at(-1)
        const value: unknown = latest?.response?.value
        if (
          first === undefined ||
          latest === undefined ||
          !isResponse(value) ||
          value.outcome !== 'failed'
        )
          return { unavailable: true }
        return {
          subject: {
            failure: value.failure.cause,
            ...(value.failure.statusCode === undefined
              ? {}
              : { statusCode: value.failure.statusCode }),
            profile: latest.record.profileSnapshot,
            dispatches: [first, ...found.known.dispatches.slice(1).map(item => item.record)],
            retryConclusions: [],
          },
        }
      },
      run: () => ({ unavailable: true }),
    },
    recovery: {
async authorize() { return { authorized: true as const } },

      enter: async () => ({
        scope: {
          binding: { log: selected.input.binding },
          owner,
          originalInvocation: () => ({ unavailable: true }),
          async close() {},
        },
      }),
    },
    diagnostic() {},
  }
  const runtime = createModelRuntime(config)
  async function openCall() {
    const opened = await runtime.service.openCall({
      creationKey: unwrap(parseOpaqueIdentifier(`t15_fresh_${issuedCalls + 1}`, 'CreationKey')),
      session: source.session,
      target: basis.routeName,
      basis,
      messages: [],
      tools: [],
      parameters: { temperature: 0.2, maxOutputTokens: 128 },
      host,
    })
    if (!('callId' in opened) || opened.state !== 'open')
      throw new Error(`open: ${JSON.stringify(opened)}`)
    return { session: source.session, callId: opened.callId }
  }
  async function records() {
    const read = await source.log.readSince(source.session, 0)
    if ('failure' in read) throw new Error('actual JSONL unavailable')
    return read.entries.map(payload)
  }
  return {
    runtime,
    source,
    openCall,
    records,
    scheduled,
    observedCredentials,
    observedPlans,
    requests: () => requests,
    setCredential(value: string) {
      currentCredential = value
    },
    setCredentialMissing(value: boolean) {
      credentialMissing = value
    },
    setCurrentUnreadable(value: boolean) {
      currentUnreadable = value
    },
    setFailSend(value: boolean) {
      failSend = value
    },
    async close() {
      await runtime.close()
      await source.close()
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve())),
      )
    },
  }
}

describe('RT10 T15 current dispatch inputs', () => {
  const fixtures: Awaited<ReturnType<typeof ready>>[] = []
  afterEach(async () => {
    for (const fixture of fixtures.splice(0)) await fixture.close()
  })

  it('uses both newly published limits and the rotated credential for the same call retry', async () => {
    const fixture = await ready()
    fixtures.push(fixture)
    const call = await fixture.openCall()
    expect(await fixture.runtime.service.dispatch(call)).toMatchObject({
      settled: { outcome: 'failed' },
    })
    expect(await fixture.runtime.service.readAttempts(call)).toMatchObject({
      state: 'awaiting_decision',
    })
    expect(fixture.requests()).toBe(1)
    const initial = fixture.observedPlans[0]
    if (initial === undefined) throw new Error('first planned request missing')
    expect(fixture.observedCredentials).toEqual([digest('test-first-credential')])
    const before = await fixture.records()
    expect(before.filter(item => item.kind === 'model_call_dispatched')).toHaveLength(1)
    expect(before.filter(item => item.kind === 'model_call_opened')).toHaveLength(0)

    await fixture.source.publish([
      { item: 'first_token_wait_limit', value: 'PT7S', immutable: false, since: AT },
      { item: 'post_first_token_stall_limit', value: 'PT9S', immutable: false, since: AT },
    ])
    fixture.setCredential('test-rotated-credential')
    fixture.setFailSend(false)
    expect(
      await fixture.runtime.service.dispatchAgain({ ...call, plan: { provider: 'test' } }),
    ).toHaveProperty('replyPending')
    expect(fixture.requests()).toBe(2)
    expect(fixture.observedCredentials).toEqual([
      digest('test-first-credential'),
      digest('test-rotated-credential'),
    ])
    expect(fixture.scheduled).toContain(7000)
    expect(fixture.scheduled).toContain(9000)
    const retried = fixture.observedPlans[1]
    if (retried === undefined) throw new Error('retry plan missing')
    expect(retried.input.snapshot).toEqual(initial.input.snapshot)
    expect(retried.input.parameters).toEqual(initial.input.parameters)
    expect(retried.input.snapshot.adaptation).toEqual(initial.input.snapshot.adaptation)
    const after = await fixture.records()
    expect(after.filter(item => item.kind === 'model_call_dispatched')).toHaveLength(2)
    expect(after.filter(item => item.kind === 'model_call_opened')).toHaveLength(1)
  })

  it('preserves awaiting_decision without a new anchor when current evaluation is unavailable', async () => {
    const fixture = await ready()
    fixtures.push(fixture)
    const call = await fixture.openCall()
    expect(await fixture.runtime.service.dispatch(call)).toMatchObject({
      settled: { outcome: 'failed' },
    })
    const before = await fixture.records()
    fixture.setCurrentUnreadable(true)
    expect(
      await fixture.runtime.service.dispatchAgain({ ...call, plan: { provider: 'test' } }),
    ).toEqual({ unavailable: true })
    expect(await fixture.records()).toEqual(before)
    expect(fixture.requests()).toBe(1)
    expect(fixture.observedCredentials).toHaveLength(1)
    expect(await fixture.runtime.service.readAttempts(call)).toMatchObject({
      state: 'awaiting_decision',
    })
  })

  it('releases a previously dispatched call only when the fresh credential is missing', async () => {
    const fixture = await ready()
    fixtures.push(fixture)
    const call = await fixture.openCall()
    expect(await fixture.runtime.service.dispatch(call)).toMatchObject({
      settled: { outcome: 'failed' },
    })
    const before = await fixture.records()
    fixture.setCredentialMissing(true)
    expect(
      await fixture.runtime.service.dispatchAgain({ ...call, plan: { provider: 'test' } }),
    ).toEqual({
      callId: call.callId,
      state: 'handed_up',
      released: { cause: 'credential_unavailable' },
    })
    const after = await fixture.records()
    expect(after.filter(item => item.kind === 'model_call_dispatched')).toHaveLength(1)
    expect(after.slice(before.length)).toEqual([
      {
        kind: 'model_call_ended',
        call: call.callId,
        ending: 'released',
        cause: 'credential_unavailable',
      },
    ])
    expect(fixture.requests()).toBe(1)
    expect(fixture.observedCredentials).toHaveLength(1)
  })
})
