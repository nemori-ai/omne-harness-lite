// @module-tag slow
// 归慢层：整套装配＋真库：用例经会话选择宿主起租户、时钟与评估输入的整套装配（SQLite 文件库），并开真实 JSONL 会话日志。
/**
 * Review 2026-09-30 (independent verification of T29 tasks A and B), production runtime over a real
 * Cordis assembly, SQLite Storage and JSONL SessionLog.
 *
 * Part 0  shared harness: the same ports tests/service-runtime.spec.ts wires (no product behavior).
 * Part 1  Q3: after a durable ACK every runtime entry fails closed (RT12 S-97/S-100).
 * Part 2  Q4/Q5: unknown final-batch ownership, close, and the durable-ready projection (RT11 S-86).
 *
 * Only the receipt/readability of the log as the runtime sees it is disturbed by the wrappers; commit
 * or absence is always decided by the actual JSONL log. Tests assert the contract; a red test is a
 * counterexample against the product, not a fixture problem.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import type {
  SettlementRegistration,
  SettlementTask,
  SettlementTaskKind,
} from '../src/settlement-types.ts'
import type { AppendResult, LogEntry, SessionLog } from '@omne-harness-lite/session-log'
import type {
  ModelCallHost,
  RuntimeConstruction,
  SessionRuntimeBinding,
} from '../src/service-types.ts'
import { createCallContainerStore } from '../src/service-container.ts'
import { createModelRuntime } from '../src/service-runtime.ts'
import { interpretCallHistory } from '../src/call-history.ts'
import {
  captureModelLogValue,
  prepareModelLogEntry,
} from '@omne-harness-lite/model-request-runtime'
import { policy as invocationPolicy } from './invoke-policy-fixture.ts'
import {
  ControlledSettlementOwner,
  deferred,
  noWaitScheduler,
  policy as settlementPolicy,
} from './settlement-fixture.ts'
import { payload, transport, type TestPlan } from './anchored-invocation-fixture.ts'
import { selectionHost } from './session-selection-fixture.ts'
import { referencePorts } from './reference-ports-fixture.ts'

// ---- Part 0: harness ----
type Host = Awaited<ReturnType<typeof selectionHost>>

const messageId = (() => {
  const value = parseOpaqueIdentifier('review-message', 'MessageId')
  if (!('ok' in value)) throw new Error('message fixture invalid')
  return value.ok
})()

interface RuntimeOptions {
  readonly callPrefix?: string
  readonly wire?: ReturnType<typeof transport>
  readonly log?: () => SessionLog
  readonly responseId?: string
  readonly nextCall?: { value: number }
  readonly settlement?: ReturnType<typeof settlementPolicy>
  readonly bindLog?: (log: SessionRuntimeBinding['log']) => SessionRuntimeBinding['log']
  readonly historyCall?: RuntimeConstruction<TestPlan, object>['history']['call']
  readonly clearReuseScope?: () => void
  readonly diagnostic?: (event: { readonly kind: string }) => void
}

function makeCallHost(): ModelCallHost {
  const registrations = new Set<Parameters<ModelCallHost['register']>[0]>()
  return {
    signal: new AbortController().signal,
    stopping: () => false,
    register(close) {
      registrations.add(close)
      return {
        registration: {
          unregister() {
            registrations.delete(close)
          },
        },
      }
    },
  }
}

/** One production runtime over the host's session log (shared by warm and cold instances). */
function buildRuntime(host: Host, options: RuntimeOptions = {}) {
  const selected = host.create()
  const wire = options.wire ?? transport()
  const calls = createCallContainerStore<TestPlan, object>()
  const counter = options.nextCall ?? { value: 0 }
  const prefix = options.callPrefix ?? 'review-call'
  const boundLog = options.bindLog?.(selected.input.binding) ?? selected.input.binding
  const binding: SessionRuntimeBinding = {
    log: boundLog,
    sourceVersions: { fixture: 'review-v1' },
    selection: { ...selected.input, binding: boundLog, projection: async () => ({ known: [] }) },
    catalog: host.catalog,
    currentEvaluationInputs: host.reader,
    credentials: {
      async value() {
        return {
          scope: { layer: 'factory' as const },
          value: new TextEncoder().encode('test-secret'),
        }
      },
    },
    tools: {
      async lookup() {
        throw new Error('no tools requested')
      },
    },
  }
  let released = 0
  let acquired = 0
  const construction: RuntimeConstruction<TestPlan, object> = {
    ...referencePorts(host, calls),
    maxScopes: 4,
    sessions: { bind: async () => ({ binding }) },
    calls,
    transport: {
      clearReuseScope() {
        options.clearReuseScope?.()
      },
      acquire: () => (
        acquired++,
        {
          lease: {
            binding: {
              implementation: { name: 'test', revision: '1' },
              definition: { modelId: 'example/model-a', revision: '1' },
              configuration: { revision: '1', values: {} },
            },
            transport: wire.adapter,
            signal: new AbortController().signal,
            async track<T>(completion: Promise<T>) {
              return await completion
            },
            release() {
              released++
            },
          },
        }
      ),
    },
    settlementContention: options.settlement ?? settlementPolicy(),
    settlementScheduler: noWaitScheduler,
    reservationWaitPolicy: { maxWaitersPerCall: 2, timeoutMs: 100 },
    acknowledgementCleanup: { next: () => ({ stop: true }) },
    tokenMargin: { multiplier: 1, reserveTokens: 0 },
    policy: { ...invocationPolicy(options.diagnostic), schedule: () => () => {} },
    identities: {
      call: () => `${prefix}-${++counter.value}`,
      response: () => `${prefix}-response`,
      message: () => messageId,
    },
    history: {
      call: options.historyCall ?? ((p, callId) => interpretCallHistory({ prefix: p, callId })),
      calibration: () => ({ sourceUnavailable: true }),
      failure: () => ({ unavailable: true }),
      run: () => ({ unavailable: true }),
    },
    recovery: { enter: async () => ({ unavailable: true }) },
    diagnostic() {},
  }
  const runtime = createModelRuntime(construction)
  return {
    runtime,
    wire,
    calls,
    selected,
    binding,
    construction,
    released: () => released,
    acquired: () => acquired,
  }
}

