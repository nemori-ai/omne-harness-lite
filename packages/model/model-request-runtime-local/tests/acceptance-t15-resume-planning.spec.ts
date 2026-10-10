import { invokeModel } from '@omne-harness-lite/model-request-runtime-local'
import { modelCategory } from './log-codec-fixture.ts'
// @module-tag slow
// 归慢层：整套装配＋真库：用例经会话选择宿主起租户、时钟与评估输入的整套装配（SQLite 文件库），并开真实 SQL journal 会话日志。
import { createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { judgeMessage, type Message } from '@omne-harness-lite/messages'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type { LogEntry } from '@omne-harness-lite/session-log'
import {
  captureModelLogValue,
  prepareModelLogEntry,
} from '@omne-harness-lite/model-request-runtime'
import { interpretCallHistory } from '@omne-harness-lite/model-request-runtime'
import { createCallContainerStore } from '@omne-harness-lite/session-runtime-local'
import { createSessionModelRuntime } from '@omne-harness-lite/session-runtime-local'
import type { SessionModelConstruction } from '@omne-harness-lite/session-runtime-local'
import type { SessionRuntimeBinding } from '@omne-harness-lite/model-request-runtime'
import type { ModelCallHost } from '@omne-harness-lite/model-request-runtime'
import { policy as invocationPolicy } from './invoke-policy-fixture.ts'
import {
  ControlledSettlementOwner,
  noWaitScheduler,
  policy as settlementPolicy,
} from './settlement-fixture.ts'
import { payload, transport, type TestPlan } from './anchored-invocation-fixture.ts'
import { AT, profile, selectionHost } from './session-selection-fixture.ts'
import { referencePorts } from './reference-ports-fixture.ts'

const CALL = 't15-recovered-call'
const RESPONSE = 't15-lost-response'

function message(value: unknown): Message {
  const judged = judgeMessage(value)
  if (!('ok' in judged)) throw new Error(`invalid test message: ${judged.rejected}`)
  return judged.ok
}

function isResponseEntry(entry: LogEntry): boolean {
  return modelCategory(entry.payload) === 'response'
}

const image = message({
  id: 't15-image-user',
  type: 'user',
  createdAt: AT,
  blocks: [
    {
      id: 't15-image',
      kind: 'image',
      mediaType: 'image/png',
      data: { inline: 'iVBORw0KGgo=' },
      visibility: { toHuman: true, toModel: true },
    },
  ],
})
const orphan = message({
  id: 't15-orphan-assistant',
  type: 'assistant',
  response: 'other-response',
  ending: 'complete',
  createdAt: AT,
  blocks: [
    {
      id: 't15-orphan-call',
      kind: 'tool_call',
      callId: 'orphan-call',
      tool: 'lookup__exact',
      complete: true,
      arguments: {},
      visibility: { toHuman: true, toModel: true },
    },
  ],
})
const internal = message({
  id: 't15-tool-internal',
  type: 'tool_internal',
  callId: 'orphan-call',
  ending: 'lost',
  createdAt: AT,
  blocks: [
    {
      id: 't15-tool-frame',
      kind: 'text',
      text: 'private tool frame',
      visibility: { toHuman: false, toModel: false },
    },
  ],
})
const corrected = message({
  id: 't15-corrected-user',
  type: 'user',
  createdAt: AT,
  blocks: [
    {
      id: 't15-corrected-text',
      kind: 'text',
      text: 'continue',
      visibility: { toHuman: true, toModel: true },
    },
  ],
})

async function ready() {
  const source = await selectionHost(true, true)
  const selected = source.create()
  expect(await selected.component.selectModel('example/model-a')).toEqual({
    selected: 'example/model-a',
  })
  const effective = await selected.component.effectiveModel()
  if (!('ok' in effective)) throw new Error('effective basis missing')
  const basis = effective.ok
  const original = profile('example/model-a')
  const { origin: _origin, routeName: _route, registration: _registration, ...snapshot } = original
  const captured = captureModelLogValue({
    category: 'record',
    input: {
      kind: 'value',
      value: {
        kind: 'model_call_dispatched',
        call: CALL,
        dispatch: 1,
        response: RESPONSE,
        adaptation: original.adaptation,
        profile: { origin: original.origin, routeName: original.routeName },
        profileSnapshot: snapshot,
        provider: 'test',
        selectedBy: 'session',
        credentialScope: { layer: 'factory' },
        parameters: { maxOutputTokens: 128 },
      },
    },
  })
  if (!('ok' in captured)) throw new Error(`real original dispatch capture: ${captured.reason}`)
  const prepared = prepareModelLogEntry({
    session: source.session,
    shell: { tenant: source.tenant },
    captured: captured.ok,
    purpose: { kind: 'record' },
    messagePrefix: [],
  })
  if (!('ok' in prepared)) throw new Error(`real original dispatch entry: ${prepared.reason}`)
  const appended = await source.log.append(
    source.session,
    [prepared.ok],
    { kind: 'unfenced' },
    { kind: 'unconditional' },
  )
  if ('failure' in appended) throw new Error('original dispatch was not durable')
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
  let plans = 0
  let sends = 0
  const plannedMessages: (readonly Message[])[] = []
  let refusal: 'modality_not_carried' | 'orphan_tool_call' | 'tool_internal_in_request' | undefined
  const wire = transport()
  const messageId = parseOpaqueIdentifier('t15-resume-message', 'MessageId')
  if (!('ok' in messageId)) throw new Error('response message id')
  const callHost: ModelCallHost = {
    signal: new AbortController().signal,
    stopping: () => false,
    register: () => ({ registration: { unregister() {} } }),
  }
  const owner = new ControlledSettlementOwner()
  const binding: SessionRuntimeBinding = {
    log: selected.input.binding,
    sourceVersions: { fixture: 't15-resume-v1' },
    selection: { ...selected.input, projection: async () => ({ known: [] }) },
    catalog: source.catalog,
    currentEvaluationInputs: source.reader,
    credentials: {
      async value() {
        return {
          scope: { layer: 'factory' as const },
          value: new TextEncoder().encode('t15-resume-secret'),
        }
      },
    },
    tools: {
      async lookup() {
        throw new Error('this acceptance case has no tool definitions')
      },
    },
  }
  const calls = createCallContainerStore<TestPlan, object>()
  const config: SessionModelConstruction<TestPlan, object> = {
    execute: ({ input }) => ({ invocation: invokeModel(input) }),
    ...referencePorts(source, calls),
    maxScopes: 4,
    sessions: { bind: async () => ({ binding }) },
    calls,
    transport: {
      clearReuseScope() {},
      acquire: () => ({
        lease: {
          binding: original.adaptation,
          transport: {
            ...wire.adapter,
            async plan(input, execution) {
              plans++
              plannedMessages.push(input.messages)
              if (refusal !== undefined) {
                return { rejected: refusal }
              }
              return wire.adapter.plan(input, execution)
            },
            async send(planned, credential, signal, diagnostics) {
              sends++
              const response = await fetch(url, { method: 'POST', body: 'request', signal })
              if (!response.ok) throw new Error('local HTTP send failed')
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
      call: () => 'unexpected-new-call',
      response: () => 't15-resumed-response',
      message: () => messageId.ok,
    },
    history: {
      call: (prefix, callId) => interpretCallHistory({ prefix, callId }),
      calibration: () => ({ sourceUnavailable: true }),
      failure: () => ({ unavailable: true }),
      run: () => ({ unavailable: true }),
    },
    recovery: {
      async authorize() {
        return { authorized: true as const }
      },

      enter: async () => ({
        scope: {
          binding: { log: selected.input.binding },
          owner,
          // The controlled predecessor has no active handle after its durable D; the real
          // SL3 prefix and recovery writer, rather than a fabricated phase, decide the result.
          originalInvocation: () => ({ absent: true }),
          async close() {},
        },
      }),
    },
    diagnostic() {},
  }
  const runtime = createSessionModelRuntime(config)
  const reconciled = await runtime.service.reconcile({ session: source.session })
  expect(reconciled).toEqual({ calls: [{ callId: CALL, state: 'resumable' }] })
  expect(
    await runtime.service.readAttempts({ session: source.session, callId: CALL }),
  ).toMatchObject({
    state: 'resumable',
    dispatches: [{ ordinal: 1 }],
  })
  async function entries() {
    const read = await source.log.readSince(source.session, 0)
    if ('failure' in read) throw new Error('actual SQL journal unavailable')
    return read.entries
  }
  function resume(messages: readonly Message[]) {
    return runtime.service.openCall({
      creationKey: unwrap(parseOpaqueIdentifier('t15_resume_original', 'CreationKey')),
      session: source.session,
      callId: CALL,
      target: original.routeName,
      basis,
      messages,
      tools: [],
      parameters: { maxOutputTokens: 1 },
      host: callHost,
    })
  }
  return {
    runtime,
    source,
    entries,
    resume,
    setRefusal(value: typeof refusal) {
      refusal = value
    },
    plans: () => plans,
    plannedMessages,
    sends: () => sends,
    requests: () => requests,
    async close() {
      await runtime.close()
      await source.close()
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve())),
      )
    },
  }
}

describe('RT10 T15 durable resumable planning and release', () => {
  const fixtures: Awaited<ReturnType<typeof ready>>[] = []
  afterEach(async () => {
    for (const fixture of fixtures.splice(0)) await fixture.close()
  })

  it('rejects each new input without changing the original D/R, then resumes corrected input', async () => {
    const fixture = await ready()
    fixtures.push(fixture)
    const originalEntries = await fixture.entries()
    const originalResponse = originalEntries.find(isResponseEntry)
    expect(originalResponse).toBeDefined()
    expect(
      originalEntries.map(payload).filter(item => item.kind === 'model_call_opened'),
    ).toHaveLength(0)
    for (const scenario of [
      { value: image, rejection: 'modality_not_carried', expected: 'modality_mismatch' },
      { value: orphan, rejection: 'orphan_tool_call', expected: 'malformed' },
      { value: internal, rejection: 'tool_internal_in_request', expected: 'malformed' },
    ] as const) {
      const beforePlans = fixture.plans()
      fixture.setRefusal(scenario.rejection)
      const opened = await fixture.resume([scenario.value])
      if (scenario.value === image) {
        expect(opened).toEqual({
          ref: { session: fixture.source.session, callId: CALL },
          callId: CALL,
          state: 'resumable',
        })
        const rejected = await fixture.runtime.service.dispatch({
          session: fixture.source.session,
          callId: CALL,
        })
        expect(fixture.plans()).toBe(beforePlans + 1)
        expect(fixture.plannedMessages.at(-1)).toContainEqual(scenario.value)
        expect(rejected).toEqual({ invalidInput: { reason: scenario.expected } })
      } else {
        // These two malformed histories are rejected by the earlier openCall input gate.
        expect(opened).toEqual({ invalidInput: { reason: 'malformed' } })
        expect(fixture.plans()).toBe(beforePlans)
      }
      expect(await fixture.entries()).toEqual(originalEntries)
      expect(fixture.requests()).toBe(0)
      expect(fixture.sends()).toBe(0)
      expect(
        await fixture.runtime.service.readAttempts({
          session: fixture.source.session,
          callId: CALL,
        }),
      ).toMatchObject({ state: 'resumable', dispatches: [{ ordinal: 1 }] })
    }
    expect(fixture.plans()).toBe(1)
    // A downstream adapter can still reject after a valid resume request was captured.
    // These injected planner results exercise S-29's historical-dispatch branch separately
    // from the two real early input refusals above.
    for (const refusal of ['orphan_tool_call', 'tool_internal_in_request'] as const) {
      fixture.setRefusal(refusal)
      expect(await fixture.resume([corrected])).toEqual({
        ref: { session: fixture.source.session, callId: CALL },
        callId: CALL,
        state: 'resumable',
      })
      expect(
        await fixture.runtime.service.dispatch({ session: fixture.source.session, callId: CALL }),
      ).toEqual({ invalidInput: { reason: 'malformed' } })
      expect(await fixture.entries()).toEqual(originalEntries)
      expect(fixture.requests()).toBe(0)
      expect(fixture.sends()).toBe(0)
      expect(
        await fixture.runtime.service.readAttempts({
          session: fixture.source.session,
          callId: CALL,
        }),
      ).toMatchObject({ state: 'resumable', dispatches: [{ ordinal: 1 }] })
    }
    expect(fixture.plans()).toBe(3)
    fixture.setRefusal(undefined)
    expect(await fixture.resume([corrected])).toEqual({
      ref: { session: fixture.source.session, callId: CALL },
      callId: CALL,
      state: 'resumable',
    })
    expect(
      await fixture.runtime.service.dispatch({ session: fixture.source.session, callId: CALL }),
    ).toHaveProperty('replyPending')
    expect(fixture.requests()).toBe(1)
    expect(
      (await fixture.entries()).map(payload).filter(item => item.kind === 'model_call_dispatched'),
    ).toHaveLength(2)
  })

  it('releases a genuinely reconciled resumable call once without cause or another response', async () => {
    const fixture = await ready()
    fixtures.push(fixture)
    const before = await fixture.entries()
    expect(
      await fixture.runtime.service.releaseCall({ session: fixture.source.session, callId: CALL }),
    ).toEqual({ callId: CALL, state: 'handed_up' })
    const after = await fixture.entries()
    expect(after.slice(before.length).map(payload)).toEqual([
      {
        kind: 'model_call_ended',
        call: CALL,
        ending: 'released',
      },
    ])
    expect(after.filter(isResponseEntry)).toHaveLength(1)
    expect(
      await fixture.runtime.service.releaseCall({ session: fixture.source.session, callId: CALL }),
    ).toEqual({ alreadyEnded: true })
    expect(await fixture.entries()).toEqual(after)
    expect(fixture.requests()).toBe(0)
    expect(fixture.sends()).toBe(0)
  })
})
