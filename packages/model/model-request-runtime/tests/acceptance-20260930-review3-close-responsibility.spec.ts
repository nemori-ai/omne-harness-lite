/**
 * Independent acceptance 2026-09-30, T29 round 3 residue: what `runtime.close` may and may not
 * do with an in-flight original invocation (verification A22-V16′ B-2, A22-V6; RT12 S-86).
 *
 * Two calls meet the same close path and must be told apart by the durable facts:
 *
 * - **A formed complete reply whose ready never landed** (`reply_pending` locally, nothing
 *   durable beyond the opened anchor). Closing it must not manufacture a final that contradicts
 *   the reply this process already holds: close answers `unavailable` and keeps the
 *   responsibility for a later recovery. A close that fabricates `interrupted` (P1) or one that
 *   finishes as ready without a durable ready (mutation B2c) are both counterexamples.
 * - **A real in-flight caller stopped by its host after the opened anchor was confirmed** and
 *   before any content was accepted. Its writer evidence is complete (the anchor receipt is
 *   known, the stream was stopped by this process), so S-86 closes it with the no-reply final;
 *   it must not be isolated forever with a close that can never answer (demo gap E).
 *
 * Real assembly: SQLite Storage, JSONL SessionLog and the Cordis host of
 * tests/session-selection-fixture.ts. Only what the runtime *sees* is disturbed (one append
 * receipt, the moment of a host stop); every verdict is read back from the durable log or a
 * cold process, never from the runtime's own report alone.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type { LogEntry, SessionLog } from '@omne-harness-lite/session-log-jsonl'
import type { JsonObject } from '@omne-harness-lite/content-blocks'
import { createCallContainerStore } from '../src/service-container.ts'
import { createModelRuntime } from '../src/service-runtime.ts'
import { interpretCallHistory } from '../src/call-history.ts'
import { createModelCallContentStore } from '../src/reference-content.ts'
import { createModelCallFacts } from '../src/reference-facts.ts'
import type { CallAccess, CallPresence } from '../src/reference-types.ts'
import type {
  ModelCallHost,
  RuntimeConstruction,
  SessionRuntimeBinding,
} from '../src/service-types.ts'
import type {
  SettlementOwner,
  SettlementRegistration,
  SettlementTask,
  SettlementTaskKind,
} from '../src/settlement-types.ts'
import { policy as invocationPolicy } from './invoke-policy-fixture.ts'
import {
  ControlledSettlementOwner,
  noWaitScheduler,
  policy as settlementPolicy,
} from './settlement-fixture.ts'
import { payload, transport, type TestPlan } from './anchored-invocation-fixture.ts'
import { selectionHost } from './session-selection-fixture.ts'

const rejections: unknown[] = []
process.on('unhandledRejection', reason => rejections.push(reason))
afterAll(() => expect(rejections).toEqual([]))

const messageId = unwrap(parseOpaqueIdentifier('rv3-close-message', 'MessageId'))
const creationKey = (value: string) => unwrap(parseOpaqueIdentifier(value, 'CreationKey'))

const within = <T>(ms: number, promise: Promise<T>, what: string): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${what}: hung ${ms}ms`)), ms)),
  ])

function kindOf(entry: LogEntry): unknown {
  try {
    return payload(entry).kind
  } catch {
    return undefined
  }
}

/** Entries of one call: records name it as `call`, responses nest it as `call.callId`. */
function ofCall(callId: string): (entry: LogEntry) => boolean {
  return entry => {
    let value: JsonObject
    try {
      value = payload(entry)
    } catch {
      return false
    }
    const nested = value.call
    return (
      value.call === callId ||
      (typeof nested === 'object' &&
        nested !== null &&
        'callId' in nested &&
        nested.callId === callId)
    )
  }
}