type BuiltRuntime = ReturnType<typeof buildRuntime>

async function openOne(
  host: Host,
  built: BuiltRuntime,
  creationKey: string,
  callHost: ModelCallHost = makeCallHost(),
) {
  const effective = await built.runtime.service.effectiveModel({ session: host.session })
  if (!('effectiveModel' in effective)) throw new Error('effective model absent')
  const input = {
    creationKey: unwrap(parseOpaqueIdentifier(creationKey, 'CreationKey')),
    session: host.session,
    target: effective.effectiveModel.routeName,
    basis: effective.effectiveModel,
    messages: [],
    tools: [],
    host: callHost,
  } as const
  return { input, opened: await built.runtime.service.openCall(input) }
}

async function readEntries(host: Host): Promise<readonly LogEntry[]> {
  const log = await host.log.readSince(host.session, 0)
  if (!('entries' in log)) throw new Error('durable log unavailable')
  return log.entries
}

/** Builds and appends a MS8 ACK record for `callId` from the durable marker entries. */
async function appendAck(
  host: Host,
  callId: string,
  over: Record<string, unknown> = {},
): Promise<void> {
  const own = (await readEntries(host)).filter(entry => {
    try {
      return payload(entry).call === callId
    } catch {
      return false
    }
  })
  const createdEntry = own.find(entry => payload(entry).kind === 'model_call_created')
  const readyEntry = own.find(entry => payload(entry).kind === 'model_call_reply_ready')
  if (createdEntry === undefined) throw new Error('created marker missing')
  const dispatched = own.find(entry => payload(entry).kind === 'model_call_dispatched')
  const responseId =
    dispatched === undefined ? undefined : (payload(dispatched).response as string | undefined)
  const captured = captureModelLogValue({
    category: 'record',
    input: {
      kind: 'value',
      value: {
        kind: 'model_call_acknowledged',
        call: callId,
        creationKey: payload(createdEntry).creationKey,
        creationInput: { role: 'model-call-creation-semantic-sha256/v1', hex: 'a'.repeat(64) },
        acknowledgedAt: '2026-09-30T00:00:00Z',
        releasablePayloads: [
          payload(createdEntry).payload,
          ...(readyEntry === undefined ? [] : [payload(readyEntry).payload]),
        ],
        target: { kind: 'response', response: responseId },
        terminalState: 'complete',
        ...over,
      },
    },
  })
  if (!('ok' in captured)) throw new Error(`ack capture: ${captured.reason}`)
  const prepared = prepareModelLogEntry({
    session: host.session,
    shell: { tenant: host.tenant },
    captured: captured.ok,
    purpose: { kind: 'record' },
    messagePrefix: null,
  })
  if (!('ok' in prepared)) throw new Error(`ack prepare: ${prepared.reason}`)
  const result = await host.log.append(
    host.session,
    [prepared.ok],
    { kind: 'unfenced' },
    { kind: 'unconditional' },
  )
  if ('failure' in result) throw new Error(`ack append: ${result.failure}`)
}

function kinds(entries: readonly LogEntry[]): (string | undefined)[] {
  return entries.map(entry => {
    try {
      const value = payload(entry)
      return typeof value.kind === 'string' ? value.kind : undefined
    } catch {
      return undefined
    }
  })
}

// ---- Part 1: ACK fail-closed (Q3) ----
{
  const LEAK = 'visible' // the scripted reply text; must never come back after an ACK

  /**
   * `lawful` acknowledges through the real fifteenth operation (RT12 S-96, the original
   * creation digest); otherwise the ACK is appended directly with a forged creation digest.
   */
  async function acknowledgedCall(host: Host, built: BuiltRuntime, lawful = false) {
    const selected = await built.runtime.service.selectModel({
      session: host.session,
      routeName: 'example/model-a',
    })
    expect(selected).toEqual({ selected: 'example/model-a' })
    const { input, opened } = await openOne(host, built, 'review_create_1')
    if (!('ref' in opened)) throw new Error(`open: ${JSON.stringify(opened)}`)
    const dispatched = await built.runtime.service.dispatch(opened.ref)
    if (!('replyPending' in dispatched)) throw new Error(`dispatch: ${JSON.stringify(dispatched)}`)
    const settled = await built.runtime.service.settleReply({
      ...opened.ref,
      disposition: { vetoed: { by: 'review-gate' } },
    })
    expect(settled).toEqual({ callId: opened.callId, state: 'complete' })
    if (lawful) {
      const attempts = await built.runtime.service.readAttempts(opened.ref)
      const response =
        'dispatches' in attempts ? attempts.dispatches?.at(-1)?.record.response : undefined
      if (response === undefined) throw new Error(`attempts: ${JSON.stringify(attempts)}`)
      const acknowledged = await built.runtime.service.acknowledgeCall({
        ref: opened.ref,
        expectedResult: { kind: 'response', response },
      })
      expect(acknowledged).toMatchObject({ acknowledged: { ref: opened.ref } })
    } else await appendAck(host, opened.callId)
    return { ref: opened.ref, input }
  }

  function noLeak(name: string, result: unknown) {
    const text = JSON.stringify(result)
    expect(text, `${name} leaked the reply`).not.toContain(LEAK)
  }

  // Adopted as a regression suite. The review targeted the Task A build, where an ACK failed
  // closed on every entry; RT12 S-97/S-100 supersede that: reads answer the small acknowledged
  // branch, control and new work reach their terminal refusal, and nothing leaks, writes or sends.
  describe('review 2026-09-30 Q3: acknowledged call on every runtime entry (RT12 S-97/S-100)', () => {
    for (const cold of [false, true]) {
      it(`(${cold ? 'cold second runtime over the same log' : 'the runtime that ran the call'}) every entry answers the acknowledged branch or its terminal refusal, appends nothing and sends nothing`, async () => {
        const host = await selectionHost(true, true)
        try {
          const first = buildRuntime(host)
          const { ref, input } = await acknowledgedCall(host, first, true)
          const built = cold ? buildRuntime(host, { callPrefix: 'cold-call' }) : first
          const wire = first.wire
          const sendsBefore = wire.sends()
          const before = kinds(await readEntries(host))
          const service = built.runtime.service
          const plan = { provider: 'test' } as never
          const results: Record<string, unknown> = {
            acquireRead: await service.acquireCall({ ref, mode: 'read' }),
            acquireWait: await service.acquireCall({ ref, mode: 'wait' }),
            readAttempts: await service.readAttempts(ref),
            readAttemptsConsume: await service.readAttempts(ref, { consumeFailure: true }),
            canDispatchAgain: await service.canDispatchAgain({ ...ref, plan }),
            dispatch: await service.dispatch(ref),
            dispatchConsume: await service.dispatch(ref, { consumeFailure: true }),
            dispatchAgain: await service.dispatchAgain({ ...ref, plan }),
            interruptUser: await service.interrupt({ ...ref, initiator: 'user' }),
            interruptRun: await service.interrupt({ ...ref, initiator: 'run_cancelled' }),
            releaseCall: await service.releaseCall(ref),
            settleVeto: await service.settleReply({
              ...ref,
              disposition: { vetoed: { by: 'review-gate' } },
            }),
            settleOther: await service.settleReply({
              ...ref,
              disposition: { consumed: { by: 'compaction' } },
            }),
            reconcile: await service.reconcile({ session: host.session }),
            // Same creation key and input: a lawful replay must not be answered from a fresh
            // creation, a re-dispatch or a payload the ACK allows to be released.
            openSameCreation: await service.openCall(input),
            openSameCreationSameCall: await service.openCall({ ...input, callId: ref.callId }),
          }
          for (const [name, result] of Object.entries(results)) noLeak(name, result)
          // No entry may act on the phase: nothing new is written or sent.
          expect(wire.sends()).toBe(sendsBefore)
          const after = kinds(await readEntries(host))
          expect(after, 'log entries after fail-closed calls').toEqual(before)
          // Reads answer only the S-97 small branch, never a retained view or content.
          const small = {
            ref,
            acknowledged: { ref, cleanup: 'released' },
            terminalState: 'complete',
          }
          for (const name of ['acquireRead', 'acquireWait']) {
            expect(results[name], name).toMatchObject({ view: small })
            for (const forbidden of ['state', 'presence', 'result'])
              expect((results[name] as { view: object }).view, name).not.toHaveProperty(forbidden)
            expect(results[name], name).not.toHaveProperty('consumer')
          }
          expect(results.readAttempts).toMatchObject({ acknowledged: small })
          expect(results.readAttempts).not.toHaveProperty('dispatches')
          expect(results.readAttemptsConsume).toMatchObject({
            result: { acknowledged: small },
            consumption: { kind: 'notApplicable' },
          })
          // Control and new work see the ACK's real terminal state (S-100).
          for (const name of [
            'canDispatchAgain',
            'dispatch',
            'dispatchAgain',
            'interruptUser',
            'interruptRun',
            'releaseCall',
            'settleOther',
          ])
            expect(results[name], name).toEqual({ alreadyEnded: true })
          expect(results.dispatchConsume).toEqual({
            result: { alreadyEnded: true },
            consumption: { kind: 'notApplicable' },
          })
          // S-99: the durable final decides; the same disposition is recognized, not rewritten.
          expect(results.settleVeto).toEqual({ callId: ref.callId, state: 'complete' })
          // S-101: the same creation is recognized by its digest into the small branch; it is
          // never answered from a fresh creation, a re-dispatch or a released payload.
          expect(results.openSameCreation).toMatchObject({
            ref,
            callId: ref.callId,
            acknowledged: small,
          })
          expect(results.openSameCreation).not.toHaveProperty('state')
          // An explicit callId asks to resume a resumable call; this one is terminal.
          expect(results.openSameCreationSameCall).toEqual({ wrongPhase: { phase: 'complete' } })
          // reconcile of the session is a recovery entry: its result may be anything but must not
          // have written or sent (checked above) and must not mention the reply. (This harness
          // has no recovery association, so it is unavailable here even before any ACK.)
          await built.runtime.close()
          if (cold) await first.runtime.close()
        } finally {
          await host.close()
        }
      }, 60_000)
    }

    it('a refused same-creationKey openCall (acknowledged or not) leaks no lease, writes no marker and does not poison another call', async () => {
      const host = await selectionHost(true, true)
      try {
        const built = buildRuntime(host)
        const { ref, input } = await acknowledgedCall(host, built)
        const leasesBefore = built.acquired() - built.released()
        const before = kinds(await readEntries(host))
        // The forged ACK digest differs from the original creation: S-101 creationConflict.
        const sameKey = await built.runtime.service.openCall(input)
        expect(sameKey).toEqual({ creationConflict: true })
        const sameKeyAndCall = await built.runtime.service.openCall({
          ...input,
          callId: ref.callId,
        })
        expect(sameKeyAndCall).toEqual({ wrongPhase: { phase: 'complete' } })
        // The refused attempts must not keep the lease they acquired for planning.
        expect(built.acquired() - built.released()).toBe(leasesBefore)
        expect(kinds(await readEntries(host))).toEqual(before)
        // A different creation key in the same session is unaffected by the acknowledged call:
        // it opens and its durable view is readable (dispatching a second call in this host
        // fails even without any ACK, so open/read is the honest control).
        const second = await openOne(host, built, 'review_create_2')
        if (!('ref' in second.opened))
          throw new Error(`second open: ${JSON.stringify(second.opened)}`)
        const view = await built.runtime.service.acquireCall({
          ref: second.opened.ref,
          mode: 'read',
        })
        expect(view).toMatchObject({ view: { state: 'open' } })
        // The forged ACK contradicts the still retained original (N-4, RT12 S-98/S-101): it is
        // no lawful ACK, so the read fails instead of answering small, and discloses nothing.
        const acknowledged = await built.runtime.service.acquireCall({ ref, mode: 'read' })
        expect(acknowledged).toEqual({ unavailable: true })
        expect(await built.runtime.close()).toEqual({ released: true })
        expect(built.acquired()).toBe(built.released())
      } finally {
        await host.close()
      }
    }, 60_000)

    it('S-85: an unacknowledged same-creationKey call recognizes its original reference without new work', async () => {
      const host = await selectionHost(true, true)
      try {
        const built = buildRuntime(host)
        await built.runtime.service.selectModel({
          session: host.session,
          routeName: 'example/model-a',
        })
        const first = await openOne(host, built, 'review_create_ctl')
        if (!('ref' in first.opened)) throw new Error('open')
        const before = await readEntries(host)
        const leasesBefore = built.acquired() - built.released()
        const sendsBefore = built.wire.sends()
        const again = await built.runtime.service.openCall(first.input)
        expect(again).toEqual({
          ref: first.opened.ref,
          callId: first.opened.ref.callId,
          state: 'open',
        })
        expect(await readEntries(host)).toEqual(before)
        expect(built.acquired() - built.released()).toBe(leasesBefore)
        expect(built.wire.sends()).toBe(sendsBefore)
        await built.runtime.close()
      } finally {
        await host.close()
      }
    }, 60_000)

    it('a live wait consumer acquired before completion stops reading after the ACK', async () => {
      const host = await selectionHost(true, true)
      try {
        let release: (() => void) | undefined
        const gate = new Promise<void>(resolve => {
          release = resolve
        })
        const wire = transport({ afterContent: async () => await gate })
        const built = buildRuntime(host, { wire })
        await built.runtime.service.selectModel({
          session: host.session,
          routeName: 'example/model-a',
        })
        const { opened } = await openOne(host, built, 'review_create_wait')
        if (!('ref' in opened)) throw new Error('open')
        const dispatching = built.runtime.service.dispatch(opened.ref)
        // wait until the call is speaking (content has started)
        for (let index = 0; index < 200; index++) {
          const view = await built.runtime.service.acquireCall({ ref: opened.ref, mode: 'read' })
          if ('view' in view && view.view.state === 'speaking') break
          await new Promise(resolve => setTimeout(resolve, 10))
        }
        const acquired = await built.runtime.service.acquireCall({ ref: opened.ref, mode: 'wait' })
        if (!('view' in acquired) || acquired.consumer === undefined)
          throw new Error(`no live consumer: ${JSON.stringify(acquired)}`)
        const consumer = acquired.consumer
        release?.()
        const dispatched = await dispatching
        if (!('replyPending' in dispatched)) throw new Error('dispatch')
        expect(
          await built.runtime.service.settleReply({
            ...opened.ref,
            disposition: { vetoed: { by: 'review-gate' } },
          }),
        ).toMatchObject({ state: 'complete' })
        await appendAck(host, opened.callId)
        const waited = await consumer.wait({})
        noLeak('wait after ack', waited)
        expect(waited).not.toHaveProperty('view.result')
        consumer.release()
        await consumer.stopped
        await built.runtime.close()
      } finally {
        await host.close()
      }
    }, 60_000)
  })
}