interface StartedTask {
  readonly kind: SettlementTaskKind
  readonly completion: Promise<unknown>
}
/** The fixture owner, additionally exposing every task started through it (measurement only). */
function observedOwner(inner: ControlledSettlementOwner): {
  readonly owner: SettlementOwner
  readonly started: StartedTask[]
} {
  const started: StartedTask[] = []
  const owner: SettlementOwner = {
    name: inner.name,
    admission: inner.admission,
    opened: inner.opened,
    unresolvedWrites: inner.unresolvedWrites,
    acquire: limit => {
      const acquired = inner.acquire(limit)
      if ('unavailable' in acquired) return acquired
      const real: SettlementRegistration = acquired.registration
      const registration: SettlementRegistration = {
        start: <T>(
          kind: SettlementTaskKind,
          operation: (signal: AbortSignal) => Promise<T>,
        ): SettlementTask<T> => {
          const task = real.start(kind, operation)
          started.push({ kind, completion: task.completion })
          return task
        },
        release: real.release,
      }
      return { registration }
    },
  }
  return { owner, started }
}

type Host = Awaited<ReturnType<typeof selectionHost>>

async function entriesOf(host: Host, callId: string): Promise<JsonObject[]> {
  const log = await host.log.readSince(host.session, 0)
  if (!('entries' in log)) throw new Error('durable log unavailable')
  return log.entries.filter(ofCall(callId)).map(entry => payload(entry))
}
const finalsOf = (entries: readonly JsonObject[]) =>
  entries.filter(value => typeof value.outcome === 'string')