// ---- Part 2: unknown ownership / close / S-86 (Q4, Q5) ----
{
  const rejections: unknown[] = []
  process.on('unhandledRejection', reason => {
    rejections.push(reason)
  })
  afterAll(() => {
    expect(rejections).toEqual([])
  })
  const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

  interface Mode {
    response: 'normal' | 'committed' | 'absent'
    read: 'ok' | 'fail'
  }
  function isFinalBatch(entries: readonly unknown[]): boolean {
    return entries.some(entry => {
      const p = (entry as { payload?: { category?: string } }).payload
      return p?.category === 'response'
    })
  }
  function lossyBind(mode: Mode, seen: string[]) {
    return (binding: BuiltRuntime['binding']['log']): BuiltRuntime['binding']['log'] => {
      const real = binding.log
      const log: SessionLog = {
        async append(s, entries, fence, condition) {
          if (!isFinalBatch(entries) || mode.response === 'normal')
            return await real.append(s, entries, fence, condition)
          seen.push(pickJson(entries))
          if (mode.response === 'absent') return { failure: 'unavailable' } as AppendResult
          await real.append(s, entries, fence, condition)
          return { failure: 'unavailable' } as AppendResult
        },
        async readSince(...args) {
          if (mode.read === 'fail') return { failure: 'unavailable' }
          return await real.readSince(...args)
        },
        async readByKey(...args) {
          return await real.readByKey(...args)
        },
      }
      return { ...binding, log }
    }
  }
  function pickJson(entries: readonly unknown[]): string {
    return writeJsonLossless(
      entries.map(entry => {
        const e = entry as {
          tenant: unknown
          run?: unknown
          attempt?: unknown
          dedupeKey?: unknown
          readKeys: unknown
          payload: unknown
        }
        return {
          tenant: e.tenant,
          run: e.run ?? null,
          attempt: e.attempt ?? null,
          dedupeKey: e.dedupeKey ?? null,
          readKeys: e.readKeys,
          payload: e.payload,
        }
      }) as never,
    )
  }
  const finals = (entries: readonly LogEntry[]) =>
    entries.filter(entry => {
      try {
        return (entry.payload as { category?: string }).category === 'response'
      } catch {
        return false
      }
    })
  const vetoed = { vetoed: { by: 'review-gate' } } as const
  const consumed = { consumed: { by: 'compaction' } } as const

  async function replyPendingCall(host: Host, built: BuiltRuntime, key: string) {
    await built.runtime.service.selectModel({ session: host.session, routeName: 'example/model-a' })
    const { opened } = await openOne(host, built, key)
    if (!('ref' in opened)) throw new Error(`open: ${JSON.stringify(opened)}`)
    const dispatched = await built.runtime.service.dispatch(opened.ref)
    if (!('replyPending' in dispatched)) throw new Error(`dispatch: ${JSON.stringify(dispatched)}`)
    return opened.ref
  }

  describe('review 2026-09-30 Q4 warm runtime: unknown final-batch ownership on the original handle', () => {
    it('(a) receipt lost, batch committed: the repeat recognizes it, one physical submission, close releases', async () => {
      const host = await selectionHost(true, true)
      try {
        const mode: Mode = { response: 'normal', read: 'ok' }
        const seen: string[] = []
        const built = buildRuntime(host, { bindLog: lossyBind(mode, seen) })
        const ref = await replyPendingCall(host, built, 'rv_a')
        mode.response = 'committed'
        expect(await built.runtime.service.settleReply({ ...ref, disposition: vetoed })).toEqual({
          unavailable: true,
        })
        expect(built.selected.owner.active).toBeGreaterThan(0) // the unknown original is still owned
        expect(await built.runtime.service.settleReply({ ...ref, disposition: vetoed })).toEqual({
          callId: ref.callId,
          state: 'complete',
        })
        expect(seen).toHaveLength(1)
        expect(finals(await readEntries(host))).toHaveLength(1)
        expect(await built.runtime.close()).toEqual({ released: true })
        expect(built.selected.owner.active).toBe(0)
        expect(finals(await readEntries(host))).toHaveLength(1)
      } finally {
        await host.close()
      }
    }, 60_000)

    it('(b) actually absent: repeat resolves and releases with unavailable, then the same original batch is resent byte-identically', async () => {
      const host = await selectionHost(true, true)
      try {
        const mode: Mode = { response: 'normal', read: 'ok' }
        const seen: string[] = []
        const built = buildRuntime(host, { bindLog: lossyBind(mode, seen) })
        const ref = await replyPendingCall(host, built, 'rv_b')
        mode.response = 'absent'
        expect(await built.runtime.service.settleReply({ ...ref, disposition: vetoed })).toEqual({
          unavailable: true,
        })
        expect(seen).toHaveLength(1)
        // proof of absence, nothing written
        expect(await built.runtime.service.settleReply({ ...ref, disposition: vetoed })).toEqual({
          unavailable: true,
        })
        expect(seen).toHaveLength(1)
        expect(finals(await readEntries(host))).toHaveLength(0)
        mode.response = 'normal'
        const result = await built.runtime.service.settleReply({ ...ref, disposition: vetoed })
        expect(result).toEqual({ callId: ref.callId, state: 'complete' })
        const written = finals(await readEntries(host))
        expect(written).toHaveLength(1)
        // byte identical to the batch the first attempt submitted (noRun, same original request)
        expect(pickJson(written)).toBe(seen[0])
        expect(await built.runtime.close()).toEqual({ released: true })
      } finally {
        await host.close()
      }
    }, 60_000)

    it('(b-close) absent then close: resolution writes nothing and frees the registration; a later write is only the original disposition', async () => {
      const host = await selectionHost(true, true)
      try {
        const mode: Mode = { response: 'normal', read: 'ok' }
        const seen: string[] = []
        const built = buildRuntime(host, { bindLog: lossyBind(mode, seen) })
        const ref = await replyPendingCall(host, built, 'rv_bc')
        mode.response = 'absent'
        await built.runtime.service.settleReply({ ...ref, disposition: vetoed })
        expect(seen).toHaveLength(1)
        await built.runtime.close()
        // resolution by full prefix proves absence, writes nothing and releases the registration
        expect(finals(await readEntries(host))).toHaveLength(0)
        expect(seen).toHaveLength(1)
        expect(built.selected.owner.active).toBe(0)
        mode.response = 'normal'
        await built.runtime.close()
        // Whatever a later close writes must be the original vetoed disposition, never a
        // substitute; whether close needs to write at all is S-86's business (see Part 2 / Q5).
        for (const entry of finals(await readEntries(host))) {
          const value = (entry.payload as { value: { replyDisposition: unknown } }).value
          expect(JSON.stringify(value.replyDisposition)).toContain('review-gate')
        }
        expect(seen.length).toBeGreaterThanOrEqual(1)
      } finally {
        await host.close()
      }
    }, 60_000)

    it('(c) unreadable prefix: nothing is released as absent, close reports unavailable, a later close succeeds', async () => {
      const host = await selectionHost(true, true)
      try {
        const mode: Mode = { response: 'normal', read: 'ok' }
        const seen: string[] = []
        const built = buildRuntime(host, { bindLog: lossyBind(mode, seen) })
        const ref = await replyPendingCall(host, built, 'rv_c')
        mode.response = 'committed'
        await built.runtime.service.settleReply({ ...ref, disposition: vetoed })
        mode.read = 'fail'
        expect(await built.runtime.service.settleReply({ ...ref, disposition: vetoed })).toEqual({
          unavailable: true,
        })
        const first = await built.runtime.close()
        expect(first).toEqual({ unavailable: true })
        expect(built.selected.owner.active).toBeGreaterThan(0)
        expect(seen).toHaveLength(1)
        mode.read = 'ok'
        expect(await built.runtime.close()).toEqual({ released: true })
        expect(built.selected.owner.active).toBe(0)
        expect(seen).toHaveLength(1)
        expect(finals(await readEntries(host))).toHaveLength(1)
      } finally {
        await host.close()
      }
    }, 60_000)

    it('(d) late stop of the unknown writer: runtime.close cannot report released before that writer stopped', async () => {
      const host = await selectionHost(true, true)
      try {
        const mode: Mode = { response: 'normal', read: 'ok' }
        const seen: string[] = []
        const built = buildRuntime(host, { bindLog: lossyBind(mode, seen) })
        const ref = await replyPendingCall(host, built, 'rv_d')
        const barrier = deferred<void>()
        mode.response = 'committed'
        built.selected.owner.stopBarrier = barrier.promise
        let settled = false
        const settling = built.runtime.service
          .settleReply({ ...ref, disposition: vetoed })
          .then(r => {
            settled = true
            return r
          })
        await delay(100)
        let closed: unknown
        const closing = built.runtime.close().then(r => {
          closed = r
          return r
        })
        await delay(150)
        expect(settled).toBe(false)
        expect(closed).toBeUndefined()
        barrier.resolve()
        expect(await settling).toEqual({ unavailable: true })
        const result = await closing
        // committed original: close resolves it from the prefix and may release; an unavailable
        // answer is acceptable, a release without one durable final is not.
        if ('released' in result) expect(finals(await readEntries(host))).toHaveLength(1)
        expect(seen).toHaveLength(1)
      } finally {
        await host.close()
      }
    }, 60_000)

    it('(e) a rejected stop: settleReply returns, close never hangs, no unhandled rejection, no false release', async () => {
      const host = await selectionHost(true, true)
      try {
        const mode: Mode = { response: 'normal', read: 'ok' }
        const seen: string[] = []
        const built = buildRuntime(host, { bindLog: lossyBind(mode, seen) })
        const ref = await replyPendingCall(host, built, 'rv_e')
        const owner: ControlledSettlementOwner = built.selected.owner
        const acquire = owner.acquire
        let armed = false
        Object.defineProperty(owner, 'acquire', {
          value: (limit: Parameters<typeof acquire>[0]) => {
            const granted = acquire(limit)
            if (!('registration' in granted)) return granted
            const inner = granted.registration
            const registration: SettlementRegistration = {
              start: <T>(kind: SettlementTaskKind, op: (signal: AbortSignal) => Promise<T>) => {
                const task: SettlementTask<T> = inner.start(kind, op)
                if (kind !== 'append' || !armed) return task
                return {
                  completion: task.completion,
                  requestStop: task.requestStop,
                  stopped: task.stopped.then(() => {
                    throw new Error('stop could not be proven')
                  }),
                }
              },
              release: inner.release,
            }
            return { registration }
          },
        })
        armed = true
        mode.response = 'committed'
        const outcome = await Promise.race([
          built.runtime.service.settleReply({ ...ref, disposition: vetoed }),
          delay(4000).then(() => 'hung' as const),
        ])
        expect(outcome).toEqual({ unavailable: true })
        const closing = await Promise.race([
          built.runtime.close(),
          delay(4000).then(() => 'hung' as const),
        ])
        expect(closing).toEqual({ unavailable: true })
        expect(built.selected.owner.active).toBeGreaterThan(0)
        await delay(50)
      } finally {
        await host.close().catch(() => undefined)
      }
    }, 60_000)

    it('(g) a repeat with another disposition after a lost receipt is alreadyEnded and the original disposition is the one durable', async () => {
      const host = await selectionHost(true, true)
      try {
        const mode: Mode = { response: 'normal', read: 'ok' }
        const seen: string[] = []
        const built = buildRuntime(host, { bindLog: lossyBind(mode, seen) })
        const ref = await replyPendingCall(host, built, 'rv_g')
        mode.response = 'committed'
        expect(await built.runtime.service.settleReply({ ...ref, disposition: vetoed })).toEqual({
          unavailable: true,
        })
        expect(await built.runtime.service.settleReply({ ...ref, disposition: consumed })).toEqual({
          alreadyEnded: true,
        })
        expect(seen).toHaveLength(1)
        const written = finals(await readEntries(host))
        expect(written).toHaveLength(1)
        expect(JSON.stringify(payloadOf(written[0]))).toContain('review-gate')
        expect(await built.runtime.close()).toEqual({ released: true })
      } finally {
        await host.close()
      }
    }, 60_000)
  })

  describe('review 2026-09-30 Q4(h)/Q5 cold durable-ready settle and the previous review counterexamples', () => {
    it('cold settle (second runtime, no container): unknown receipt keeps the coordinator, repeat recognizes, one submission', async () => {
      const host = await selectionHost(true, true)
      try {
        const warm = buildRuntime(host)
        const ref = await replyPendingCall(host, warm, 'rv_cold')
        const mode: Mode = { response: 'committed', read: 'ok' }
        const seen: string[] = []
        const cold = buildRuntime(host, { callPrefix: 'cold', bindLog: lossyBind(mode, seen) })
        // no container in the cold runtime: durable ready is read and settled by the runtime entry
        expect(await cold.runtime.service.settleReply({ ...ref, disposition: vetoed })).toEqual({
          unavailable: true,
        })
        expect(seen).toHaveLength(1)
        expect(cold.selected.owner.active).toBeGreaterThan(0)
        expect(await cold.runtime.service.settleReply({ ...ref, disposition: vetoed })).toEqual({
          callId: ref.callId,
          state: 'complete',
        })
        expect(seen).toHaveLength(1)
        expect(finals(await readEntries(host))).toHaveLength(1)
        expect(await cold.runtime.close()).toEqual({ released: true })
        expect(cold.selected.owner.active).toBe(0)
        await warm.runtime.close()
      } finally {
        await host.close()
      }
    }, 60_000)

    it('cold settle: absent unknown then close resolves without writing; the retry resends the same batch', async () => {
      const host = await selectionHost(true, true)
      try {
        const warm = buildRuntime(host)
        const ref = await replyPendingCall(host, warm, 'rv_cold2')
        const mode: Mode = { response: 'absent', read: 'ok' }
        const seen: string[] = []
        const cold = buildRuntime(host, { callPrefix: 'cold', bindLog: lossyBind(mode, seen) })
        expect(await cold.runtime.service.settleReply({ ...ref, disposition: vetoed })).toEqual({
          unavailable: true,
        })
        // runtime close actively resolves the retained original: absent, released, no write
        const closeResult = await cold.runtime.close()
        expect(finals(await readEntries(host))).toHaveLength(0)
        expect(seen).toHaveLength(1)
        // whichever way close answered, the owner accounting must not lie
        if ('released' in closeResult) expect(cold.selected.owner.active).toBe(0)
        await warm.runtime.close()
      } finally {
        await host.close()
      }
    }, 60_000)

    it('previous review: runtime.close never says released while an unknown original is unresolved (unreadable log)', async () => {
      const host = await selectionHost(true, true)
      try {
        const warm = buildRuntime(host)
        const ref = await replyPendingCall(host, warm, 'rv_lie')
        const mode: Mode = { response: 'committed', read: 'ok' }
        const cold = buildRuntime(host, { callPrefix: 'cold', bindLog: lossyBind(mode, []) })
        await cold.runtime.service.settleReply({ ...ref, disposition: vetoed })
        mode.read = 'fail'
        const first = await cold.runtime.close()
        expect(first).toEqual({ unavailable: true })
        expect(cold.selected.owner.active).toBeGreaterThan(0)
        mode.read = 'ok'
        expect(await cold.runtime.close()).toEqual({ released: true })
        expect(cold.selected.owner.active).toBe(0)
        await warm.runtime.close()
      } finally {
        await host.close()
      }
    }, 60_000)

    function stopOnRequest(owner: ControlledSettlementOwner) {
      const acquire = owner.acquire
      Object.defineProperty(owner, 'acquire', {
        value: (limit: Parameters<typeof acquire>[0]) => {
          const granted = acquire(limit)
          if (!('registration' in granted)) return granted
          const inner = granted.registration
          const registration: SettlementRegistration = {
            start: <T>(kind: SettlementTaskKind, op: (signal: AbortSignal) => Promise<T>) => {
              const task: SettlementTask<T> = inner.start(kind, op)
              const requested = deferred<void>()
              return {
                completion: task.completion,
                requestStop: () => {
                  requested.resolve()
                  task.requestStop()
                },
                stopped: Promise.all([task.stopped, requested.promise]).then(() => undefined),
              }
            },
            release: inner.release,
          }
          return { registration }
        },
      })
    }

    it('previous review: the settlement paths over a writer that only stops after requestStop neither cycle nor hang', async () => {
      const host = await selectionHost(true, true)
      try {
        const mode: Mode = { response: 'normal', read: 'ok' }
        const built = buildRuntime(host, { bindLog: lossyBind(mode, []) })
        const ref = await replyPendingCall(host, built, 'rv_stop_request')
        stopOnRequest(built.selected.owner)
        mode.response = 'committed'
        const first = await Promise.race([
          built.runtime.service.settleReply({ ...ref, disposition: vetoed }),
          delay(4000).then(() => 'hung' as const),
        ])
        expect(first).toEqual({ unavailable: true })
        const second = await Promise.race([
          built.runtime.service.settleReply({ ...ref, disposition: vetoed }),
          delay(4000).then(() => 'hung' as const),
        ])
        expect(second).toEqual({ callId: ref.callId, state: 'complete' })
      } finally {
        await host.close().catch(() => undefined)
      }
    }, 60_000)

    it.each(['readAttempts', 'canDispatchAgain', 'close'] as const)(
      'previous review (same class, other path): %s over a read that only stops after requestStop does not wait for itself',
      async name => {
        const host = await selectionHost(true, true)
        try {
          const built = buildRuntime(host)
          const ref = await replyPendingCall(host, built, `rv_stop_request_${name}`)
          stopOnRequest(built.selected.owner)
          const service = built.runtime.service
          const run: Record<typeof name, () => Promise<unknown>> = {
            readAttempts: () => service.readAttempts(ref),
            canDispatchAgain: () =>
              service.canDispatchAgain({ ...ref, plan: { provider: 'test' } as never }),
            close: () => built.runtime.close(),
          }
          const outcome = await Promise.race([
            run[name]().then(() => 'returned' as const),
            delay(3000).then(() => 'hung' as const),
          ])
          expect(outcome).toBe('returned')
        } finally {
          await host.close().catch(() => undefined)
        }
      },
      60_000,
    )

    it('previous review: completion succeeds while the writer is slow to stop, and stopped is neither a wait cycle nor lost', async () => {
      // A successful committed final whose writer stops late: settleReply must return after the
      // stop, close must be released, and nothing must depend on somebody calling stop first.
      const host = await selectionHost(true, true)
      try {
        const mode: Mode = { response: 'normal', read: 'ok' }
        const built = buildRuntime(host, { bindLog: lossyBind(mode, []) })
        const ref = await replyPendingCall(host, built, 'rv_slowstop')
        const barrier = deferred<void>()
        built.selected.owner.stopBarrier = barrier.promise
        let done = false
        const settling = built.runtime.service
          .settleReply({ ...ref, disposition: vetoed })
          .then(r => {
            done = true
            return r
          })
        await delay(150)
        expect(done).toBe(false) // waits for the actual stop
        barrier.resolve()
        expect(await Promise.race([settling, delay(3000).then(() => 'hung')])).toEqual({
          callId: ref.callId,
          state: 'complete',
        })
        expect(await built.runtime.close()).toEqual({ released: true })
      } finally {
        await host.close()
      }
    }, 60_000)
  })

  describe('review 2026-09-30 Q5 durable ready projection vs RT11 S-86 (regression from d0207795)', () => {
    it('S-86: once the ready marker is committed, runtime.close releases without needing any final (owner.close never cancels or changes ready)', async () => {
      const host = await selectionHost(true, true)
      try {
        const built = buildRuntime(host)
        await replyPendingCall(host, built, 'rv_s86_close')
        const closed = await built.runtime.close()
        // 1c365791 (before d0207795) releases here; HEAD reports unavailable forever.
        expect(closed).toEqual({ released: true })
        expect(finals(await readEntries(host))).toHaveLength(0)
      } finally {
        await host.close().catch(() => undefined)
      }
    }, 60_000)

    it('S-86: a lost final receipt proven absent does not make the runtime unclosable', async () => {
      const host = await selectionHost(true, true)
      try {
        const mode: Mode = { response: 'normal', read: 'ok' }
        const built = buildRuntime(host, { bindLog: lossyBind(mode, []) })
        const ref = await replyPendingCall(host, built, 'rv_s86_absent')
        mode.response = 'absent'
        await built.runtime.service.settleReply({ ...ref, disposition: vetoed })
        await built.runtime.close() // resolves the retained original (absent)
        mode.response = 'normal'
        expect(await built.runtime.close()).toEqual({ released: true })
        expect(built.selected.owner.active).toBe(0)
      } finally {
        await host.close().catch(() => undefined)
      }
    }, 60_000)

    it('S-86: the durable ready is complete/interrupted with disposition_pending on every read face, not reply_pending', async () => {
      const host = await selectionHost(true, true)
      try {
        const built = buildRuntime(host)
        const ref = await replyPendingCall(host, built, 'rv_s86_state')
        const acquired = await built.runtime.service.acquireCall({ ref, mode: 'read' })
        if (!('view' in acquired)) throw new Error('acquire')
        expect(acquired.view.state).toBe('complete')
        const attempts = await built.runtime.service.readAttempts(ref)
        // the two read faces of the same durable fact must agree (S-86: ready => complete)
        expect(attempts).toMatchObject({ state: 'complete' })
        await built.runtime.close().catch(() => undefined)
      } finally {
        await host.close().catch(() => undefined)
      }
    }, 60_000)
  })

  function payloadOf(entry: LogEntry | undefined): unknown {
    if (entry === undefined) throw new Error('entry')
    return payload(entry)
  }
  void kinds
  void makeCallHost

  describe('review 2026-09-30 Q6 observation: selectModel unknown receipt (session-selection.ts unknown set)', () => {
    it('characterization: after one unknown selection write the component refuses every later selectModel, even a healthy retry of the committed value', async () => {
      const host = await selectionHost(true, true)
      try {
        let lose = false
        const built = buildRuntime(host, {
          bindLog: binding => {
            const real = binding.log
            const log: SessionLog = {
              async append(s, entries, fence, condition) {
                const result = await real.append(s, entries, fence, condition)
                const isSelection = entries.some(entry =>
                  JSON.stringify(entry.payload).includes('model_selection_changed'),
                )
                return lose && isSelection ? ({ failure: 'unavailable' } as AppendResult) : result
              },
              readSince: (...args) => real.readSince(...args),
              readByKey: (...args) => real.readByKey(...args),
            }
            return { ...binding, log }
          },
        })
        const service = built.runtime.service
        expect(
          await service.selectModel({ session: host.session, routeName: 'example/model-a' }),
        ).toEqual({
          selected: 'example/model-a',
        })
        lose = true
        expect(
          await service.selectModel({ session: host.session, routeName: 'example/model-b' }),
        ).toEqual({
          unavailable: true,
        })
        lose = false
        // the second write really committed; readers see it ...
        const effective = await service.effectiveModel({ session: host.session })
        expect(JSON.stringify(effective)).toContain('example/model-b')
        // ... but the same component neither recognizes nor accepts another selection
        const retry = await service.selectModel({
          session: host.session,
          routeName: 'example/model-b',
        })
        const other = await service.selectModel({
          session: host.session,
          routeName: 'example/model-a',
        })
        console.log('selection-unknown-retry', JSON.stringify(retry), JSON.stringify(other))
        expect(retry).toEqual({ unavailable: true })
        expect(other).toEqual({ unavailable: true })
        expect(await built.runtime.close()).toBeDefined()
      } finally {
        await host.close().catch(() => undefined)
      }
    }, 60_000)
  })
}