/** One production runtime over the real host; only the session-log append may be wrapped. */
async function runtimeOver(
  host: Host,
  options: {
    readonly prefix: string
    readonly owner?: SettlementOwner
    readonly wire?: ReturnType<typeof transport>
    readonly append?: (real: SessionLog['append']) => SessionLog['append']
  },
) {
  const selected = host.create(options.owner === undefined ? {} : { owner: options.owner })
  const realLog = selected.input.binding.log
  const logBinding =
    options.append === undefined
      ? selected.input.binding
      : {
          ...selected.input.binding,
          log: {
            append: options.append((...args) => realLog.append(...args)),
            readSince: (...args: Parameters<SessionLog['readSince']>) => realLog.readSince(...args),
            readByKey: (...args: Parameters<SessionLog['readByKey']>) => realLog.readByKey(...args),
          } satisfies SessionLog,
        }
  const wire = options.wire ?? transport()
  const calls = createCallContainerStore<TestPlan, object>()
  const callPresence: CallPresence = {
    async read(input, observed) {
      const local = calls.find(input.ref)?.view()
      return {
        read: await observed(
          local === undefined
            ? {
                kind: 'stopped',
                source: input.source,
                executionGeneration: null,
                sourceVersion: 'rv3-close-log-v1',
                target: null,
                unknownBatches: [],
              }
            : {
                kind: 'live',
                source: input.source,
                executionGeneration: local.executionGeneration,
                sourceVersion: 'rv3-close-log-v1',
              },
        ),
      }
    },
  }
  const content = createModelCallContentStore({
    storage: host.storage,
    policy: { maxConcurrentWrites: 4, maxContentBytes: 1_000_000 },
  })
  const callFacts = createModelCallFacts({ content, presence: callPresence, maxScopes: 4 })
  const callAccess: CallAccess = {
    async check(input, admitted) {
      const found = await callFacts.lookup({ binding: input.binding, ref: input.ref })
      const source =
        'view' in found
          ? found.view.source
          : 'acknowledged' in found
            ? found.acknowledged.source
            : { generation: input.binding.generation, progress: 0 }
      const evidence = {
        action: input.action,
        ref: input.ref,
        source,
        sourceVersion: 'rv3-close-log-v1',
        revoked: new AbortController().signal,
      }
      return { allowed: await admitted(evidence), evidence }
    },
  }
  const binding: SessionRuntimeBinding = {
    log: logBinding,
    sourceVersions: { fixture: 'rv3-close-v1' },
    selection: { ...selected.input, binding: logBinding, projection: async () => ({ known: [] }) },
    catalog: host.catalog,
    currentEvaluationInputs: host.reader,
    credentials: {
      async value() {
        return { scope: { layer: 'factory' as const }, value: new TextEncoder().encode('s3cret') }
      },
    },
    tools: {
      async lookup() {
        throw new Error('no tools requested')
      },
    },
  }
  let nextCall = 0
  let nextResponse = 0
  const diagnostics: string[] = []
  const construction: RuntimeConstruction<TestPlan, object> = {
    callAccess,
    callPresence,
    callFacts,
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
          transport: wire.adapter,
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
      ...invocationPolicy(event => diagnostics.push(event.kind)),
      schedule: () => () => {},
    },
    identities: {
      call: () => `${options.prefix}-call-${++nextCall}`,
      response: () => `${options.prefix}-response-${++nextResponse}`,
      message: () => messageId,
    },
    history: {
      call: (prefix, callId) => interpretCallHistory({ prefix, callId }),
      calibration: () => ({ sourceUnavailable: true }),
      failure: () => ({ unavailable: true }),
      run: () => ({ unavailable: true }),
    },
    recovery: {
      enter: async () => ({
        scope: {
          binding: { log: selected.input.binding },
          owner: new ControlledSettlementOwner(),
          originalInvocation: () => ({ unavailable: true }),
          close: async () => {},
        },
      }),
    },
    diagnostic(event) {
      diagnostics.push(event.kind)
    },
  }
  const runtime = createModelRuntime(construction)
  const service = runtime.service
  let effective = await service.effectiveModel({ session: host.session })
  if (!('effectiveModel' in effective)) {
    const chosen = await service.selectModel({
      session: host.session,
      routeName: 'example/model-a',
    })
    if (!('selected' in chosen)) throw new Error(`select: ${JSON.stringify(chosen)}`)
    effective = await service.effectiveModel({ session: host.session })
  }
  if (!('effectiveModel' in effective)) throw new Error('effective model')
  const model = effective.effectiveModel
  async function open(key: string, callHost: ModelCallHost) {
    const opened = await service.openCall({
      creationKey: creationKey(key),
      session: host.session,
      target: model.routeName,
      basis: model,
      messages: [],
      tools: [],
      host: callHost,
    })
    if (!('ref' in opened)) throw new Error(`open: ${JSON.stringify(opened)}`)
    return opened.ref
  }
  return { runtime, service, calls, diagnostics, open }
}

function callHost(controller = new AbortController()): ModelCallHost {
  return {
    signal: controller.signal,
    stopping: () => false,
    register: () => ({ registration: { unregister() {} } }),
  }
}

describe('A22-V16′ B-2: runtime close over a reply whose ready never landed', () => {
  /**
   * The first ready marker never reaches the log; the runtime sees `refusal` as its receipt and
   * keeps `reply_pending` locally. Everything else (creation, dispatch, opened) is real.
   */
  async function unlandedReady(
    host: Host,
    key: string,
    refusal: { readonly failure: 'unavailable' } | { readonly failure: 'tailChanged' },
  ) {
    let refused = 0
    const rt = await runtimeOver(host, {
      prefix: key,
      append: real => async (session, entries, fence, condition) => {
        const first = entries[0] as unknown as LogEntry | undefined
        if (refused === 0 && first !== undefined && kindOf(first) === 'model_call_reply_ready') {
          refused++
          if (refusal.failure === 'unavailable') return refusal
          const read = await host.log.readSince(session, 0)
          if (!('tail' in read)) throw new Error('durable log unavailable')
          return { failure: 'tailChanged', tail: read.tail }
        }
        return await real(session, entries, fence, condition)
      },
    })
    const ref = await rt.open(`rv3_close_${key}`, callHost())
    const dispatched = await within(20_000, rt.service.dispatch(ref), 'dispatch')
    expect(dispatched).toEqual({ unavailable: true })
    expect(refused, 'exactly one ready append was refused').toBe(1)
    const before = await entriesOf(host, ref.callId)
    expect(before.map(value => value.kind)).toEqual([
      'model_call_created',
      'model_call_dispatched',
      'model_call_opened',
    ])
    expect(rt.calls.find(ref)?.view().operation.phase).toBe('reply_pending')
    return { rt, ref, before }
  }

  /** The first close answers unavailable, writes nothing and leaves the reply where it was. */
  async function firstCloseKeeps(
    host: Host,
    made: Awaited<ReturnType<typeof unlandedReady>>,
  ): Promise<void> {
    const { rt, ref, before } = made
    const closed = await within(20_000, rt.runtime.close(), 'first close')
    expect(closed, 'runtime.close over an unlanded ready').toEqual({ unavailable: true })
    // P1: the container close may not manufacture an interrupted final.
    const afterFirst = await entriesOf(host, ref.callId)
    expect(finalsOf(afterFirst), 'a final manufactured by runtime.close').toEqual([])
    expect(afterFirst.map(value => value.kind)).toEqual(before.map(value => value.kind))
    expect(rt.calls.find(ref)?.view().operation.phase, 'the responsibility stays local').toBe(
      'reply_pending',
    )
  }

  it('a ready refused outright (tailChanged): close answers unavailable and writes no final; the holder can still settle the reply as itself, after which close releases', async () => {
    const host = await selectionHost(true, true)
    try {
      const made = await unlandedReady(host, 'b2a', { failure: 'tailChanged' })
      const { rt, ref } = made
      await firstCloseKeeps(host, made)

      // B2c: the writer stopped with a definite refusal, so the stop read the complete prefix
      // and reached its durable-ready check. Had it finished the invocation as ready without a
      // durable ready, the formed reply would be gone: the retained original invocation could
      // no longer settle it. Keeping the responsibility means exactly that it still can.
      const invocation = rt.calls.find(ref)?.view().invocation
      if (invocation === undefined) throw new Error('the original invocation was detached')
      const settled = await within(20_000, invocation.settleReply('persisted'), 'settle')
      expect(settled, 'the held reply could not be settled after the failed close').toHaveProperty(
        'settled',
      )
      const finals = finalsOf(await entriesOf(host, ref.callId))
      expect(finals).toHaveLength(1)
      expect(finals[0]).toMatchObject({
        outcome: 'complete',
        replyDisposition: 'persisted',
        id: 'b2a-response-1',
      })
      expect(finals[0]).toHaveProperty('reply')

      // With the reply's own final durable, the same stop finishes as ready and releases.
      expect(await within(20_000, rt.runtime.close(), 'second close')).toEqual({ released: true })
      await host.reopen()
      const cold = await runtimeOver(host, { prefix: 'cold' })
      expect(await cold.service.acquireCall({ ref, mode: 'read' })).toMatchObject({
        view: { state: 'complete' },
      })
      expect(await cold.runtime.close()).toEqual({ released: true })
      expect(finalsOf(await entriesOf(host, ref.callId))).toHaveLength(1)
    } finally {
      await host.close()
    }
  }, 90_000)

  it('a ready whose receipt is unavailable and which never landed: close answers unavailable twice, writes no final; a cold process still sees the in-flight frontier', async () => {
    const host = await selectionHost(true, true)
    try {
      const made = await unlandedReady(host, 'b2b', { failure: 'unavailable' })
      const { rt, ref } = made
      // The unknown ready writer is retained; the stop cannot establish the outcome and the
      // container must not close the original invocation into an interrupted final (P1).
      await firstCloseKeeps(host, made)

      // A second close finds the same durable facts and answers the same way.
      expect(await within(20_000, rt.runtime.close(), 'second close')).toEqual({
        unavailable: true,
      })
      expect(finalsOf(await entriesOf(host, ref.callId))).toEqual([])

      // A cold process reads the durable frontier: the call is still speaking, not ended.
      await host.reopen()
      const cold = await runtimeOver(host, { prefix: 'cold' })
      const read = await cold.service.acquireCall({ ref, mode: 'read' })
      expect(read).toMatchObject({ view: { state: 'speaking' } })
      expect(read).not.toHaveProperty(['view', 'result'])
      expect(await cold.runtime.close()).toEqual({ released: true })
      expect(finalsOf(await entriesOf(host, ref.callId))).toEqual([])
    } finally {
      await host.close()
    }
  }, 90_000)
})

describe('RT12 S-86: a host stop after the confirmed opened anchor, before any accepted content', () => {
  it('closes the real in-flight caller with the no-reply final; dispatch and close answer, a cold process reads interrupted', async () => {
    const host = await selectionHost(true, true)
    const inner = new ControlledSettlementOwner()
    const { owner, started } = observedOwner(inner)
    const stop = new AbortController()
    let gateSettled: Promise<void> | undefined
    let stops = 0
    const rt = await runtimeOver(host, {
      prefix: 's86',
      owner,
      // The stream yields its first content and then waits until the content gate of the
      // invocation has actually ended, so the opened receipt is confirmed before the stopped
      // stream is observed (the order the race under test produces).
      wire: transport({
        afterContent: async () => {
          await within(15_000, gateSettled ?? Promise.resolve(), 'content gate')
        },
      }),
      // The opened anchor really lands; the host stops while its receipt is on the way back.
      append: real => async (session, entries, fence, condition) => {
        const first = entries[0] as unknown as LogEntry | undefined
        const landed = await real(session, entries, fence, condition)
        if (stops === 0 && first !== undefined && kindOf(first) === 'model_call_opened') {
          stops++
          if ('failure' in landed) throw new Error(`opened did not land: ${landed.failure}`)
          const gate = started.filter(task => task.kind === 'wait').at(-1)
          if (gate === undefined) throw new Error('no content gate task registered')
          gateSettled = gate.completion.then(
            () => undefined,
            () => undefined,
          )
          stop.abort()
        }
        return landed
      },
    })
    try {
      const ref = await rt.open('rv3_close_s86', callHost(stop))
      const dispatched = await within(20_000, rt.service.dispatch(ref), 'dispatch')
      expect(stops, 'the host stopped exactly once, on the opened receipt').toBe(1)
      expect(dispatched).toMatchObject({
        settled: { outcome: 'interrupted', initiator: 'run_cancelled', id: 's86-response-1' },
      })
      expect(dispatched).not.toHaveProperty(['settled', 'reply'])
      const entries = await entriesOf(host, ref.callId)
      expect(entries.map(value => value.kind)).toEqual([
        'model_call_created',
        'model_call_dispatched',
        'model_call_opened',
        undefined,
      ])
      const finals = finalsOf(entries)
      expect(finals).toHaveLength(1)
      expect(finals[0]).toMatchObject({ outcome: 'interrupted', initiator: 'run_cancelled' })
      expect(finals[0]).not.toHaveProperty('reply')
      expect(finals[0]).not.toHaveProperty('replyDisposition')
      expect(await within(20_000, rt.runtime.close(), 'close')).toEqual({ released: true })
      expect(inner.active, 'registrations still held after close').toBe(0)

      await host.reopen()
      const cold = await runtimeOver(host, { prefix: 'cold' })
      expect(await cold.service.acquireCall({ ref, mode: 'read' })).toMatchObject({
        view: { state: 'interrupted' },
      })
      expect(await cold.runtime.close()).toEqual({ released: true })
    } finally {
      stop.abort()
      await within(10_000, rt.runtime.close(), 'teardown close').catch(() => {})
      await host.close()
    }
  }, 90_000)
})
