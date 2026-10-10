import { createSessionModelSelection } from '@omne-harness-lite/session-runtime-local'
import { createSessionModelCallFacts } from '@omne-harness-lite/session-runtime-local'
import { sessionModelSettlement } from '@omne-harness-lite/session-runtime-local'
import { createSessionModelAcknowledgement } from '@omne-harness-lite/session-runtime-local'
import {
  publishSessionModelCallContent,
  sessionModelRequestPreparation,
} from '@omne-harness-lite/session-runtime-local'
import { DatabaseSync } from 'node:sqlite'
import { modelCategory, modelValue, replaceModelValue } from './log-codec-fixture.ts'
// @module-tag slow
// 归慢层：整套装配＋真库：用例经会话选择宿主起租户、时钟与评估输入的整套装配（SQLite 文件库），并开真实 SQL journal 会话日志。
/**
 * Independent acceptance 2026-09-30 for the T29 runtime increment: A2 acknowledgeCall, A3 the
 * RT12 S-98 retention gate and the review-fix batch (B1/N1/S1). Scope A22-V1..V12, V15, V16.
 *
 * Every case runs the production runtime over real SQLite Storage and a real SQL journal SessionLog
 * (tests/session-selection-fixture.ts boots the real Cordis assembly for identity, tenancy and
 * the model catalog). Wrappers only disturb what the runtime *sees* (a receipt, a transaction
 * outcome, a principal); commit or absence is always decided by the real log/database, and every
 * verdict is read back from the durable state, never from the product's own report alone.
 *
 * A red case is a counterexample against the product, not a fixture problem.
 */
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { setFlagsFromString } from 'node:v8'
import { afterAll, describe, expect, it } from 'vitest'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import {
  parseOpaqueIdentifier,
  tenantIdEquals,
  unwrap,
  type TenantId,
} from '@omne-harness-lite/identity-values'
import type { PendingModelResponse } from '@omne-harness-lite/model-response'
import type { ModelCallAcknowledgedRecord } from '@omne-harness-lite/messages'
import { narrow, type Storage } from '@omne-harness-lite/storage'
import type { LogEntry, SessionLog } from '@omne-harness-lite/session-log'
import { createModelCallContentStore } from '../src/reference-content.ts'

import { createCallContainerStore } from '../src/service-container.ts'
import { createModelRuntime } from '../src/service-runtime.ts'
import { interpretCallHistory } from '@omne-harness-lite/model-request-runtime'
import { acknowledgedAttempts, attemptFromWitness } from '@omne-harness-lite/model-request-runtime'
import {
  captureModelLogValue,
  prepareModelLogEntry,
} from '@omne-harness-lite/model-request-runtime'
import type {
  CallAccess,
  CallAccessAction,
  CallPresence,
} from '@omne-harness-lite/model-request-runtime'
import type { ModelCallContentStore } from '../src/reference-types.ts'
import type { RuntimeConstruction } from '../src/service-types.ts'
import type {
  AcknowledgementCleanupPolicy,
  SessionRuntimeBinding,
} from '@omne-harness-lite/model-request-runtime'
import type { ModelCallHost, OpenCallInput } from '@omne-harness-lite/model-request-runtime'
import type {
  SettlementOwner,
  SettlementRegistration,
  SettlementTask,
  SettlementTaskKind,
} from '@omne-harness-lite/model-request-runtime'
import { policy as invocationPolicy } from './invoke-policy-fixture.ts'
import {
  ControlledSettlementOwner,
  noWaitScheduler,
  policy as settlementPolicy,
} from './settlement-fixture.ts'
import { payload, transport, type TestPlan } from './anchored-invocation-fixture.ts'
import { selectionHost } from './session-selection-fixture.ts'

// ---------------------------------------------------------------------------------------------
// Harness (measurement only: no product behavior is supplied here)
// ---------------------------------------------------------------------------------------------

type Host = Awaited<ReturnType<typeof selectionHost>>
const LEAK = 'visible' // the scripted reply text; never returned after a confirmed ACK
const CLOCK_1 = '2026-09-28T00:00:00Z'
const CLOCK_2 = '2026-09-29T12:34:56Z'
const messageId = unwrap(parseOpaqueIdentifier('acc-a22-message', 'MessageId'))
const creationKey = (value: string) => unwrap(parseOpaqueIdentifier(value, 'CreationKey'))
const rejections: unknown[] = []
process.on('unhandledRejection', reason => rejections.push(reason))
afterAll(() => expect(rejections).toEqual([]))

interface Grant {
  readonly actions: ReadonlySet<CallAccessAction>
  readonly tenant: TenantId
  readonly revoked: AbortController
}

/** One real host (SQLite + SQL journal + Cordis services) shared by any number of runtimes. */
async function world() {
  const host = await selectionHost(true, true)
  const grants = new Map<string, Grant>()
  let principal = 'owner'
  const w = {
    host,
    grants,
    get principal() {
      return principal
    },
    as(name: string) {
      principal = name
    },
    grant(name: string, actions: readonly CallAccessAction[], tenant: TenantId = host.tenant) {
      const revoked = new AbortController()
      grants.set(name, { actions: new Set(actions), tenant, revoked })
      return revoked
    },
    async entries(): Promise<readonly LogEntry[]> {
      const log = await host.log.readSince(host.session, 0)
      if (!('entries' in log)) throw new Error('durable log unavailable')
      return log.entries
    },
    async contentRows(call: string): Promise<{ locator: string; kind: string }[]> {
      return await host.storage.read(async tx =>
        narrow<{ model_call_content: { call: string; locator: string; kind: string } }>(tx)
          .selectFrom('model_call_content')
          .select(['locator', 'kind'])
          .where('call', '=', call)
          .orderBy('locator')
          .execute(),
      )
    },
    async retention(
      call: string,
    ): Promise<{ phase: string; acknowledgement: string | null } | undefined> {
      return await host.storage.read(async tx =>
        narrow<{
          model_call_retention: { call: string; phase: string; acknowledgement: string | null }
        }>(tx)
          .selectFrom('model_call_retention')
          .select(['phase', 'acknowledgement'])
          .where('call', '=', call)
          .executeTakeFirst(),
      )
    },
    /** Exact durable SQL row text; file/WAL housekeeping is not a journal write. */
    async logBytes(): Promise<string> {
      const db = new DatabaseSync(join(host.dir, 'log', 'journal.sqlite'), { readOnly: true })
      try {
        return JSON.stringify(
          db
            .prepare(
              'select session, position, batch, value from sl_entry order by session, position_length, position',
            )
            .all(),
        )
      } finally {
        db.close()
      }
    },
  }
  return w
}
type World = Awaited<ReturnType<typeof world>>

interface RuntimeOptions {
  readonly prefix?: string
  readonly append?: (real: SessionLog['append']) => SessionLog['append']
  readonly storage?: (real: Storage) => Storage
  readonly now?: () => Promise<string>
  readonly cleanup?: AcknowledgementCleanupPolicy
  readonly owner?: SettlementOwner
  readonly wire?: ReturnType<typeof transport>
  readonly failFirstSend?: boolean
  readonly diagnostic?: (event: { readonly kind: string }) => void
}

function makeCallHost(): ModelCallHost {
  return {
    signal: new AbortController().signal,
    stopping: () => false,
    register: () => ({ registration: { unregister() {} } }),
  }
}

/** A production runtime on the world's host with its own index, content store and calls. */
async function runtimeOn(w: World, options: RuntimeOptions = {}) {
  const host = w.host
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
                sourceVersion: 'acc-a22-log-v1',
                target: null,
                unknownBatches: [],
              }
            : {
                kind: 'live',
                source: input.source,
                executionGeneration: local.executionGeneration,
                sourceVersion: 'acc-a22-log-v1',
              },
        ),
      }
    },
  }
  const content: ModelCallContentStore = createModelCallContentStore({
    storage: options.storage?.(host.storage) ?? host.storage,
    policy: { maxConcurrentWrites: 4, maxContentBytes: 1_000_000 },
  })
  const callFacts = createSessionModelCallFacts({ content, presence: callPresence, maxScopes: 4 })
  const callAccess: CallAccess = {
    async check(input, admitted) {
      const grant = w.grants.get(w.principal)
      const held = await host.tenancy.holdingTenant(input.ref.session)
      if (
        grant === undefined ||
        !('tenant' in held) ||
        !tenantIdEquals(held.tenant, input.binding.tenant) ||
        !tenantIdEquals(grant.tenant, input.binding.tenant)
      )
        return { unavailable: true }
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
        sourceVersion: 'acc-a22-log-v1',
        revoked: grant.revoked.signal,
      }
      if (!grant.actions.has(input.action)) return { denied: true, evidence }
      return { allowed: await admitted(evidence), evidence }
    },
  }
  const binding: SessionRuntimeBinding = {
    log: logBinding,
    sourceVersions: { fixture: 'acc-a22-v1' },
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
  const prefix = options.prefix ?? 'acc'
  let nextCall = 0
  let nextResponse = 0
  let sendCount = 0
  const diagnostics: string[] = []
  const construction: RuntimeConstruction<TestPlan, object> = {
    acknowledgementFactory: createSessionModelAcknowledgement,
    settlementFactory: sessionModelSettlement,
    recordPublication: publishSessionModelCallContent,
    requestPreparation: sessionModelRequestPreparation,
    selectionFactory: createSessionModelSelection,
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
          transport: {
            ...wire.adapter,
            async send(planned, credential, signal) {
              sendCount++
              if (options.failFirstSend === true && sendCount === 1)
                return { failed: { source: 'http_status', statusCode: 503 } }
              return await wire.adapter.send(planned, credential, signal)
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
    acknowledgementCleanup: options.cleanup ?? { next: () => ({ stop: true }) },
    tokenMargin: { multiplier: 1, reserveTokens: 0 },
    policy: {
      ...invocationPolicy(event => {
        if (process.env.ACC_DEBUG) console.log('policy-diag', JSON.stringify(event))
        diagnostics.push(event.kind)
        options.diagnostic?.(event)
      }),
      now: options.now ?? (async () => CLOCK_1),
      schedule: () => () => {},
    },
    identities: {
      call: () => `${prefix}-call-${++nextCall}`,
      response: () => `${prefix}-response-${++nextResponse}`,
      message: () => messageId,
    },
    history: {
      call: (p, callId) => interpretCallHistory({ prefix: p, callId }),
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
          owner: new ControlledSettlementOwner(),
          originalInvocation: () => ({ unavailable: true }),
          close: async () => {},
        },
      }),
    },
    diagnostic(event) {
      if (process.env.ACC_DEBUG) console.log('settle-diag', JSON.stringify(event))
      diagnostics.push(event.kind)
    },
  }
  const runtime = createModelRuntime(construction)
  const service = runtime.service
  let effective = await service.effectiveModel({ session: host.session })
  if (!('effectiveModel' in effective)) {
    // first runtime of this world: the durable selection is written once
    const selected = await service.selectModel({
      session: host.session,
      routeName: 'example/model-a',
    })
    if (!('selected' in selected)) throw new Error(`select: ${JSON.stringify(selected)}`)
    effective = await service.effectiveModel({ session: host.session })
  }
  if (!('effectiveModel' in effective)) throw new Error('effective model')
  const request = (key: string, extra: Partial<OpenCallInput> = {}): OpenCallInput => ({
    creationKey: creationKey(key),
    session: host.session,
    target: effective.effectiveModel.routeName,
    basis: effective.effectiveModel,
    messages: [],
    tools: [],
    host: makeCallHost(),
    ...extra,
  })
  /** open + dispatch to a durable ready reply; returns the ref and the caller's own Pending. */
  async function readyCall(key: string) {
    const opened = await service.openCall(request(key))
    if (!('ref' in opened)) throw new Error(`open: ${JSON.stringify(opened)}`)
    const dispatched = await service.dispatch(opened.ref)
    if (!('replyPending' in dispatched)) throw new Error(`dispatch: ${JSON.stringify(dispatched)}`)
    return { ref: opened.ref, pending: dispatched.replyPending }
  }
  return {
    runtime,
    service,
    calls,
    wire,
    content,
    callFacts,
    selected,
    diagnostics,
    request,
    readyCall,
    sends: () => sendCount,
  }
}

async function selectOnce(w: World): Promise<void> {
  // selection is durable in the log; every later runtime reads it
  const setup = await runtimeOn(w, { prefix: 'setup' })
  await setup.runtime.close()
}

async function withWorld(work: (w: World) => Promise<void>): Promise<void> {
  const w = await world()
  try {
    w.grant('owner', ['read', 'wait', 'settle', 'cancel', 'ack'])
    w.as('owner')
    await selectOnce(w)
    await work(w)
  } finally {
    await w.host.close()
  }
}

const isAckOf = (call: string) => (entry: LogEntry) =>
  payload(entry).kind === 'model_call_acknowledged' && payload(entry).call === call
const ackEntries = async (w: World, call: string) => (await w.entries()).filter(isAckOf(call))
const ofCall = (call: string) => (entry: LogEntry) => {
  const value = payload(entry)
  const nested = value.call
  return (
    value.call === call ||
    (typeof nested === 'object' && nested !== null && 'callId' in nested && nested.callId === call)
  )
}

/** Wrap a SQL journal append so ACK batches follow a scripted receipt; everything else is real. */
function ackAppend(
  script: (
    entry: LogEntry,
    real: () => ReturnType<SessionLog['append']>,
  ) => ReturnType<SessionLog['append']>,
) {
  return (real: SessionLog['append']): SessionLog['append'] =>
    async (session, entries, fence, condition) => {
      const first = entries[0] as unknown as LogEntry | undefined
      let kind: unknown
      try {
        kind = first === undefined ? undefined : payload(first).kind
      } catch {
        kind = undefined
      }
      if (kind !== 'model_call_acknowledged') return await real(session, entries, fence, condition)
      return await script(first as LogEntry, () => real(session, entries, fence, condition))
    }
}

/** A forged ACK record appended by a foreign writer (not through acknowledgeCall). */
async function appendForgedAck(
  w: World,
  callId: string,
  over: Partial<ModelCallAcknowledgedRecord> & Record<string, unknown> = {},
): Promise<void> {
  const own = (await w.entries()).filter(ofCall(callId))
  const created = own.find(entry => payload(entry).kind === 'model_call_created')
  const ready = own.find(entry => payload(entry).kind === 'model_call_reply_ready')
  const dispatched = own.find(entry => payload(entry).kind === 'model_call_dispatched')
  if (created === undefined || dispatched === undefined) throw new Error('markers missing')
  const captured = captureModelLogValue({
    category: 'record',
    input: {
      kind: 'value',
      value: {
        kind: 'model_call_acknowledged',
        call: callId,
        creationKey: payload(created).creationKey,
        creationInput: { role: 'model-call-creation-semantic-sha256/v1', hex: 'a'.repeat(64) },
        acknowledgedAt: '2026-09-30T00:00:00Z',
        releasablePayloads: [
          payload(created).payload,
          ...(ready === undefined ? [] : [payload(ready).payload]),
        ],
        target: { kind: 'response', response: payload(dispatched).response },
        terminalState: 'complete',
        ...over,
      },
    },
  })
  if (!('ok' in captured)) throw new Error(`forged capture: ${captured.reason}`)
  const prepared = prepareModelLogEntry({
    session: w.host.session,
    shell: { tenant: w.host.tenant },
    captured: captured.ok,
    purpose: { kind: 'record' },
    messagePrefix: null,
  })
  if (!('ok' in prepared)) throw new Error(`forged prepare: ${prepared.reason}`)
  const result = await w.host.log.append(
    w.host.session,
    [prepared.ok],
    { kind: 'unfenced' },
    { kind: 'unconditional' },
  )
  if ('failure' in result) throw new Error(`forged append: ${result.failure}`)
}

function noLeak(name: string, value: unknown): void {
  expect(JSON.stringify(value), `${name} leaked the model reply`).not.toContain(LEAK)
}

/**
 * A settlement owner whose tasks (started while `onRequestOnly`) stop only once requestStop was
 * called (review N1: completion and actual stop are independent). `stopAll` is the test's own
 * escape hatch so a detected hang does not also hang the host teardown.
 */
class StopOnRequestOwner implements SettlementOwner {
  readonly name = 'stop-only-on-request'
  onRequestOnly = true
  active = 0
  released = 0
  readonly #controllers = new Set<AbortController>()
  readonly admission = () => 'open' as const
  readonly opened = () => ({ confirmed: true }) as const
  readonly unresolvedWrites = () => []
  stopAll(): void {
    for (const controller of this.#controllers) controller.abort()
  }
  readonly acquire = () => {
    this.active++
    let running = 0
    const registration: SettlementRegistration = {
      start: <T>(
        _kind: SettlementTaskKind,
        operation: (signal: AbortSignal) => Promise<T>,
      ): SettlementTask<T> => {
        running++
        const controller = new AbortController()
        this.#controllers.add(controller)
        const onRequestOnly = this.onRequestOnly
        const completion = Promise.resolve().then(() => operation(controller.signal))
        const aborted = new Promise<void>(resolve =>
          controller.signal.addEventListener('abort', () => resolve(), { once: true }),
        )
        const stopped = completion
          .then(
            () => undefined,
            () => undefined,
          )
          .then(async () => {
            if (onRequestOnly) await aborted
            running--
            this.#controllers.delete(controller)
          })
        return { completion, requestStop: () => controller.abort(), stopped }
      },
      release: () => {
        if (running !== 0) throw new Error('released a live registration')
        this.active--
        this.released++
      },
    }
    return { registration }
  }
}

const within = <T>(ms: number, promise: Promise<T>, what: string): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${what}: hung ${ms}ms`)), ms)),
  ])

// ---------------------------------------------------------------------------------------------
// A22-V1 / V2: authority, closed failures, zero writes, no implicit ACK
// ---------------------------------------------------------------------------------------------

describe('A22-V1/V2 acknowledgeCall authority and closed failures (RT12 S-95/S-96/S-100)', () => {
  it('only a current ack holder confirms; read/wait/settle/cancel/revoked/foreign/extra-field inputs are refused with zero writes', async () => {
    await withWorld(async w => {
      const rt = await runtimeOn(w)
      const { ref, pending } = await rt.readyCall('acc_v1_create')
      const target = { kind: 'response' as const, response: pending.id }
      w.grant('reader', ['read', 'wait'])
      w.grant('settler', ['read', 'settle'])
      w.grant('canceller', ['read', 'cancel'])
      w.grant('revoked', ['read', 'ack']).abort()
      w.grant('foreign', ['read', 'ack'], {
        ...w.host.tenant,
        organization: unwrap(parseOpaqueIdentifier('acc-foreign-org', 'OrganizationId')),
      })
      const logBefore = await w.logBytes()
      const rowsBefore = await w.contentRows(ref.callId)
      expect(rowsBefore).toHaveLength(2)
      for (const name of ['reader', 'settler', 'canceller', 'revoked', 'foreign']) {
        w.as(name)
        expect(await rt.service.acknowledgeCall({ ref, expectedResult: target }), name).toEqual({
          unavailable: true,
        })
        // S-96⑥ order: an unauthorized principal learns nothing about existence.
        expect(
          await rt.service.acknowledgeCall({
            ref: { ...ref, callId: 'acc-call-404' },
            expectedResult: target,
          }),
          `${name} existence`,
        ).toEqual({ unavailable: true })
        // representation is judged first, for everybody
        expect(
          await rt.service.acknowledgeCall({
            ref,
            expectedResult: { kind: 'ended', ending: 'nope' },
          } as never),
          `${name} representation`,
        ).toEqual({ invalidInput: { reason: 'malformed' } })
      }
      w.as('owner')
      // S-96①: caller-supplied authority/cleanup/summary fields are not an input.
      for (const extra of [
        { releasablePayloads: [] },
        { ackAllowed: true },
        { acknowledgedAt: CLOCK_2 },
        { creationInput: { role: 'model-call-creation-semantic-sha256/v1', hex: '0'.repeat(64) } },
      ])
        expect(
          await rt.service.acknowledgeCall({ ref, expectedResult: target, ...extra } as never),
          JSON.stringify(extra),
        ).toEqual({ invalidInput: { reason: 'malformed' } })
      expect(
        await rt.service.acknowledgeCall({
          ref,
          expectedResult: { ...target, ending: 'released' },
        } as never),
      ).toEqual({ invalidInput: { reason: 'malformed' } })
      // Owner: target mismatch is wrongPhase with the durable ready's real state (B1).
      expect(
        await rt.service.acknowledgeCall({
          ref,
          expectedResult: { kind: 'response', response: 'acc-response-999' },
        }),
      ).toEqual({ wrongPhase: { phase: 'complete' } })
      expect(
        await rt.service.acknowledgeCall({
          ref,
          expectedResult: { kind: 'ended', ending: 'released' },
        }),
      ).toEqual({ wrongPhase: { phase: 'complete' } })
      expect(
        await rt.service.acknowledgeCall({
          ref: { ...ref, callId: 'acc-call-404' },
          expectedResult: target,
        }),
      ).toEqual({ callNotFound: true })
      // Zero writes from every refusal: log bytes, content rows and retention phase unchanged.
      expect(await w.logBytes()).toBe(logBefore)
      expect(await w.contentRows(ref.callId)).toEqual(rowsBefore)
      expect((await w.retention(ref.callId))?.phase).toBe('retained')
      expect((await w.retention(ref.callId))?.acknowledgement).toBeNull()

      // S-96⑦: concurrent same-key ACKs recognize one original task and batch.
      const results = await Promise.all([
        rt.service.acknowledgeCall({ ref, expectedResult: target }),
        rt.service.acknowledgeCall({ ref, expectedResult: target }),
        rt.service.acknowledgeCall({ ref, expectedResult: target }),
      ])
      expect(results[0]).toMatchObject({ acknowledged: { ref, target, cleanup: 'released' } })
      expect(results[1]).toEqual(results[0])
      expect(results[2]).toEqual(results[0])
      expect(await ackEntries(w, ref.callId)).toHaveLength(1)
      expect(await w.contentRows(ref.callId)).toEqual([])
      expect((await w.retention(ref.callId))?.phase).toBe('released')
      // Another consumer with its own current ack authority recognizes the same fact.
      w.grant('successor', ['read', 'ack'])
      w.as('successor')
      expect(await rt.service.acknowledgeCall({ ref, expectedResult: target })).toEqual(results[0])
      // Repeats re-check current authority: a revoked holder no longer recognizes.
      w.grants.get('owner')?.revoked.abort()
      w.as('owner')
      expect(await rt.service.acknowledgeCall({ ref, expectedResult: target })).toEqual({
        unavailable: true,
      })
      expect(await ackEntries(w, ref.callId)).toHaveLength(1)
      await rt.runtime.close()
    })
  }, 90_000)

  it('time inversion: an in-flight (speaking) call is wrongPhase and nothing is fixed, written or closed', async () => {
    await withWorld(async w => {
      let open: (() => void) | undefined
      const gate = new Promise<void>(resolve => {
        open = resolve
      })
      const rt = await runtimeOn(w, { wire: transport({ afterContent: async () => await gate }) })
      const opened = await rt.service.openCall(rt.request('acc_v1_flight'))
      if (!('ref' in opened)) throw new Error('open')
      const ref = opened.ref
      const dispatching = rt.service.dispatch(ref)
      let state: unknown
      for (let index = 0; index < 300; index++) {
        const view = await rt.service.acquireCall({ ref, mode: 'read' })
        state = 'view' in view && 'state' in view.view ? view.view.state : undefined
        if (state === 'speaking') break
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      expect(state).toBe('speaking')
      const before = await w.logBytes()
      for (const expectedResult of [
        { kind: 'response' as const, response: 'acc-response-1' },
        { kind: 'ended' as const, ending: 'interrupted' as const },
      ]) {
        const answered = await rt.service.acknowledgeCall({ ref, expectedResult })
        expect(answered).toHaveProperty('wrongPhase')
      }
      expect(await w.logBytes()).toBe(before)
      // The retention row stays retained: the in-flight ready writer can still publish.
      const row = await w.retention(ref.callId)
      expect(row?.phase).toBe('retained')
      expect(row?.acknowledgement ?? null).toBeNull()
      open?.()
      expect(await dispatching).toHaveProperty('replyPending')
      expect(await w.contentRows(ref.callId)).toHaveLength(2)
      await rt.runtime.close()
    })
  }, 90_000)

  it('a failed earlier response is never the target; the whole-call ending is, and the failed attempt stays in the small sequence', async () => {
    await withWorld(async w => {
      const rt = await runtimeOn(w, { failFirstSend: true })
      const opened = await rt.service.openCall(rt.request('acc_v1_failed'))
      if (!('ref' in opened)) throw new Error('open')
      const ref = opened.ref
      const dispatched = await rt.service.dispatch(ref)
      expect(dispatched).not.toHaveProperty('replyPending')
      const failedId = (await w.entries())
        .filter(ofCall(ref.callId))
        .map(entry => payload(entry))
        .find(value => value.kind === 'model_call_dispatched')?.response as string
      expect(typeof failedId).toBe('string')
      // awaiting_decision is not terminal
      const early = await rt.service.acknowledgeCall({
        ref,
        expectedResult: { kind: 'response', response: failedId },
      })
      expect(early).toHaveProperty('wrongPhase')
      expect(await rt.service.releaseCall(ref)).not.toHaveProperty('unavailable')
      // S-95: an earlier failed response never stands for the whole call.
      expect(
        await rt.service.acknowledgeCall({
          ref,
          expectedResult: { kind: 'response', response: failedId },
        }),
      ).toHaveProperty('wrongPhase')
      expect(await ackEntries(w, ref.callId)).toHaveLength(0)
      const acknowledged = await rt.service.acknowledgeCall({
        ref,
        expectedResult: { kind: 'ended', ending: 'released' },
      })
      expect(acknowledged).toMatchObject({
        acknowledged: { target: { kind: 'ended', ending: 'released' }, cleanup: 'released' },
      })
      const attempts = await rt.service.readAttempts(ref)
      expect(attempts).toMatchObject({
        acknowledged: {
          terminalState: 'handed_up',
          attempts: [{ response: failedId, outcome: 'failed', disposition: 'final' }],
        },
      })
      expect(await w.contentRows(ref.callId)).toEqual([])
      await rt.runtime.close()
    })
  }, 90_000)

  it('no implicit ACK: consumer release, zero consumers, runtime close and a cold restart leave the copy retained', async () => {
    await withWorld(async w => {
      w.grant('reader', ['read', 'wait'])
      const rt = await runtimeOn(w)
      const { ref } = await rt.readyCall('acc_v2_implicit')
      w.as('reader')
      const read = await rt.service.acquireCall({ ref, mode: 'read' })
      expect(read).toHaveProperty('view.result.disposition', 'disposition_pending')
      const waited = await rt.service.acquireCall({ ref, mode: 'wait' })
      if ('view' in waited && waited.consumer !== undefined) {
        waited.consumer.release()
        await waited.consumer.stopped
      }
      w.as('owner')
      expect(await rt.runtime.close()).toEqual({ released: true })
      await w.host.reopen()
      const cold = await runtimeOn(w, { prefix: 'cold' })
      const again = await cold.service.acquireCall({ ref, mode: 'read' })
      expect(again).toMatchObject({
        view: { state: 'complete', result: { disposition: 'disposition_pending' } },
      })
      expect(await ackEntries(w, ref.callId)).toHaveLength(0)
      expect(await w.contentRows(ref.callId)).toHaveLength(2)
      expect((await w.retention(ref.callId))?.phase).toBe('retained')
      await cold.runtime.close()
    })
  }, 90_000)
})

// ---------------------------------------------------------------------------------------------
// A22-V3..V7: the S-98 retention gate on real Storage, log-first release, unknown receipts
// ---------------------------------------------------------------------------------------------

/** rows are gone exactly when the control row says released (no dangling or false release) */
async function consistent(w: World, call: string, owned: number): Promise<string> {
  const rows = (await w.contentRows(call)).length
  const phase = (await w.retention(call))?.phase ?? 'none'
  if (phase === 'released') expect(rows, `released ${call} still holds rows`).toBe(0)
  else expect(rows, `${phase} ${call} lost rows`).toBe(owned)
  return phase
}

describe('A22-V3/V4 same-call retention gate (RT12 S-98)', () => {
  it('a publisher that registered first blocks the release until its permit ends; the gate is closed for new reads/writes meanwhile; another call is untouched', async () => {
    await withWorld(async w => {
      const rt = await runtimeOn(w)
      const { ref, pending } = await rt.readyCall('acc_v3_first')
      const other = await rt.readyCall('acc_v3_other')
      const binding = rt.selected.input.binding
      // A real, committed publish permit on the same retention row (a late original writer).
      const late = await rt.content.put({
        binding,
        locator: 'acc-late-locator',
        version: 'v1',
        content: { kind: 'reply_ready', value: pending },
      })
      if (!('permit' in late)) throw new Error(`late put: ${JSON.stringify(late)}`)
      const target = { kind: 'response' as const, response: pending.id }
      const acknowledged = await rt.service.acknowledgeCall({ ref, expectedResult: target })
      expect(acknowledged).toMatchObject({
        acknowledged: { cleanup: 'pending', pendingReasons: ['writer_in_flight'] },
      })
      expect((await w.contentRows(ref.callId)).length).toBe(3)
      expect((await w.retention(ref.callId))?.phase).toBe('acknowledged')
      // closed gate: no new copy read or publication for this call
      const readyRef = (await w.entries())
        .filter(ofCall(ref.callId))
        .map(entry => payload(entry))
        .find(value => value.kind === 'model_call_reply_ready')?.payload as never
      expect(await rt.content.read({ binding, call: ref.callId, ref: readyRef })).toEqual({
        unavailable: true,
      })
      expect(
        await rt.content.put({
          binding,
          locator: 'acc-later-locator',
          version: 'v1',
          content: { kind: 'reply_ready', value: pending },
        }),
      ).toEqual({ unavailable: true })
      const small = await rt.service.acquireCall({ ref, mode: 'read' })
      expect(small).toMatchObject({
        view: { acknowledged: { cleanup: 'pending', pendingReasons: ['writer_in_flight'] } },
      })
      noLeak('acquire while pending', small)
      // the writer really ends: the next cleanup attempt releases exactly the ACK list
      expect(await late.permit.release()).toEqual({ released: true })
      expect(await rt.service.acquireCall({ ref, mode: 'read' })).toMatchObject({
        view: { acknowledged: { cleanup: 'released' } },
      })
      expect((await w.retention(ref.callId))?.phase).toBe('released')
      const left = await w.contentRows(ref.callId)
      // only the ACK's exact releasable list is deleted (S-98); no created/ready copy remains
      expect(left.filter(row => row.locator !== 'acc-late-locator')).toEqual([])
      // another CallKey keeps its copy and its full read
      expect(await w.contentRows(other.ref.callId)).toHaveLength(2)
      const otherView = await rt.service.acquireCall({ ref: other.ref, mode: 'read' })
      expect(otherView).toMatchObject({
        view: { state: 'complete', result: { disposition: 'disposition_pending' } },
      })
      await rt.runtime.close()
    })
  }, 90_000)

  it('retiring committed first: while the ACK append is in flight new reads and publications are refused and nothing is deleted', async () => {
    await withWorld(async w => {
      let open: (() => void) | undefined
      const gate = new Promise<void>(resolve => {
        open = resolve
      })
      let appending: (() => void) | undefined
      const started = new Promise<void>(resolve => {
        appending = resolve
      })
      const rt = await runtimeOn(w, {
        append: ackAppend(async (_entry, real) => {
          appending?.()
          await gate
          return await real()
        }),
      })
      const { ref, pending } = await rt.readyCall('acc_v3_retiring')
      const binding = rt.selected.input.binding
      const readyRef = (await w.entries())
        .filter(ofCall(ref.callId))
        .map(entry => payload(entry))
        .find(value => value.kind === 'model_call_reply_ready')?.payload as never
      expect(await rt.content.read({ binding, call: ref.callId, ref: readyRef })).toHaveProperty(
        'content',
      )
      const acking = rt.service.acknowledgeCall({
        ref,
        expectedResult: { kind: 'response', response: pending.id },
      })
      await started
      expect((await w.retention(ref.callId))?.phase).toBe('retiring')
      expect(await rt.content.read({ binding, call: ref.callId, ref: readyRef })).toEqual({
        unavailable: true,
      })
      expect(
        await rt.content.put({
          binding,
          locator: 'acc-late-locator',
          version: 'v1',
          content: { kind: 'reply_ready', value: pending },
        }),
      ).toEqual({ unavailable: true })
      const during = await rt.service.acquireCall({ ref, mode: 'read' })
      expect(during).not.toHaveProperty('view.result')
      noLeak('acquire while retiring', during)
      expect(await w.contentRows(ref.callId)).toHaveLength(2)
      expect(await ackEntries(w, ref.callId)).toHaveLength(0)
      open?.()
      expect(await acking).toMatchObject({ acknowledged: { cleanup: 'released' } })
      expect(await w.contentRows(ref.callId)).toEqual([])
      await rt.runtime.close()
    })
  }, 90_000)

  it('A22-V4: concurrent copies racing the ACK finish whole or fail explicitly; an idle wait handle does not pin cleanup and later waits are small', async () => {
    await withWorld(async w => {
      let open: (() => void) | undefined
      const gate = new Promise<void>(resolve => {
        open = resolve
      })
      const rt = await runtimeOn(w, { wire: transport({ afterContent: async () => await gate }) })
      const opened = await rt.service.openCall(rt.request('acc_v4_idle'))
      if (!('ref' in opened)) throw new Error('open')
      const ref = opened.ref
      const dispatching = rt.service.dispatch(ref)
      let consumer:
        | {
            wait: (input: object) => Promise<unknown>
            release: () => void
            stopped: Promise<unknown>
          }
        | undefined
      for (let index = 0; index < 300 && consumer === undefined; index++) {
        const acquired = await rt.service.acquireCall({ ref, mode: 'wait' })
        if ('view' in acquired && acquired.consumer !== undefined) consumer = acquired.consumer
        else await new Promise(resolve => setTimeout(resolve, 10))
      }
      if (consumer === undefined) throw new Error('no live consumer')
      open?.()
      const dispatched = await dispatching
      if (!('replyPending' in dispatched)) throw new Error('dispatch')
      const pending = dispatched.replyPending
      const binding = rt.selected.input.binding
      const readyRef = (await w.entries())
        .filter(ofCall(ref.callId))
        .map(entry => payload(entry))
        .find(value => value.kind === 'model_call_reply_ready')?.payload as never
      const copies = Array.from({ length: 12 }, () =>
        rt.content.read({ binding, call: ref.callId, ref: readyRef }),
      )
      const acking = rt.service.acknowledgeCall({
        ref,
        expectedResult: { kind: 'response', response: pending.id },
      })
      const more = Array.from({ length: 12 }, () =>
        rt.content.read({ binding, call: ref.callId, ref: readyRef }),
      )
      const acknowledged = await acking
      // S-98: the idle handle is not a reader; cleanup does not wait for it.
      expect(acknowledged).toMatchObject({ acknowledged: { cleanup: 'released' } })
      for (const copy of await Promise.all([...copies, ...more])) {
        if ('content' in copy) expect(copy.content).toEqual({ kind: 'reply_ready', value: pending })
        else expect(copy).toEqual({ unavailable: true })
      }
      // the original handle later waits for the small branch, not a cached full value
      const waited = await consumer.wait({})
      noLeak('idle handle wait after ACK', waited)
      expect(waited).toMatchObject({ view: { acknowledged: { cleanup: 'released' } } })
      consumer.release()
      await consumer.stopped
      await rt.runtime.close()
    })
  }, 90_000)
})

describe('A22-V5 log-first confirmation and unknown ACK receipts (RT12 S-96⑧, MS8 S-58)', () => {
  it('landed but receipt unknown -> SQL retiring -> restart: the original batch is recognized, then released; acknowledgedAt is never rebuilt', async () => {
    await withWorld(async w => {
      let clock = CLOCK_1
      const rt = await runtimeOn(w, {
        now: async () => clock,
        append: ackAppend(async (_entry, real) => {
          const landed = await real()
          if ('failure' in landed) throw new Error(`real append failed: ${landed.failure}`)
          return { failure: 'unavailable' }
        }),
      })
      const { ref, pending } = await rt.readyCall('acc_v5_landed')
      const target = { kind: 'response' as const, response: pending.id }
      expect(await rt.service.acknowledgeCall({ ref, expectedResult: target })).toEqual({
        unavailable: true,
      })
      const [landed] = await ackEntries(w, ref.callId)
      expect(landed).toBeDefined()
      expect(payload(landed as LogEntry).acknowledgedAt).toBe(CLOCK_1)
      expect((await w.retention(ref.callId))?.phase).toBe('retiring')
      expect(await w.contentRows(ref.callId)).toHaveLength(2)
      // process exit without close; the log is reopened by a new process
      clock = CLOCK_2
      await w.host.reopen()
      const cold = await runtimeOn(w, { prefix: 'cold', now: async () => CLOCK_2 })
      const read = await cold.service.acquireCall({ ref, mode: 'read' })
      expect(read).toMatchObject({
        view: { acknowledged: { acknowledgedAt: CLOCK_1, cleanup: 'released' } },
      })
      noLeak('cold read', read)
      expect(await cold.service.acknowledgeCall({ ref, expectedResult: target })).toMatchObject({
        acknowledged: { acknowledgedAt: CLOCK_1, cleanup: 'released' },
      })
      expect(await ackEntries(w, ref.callId)).toHaveLength(1)
      expect(await w.contentRows(ref.callId)).toEqual([])
      expect((await w.retention(ref.callId))?.phase).toBe('released')
      await cold.runtime.close()
    })
  }, 90_000)

  it.each([false, true])(
    'not landed and receipt unknown: nothing is deleted without the ACK; a later retry (cold=%s) resends the same fixed batch only',
    async cold => {
      await withWorld(async w => {
        let clock = CLOCK_1
        let drop = true
        const rt = await runtimeOn(w, {
          now: async () => clock,
          append: ackAppend(async (_entry, real) => {
            if (drop) {
              drop = false
              return { failure: 'unavailable' }
            }
            return await real()
          }),
        })
        const { ref, pending } = await rt.readyCall(`acc_v5_absent_${cold ? 'c' : 'w'}`)
        const target = { kind: 'response' as const, response: pending.id }
        expect(await rt.service.acknowledgeCall({ ref, expectedResult: target })).toEqual({
          unavailable: true,
        })
        expect(await ackEntries(w, ref.callId)).toHaveLength(0)
        // reads and closes never turn an unconfirmed ACK into deletion
        await rt.service.acquireCall({ ref, mode: 'read' })
        await rt.service.readAttempts(ref)
        expect(await w.contentRows(ref.callId)).toHaveLength(2)
        expect((await w.retention(ref.callId))?.phase).toBe('retiring')
        clock = CLOCK_2
        let retry = rt
        if (cold) {
          await w.host.reopen()
          retry = await runtimeOn(w, { prefix: 'cold', now: async () => CLOCK_2 })
        }
        expect(await retry.service.acknowledgeCall({ ref, expectedResult: target })).toMatchObject({
          acknowledged: { acknowledgedAt: CLOCK_1, cleanup: 'released' },
        })
        const acks = await ackEntries(w, ref.callId)
        expect(acks).toHaveLength(1)
        expect(payload(acks[0] as LogEntry).acknowledgedAt).toBe(CLOCK_1)
        expect(await w.contentRows(ref.callId)).toEqual([])
        await retry.runtime.close()
        if (cold) await rt.runtime.close()
      })
    },
    120_000,
  )

  it('no lawful ACK, no deletion: a foreign ACK-shaped record whose creation digest contradicts the retained original does not release the copy', async () => {
    await withWorld(async w => {
      const rt = await runtimeOn(w)
      const { ref } = await rt.readyCall('acc_v5_forged')
      // a durable final, so the forged record needs no witness and passes the history shape
      expect(
        await rt.service.settleReply({ ...ref, disposition: { vetoed: { by: 'acc-gate' } } }),
      ).toEqual({ callId: ref.callId, state: 'complete' })
      expect((await w.retention(ref.callId))?.phase).toBe('retained')
      await appendForgedAck(w, ref.callId, {
        releasablePayloads: (await w.entries())
          .filter(ofCall(ref.callId))
          .map(entry => payload(entry))
          .filter(
            value => value.kind === 'model_call_created' || value.kind === 'model_call_reply_ready',
          )
          .map(value => value.payload) as never,
      })
      // the forged record is accepted as the call's ACK by the read faces …
      const read = await rt.service.acquireCall({ ref, mode: 'read' })
      if (process.env.ACC_DEBUG) console.log('forged-read', JSON.stringify(read))
      await rt.service.readAttempts(ref)
      // … but its creation digest contradicts the still-retained original: S-98 release
      // requires a lawful ACK and a verifiable list/ownership. The copy must remain.
      expect(await w.contentRows(ref.callId)).toHaveLength(2)
      await rt.runtime.close()
    })
  }, 90_000)
})

describe('A22-V6 original writer permits (RT12 S-98/S-102, S-86)', () => {
  /** The ready marker lands in the real log but the runtime sees an unknown receipt. */
  async function unknownReady(w: World, key: string) {
    let lose = true
    const rt = await runtimeOn(w, {
      append: real => async (session, entries, fence, condition) => {
        const first = entries[0] as unknown as LogEntry | undefined
        let kind: unknown
        try {
          kind = first === undefined ? undefined : payload(first).kind
        } catch {
          kind = undefined
        }
        const landed = await real(session, entries, fence, condition)
        if (lose && kind === 'model_call_reply_ready' && !('failure' in landed)) {
          lose = false
          return { failure: 'unavailable' }
        }
        return landed
      },
    })
    const opened = await rt.service.openCall(rt.request(key))
    if (!('ref' in opened)) throw new Error('open')
    const ref = opened.ref
    const dispatched = await rt.service.dispatch(ref)
    const ready = (await w.entries())
      .filter(ofCall(ref.callId))
      .map(entry => payload(entry))
      .find(value => value.kind === 'model_call_reply_ready')
    expect(ready, 'the ready marker actually landed').toBeDefined()
    expect(dispatched).not.toHaveProperty('replyPending')
    return { rt, ref, ready: ready as { response: string } }
  }
  /** S-86: nobody may publish a different final for a ResponseId whose ready is durable. */
  async function noContradictingFinal(w: World, call: string): Promise<void> {
    const finals = (await w.entries())
      .filter(ofCall(call))
      .map(entry => payload(entry))
      .filter(value => typeof value.outcome === 'string' && value.id !== undefined)
    // soft: the rest of the case still reports the consequences of such a final
    for (const final of finals)
      expect
        .soft(
          {
            outcome: final.outcome,
            initiator: final.initiator,
            disposition: final.replyDisposition,
          },
          'a final contradicting the durable complete ready was written without any consumer',
        )
        .toMatchObject({ outcome: 'complete' })
    expect
      .soft(
        finals.filter(final => final.replyDisposition === undefined),
        'a final with no real disposition',
      )
      .toEqual([])
  }

  it('control (no ACK): closing the runtime over an unknown-receipt ready neither interrupts nor re-finalizes it', async () => {
    await withWorld(async w => {
      const { rt, ref } = await unknownReady(w, 'acc_v6_control')
      const closed = await rt.runtime.close()
      if (process.env.ACC_DEBUG) console.log('v6-control-close', JSON.stringify(closed))
      await noContradictingFinal(w, ref.callId)
    })
  }, 90_000)

  it('a ready marker whose receipt is unknown keeps its publish permit: cleanup stays writer_in_flight until the original writer is actually resolved; ACK cleanup never writes a final', async () => {
    await withWorld(async w => {
      const { rt, ref, ready } = await unknownReady(w, 'acc_v6_unknown_ready')
      const answered = await rt.service.acknowledgeCall({
        ref,
        expectedResult: { kind: 'response', response: ready?.response as string },
      })
      // Either the unknown original writer is recognized first (then released), or the
      // cleanup reports the live permit. Never: rows deleted while the permit row exists.
      const permits = await w.host.storage.read(async tx =>
        narrow<{ model_call_retention_use: { call: string } }>(tx)
          .selectFrom('model_call_retention_use')
          .select('call')
          .where('call', '=', ref.callId)
          .execute(),
      )
      if (process.env.ACC_DEBUG)
        console.log(
          'v6-entries',
          JSON.stringify(
            (await w.entries()).filter(ofCall(ref.callId)).map(entry => payload(entry)),
          ),
          JSON.stringify(answered),
          permits.length,
        )
      // S-95/S-96③: an ACK is neither a disposition nor a cancellation of the ready.
      await noContradictingFinal(w, ref.callId)
      if (permits.length > 0) {
        expect(answered).toMatchObject({
          acknowledged: { cleanup: 'pending', pendingReasons: ['writer_in_flight'] },
        })
        expect(await w.contentRows(ref.callId)).toHaveLength(2)
      } else expect(answered).toMatchObject({ acknowledged: { cleanup: 'released' } })
      expect.soft(await rt.runtime.close(), 'runtime.close after the ACK').toEqual({
        released: true,
      })
      // after the real stop and recognition the next process releases
      await w.host.reopen()
      const next = await runtimeOn(w, { prefix: 'next' })
      const final = await next.service.acquireCall({ ref, mode: 'read' })
      expect(final).toMatchObject({ view: { acknowledged: { cleanup: 'released' } } })
      expect(await w.contentRows(ref.callId)).toEqual([])
      await next.runtime.close()
    })
  }, 90_000)
})

describe('A22-V7 one Storage commit deletes the contents and marks released', () => {
  type Fault = 'none' | 'rollback' | 'receipt'
  function faulty(state: { fault: Fault; hits: number }) {
    const isCleanup = (value: unknown) =>
      typeof value === 'object' && value !== null && 'cleanup' in value
    return (real: Storage): Storage => ({
      read: fn => real.read(fn),
      async write(fn) {
        if (state.fault === 'rollback')
          return await real.write(async tx => {
            const out = await fn(tx)
            if (isCleanup(out)) {
              state.fault = 'none'
              state.hits++
              throw new Error('injected: fails before commit')
            }
            return out
          })
        if (state.fault === 'receipt') {
          const out = await real.write(fn)
          if (isCleanup(out)) {
            state.fault = 'none'
            state.hits++
            throw new Error('injected: committed, receipt lost')
          }
          return out
        }
        return await real.write(fn)
      },
    })
  }

  it('a failure inside the release transaction leaves the complete prior state; the next attempt releases; log bytes never change', async () => {
    await withWorld(async w => {
      const state = { fault: 'none' as Fault, hits: 0 }
      const rt = await runtimeOn(w, { storage: faulty(state) })
      const { ref, pending } = await rt.readyCall('acc_v7_rollback')
      state.fault = 'rollback'
      const answered = await rt.service.acknowledgeCall({
        ref,
        expectedResult: { kind: 'response', response: pending.id },
      })
      expect(state.hits).toBe(1)
      // S-96⑥: a failed cleanup after confirmation is acknowledged + pending, not an ACK failure
      expect(answered).toMatchObject({ acknowledged: { cleanup: 'pending' } })
      expect(await consistent(w, ref.callId, 2)).toBe('acknowledged')
      const bytes = await w.logBytes()
      expect(await rt.service.acquireCall({ ref, mode: 'read' })).toMatchObject({
        view: { acknowledged: { cleanup: 'released' } },
      })
      expect(await consistent(w, ref.callId, 2)).toBe('released')
      expect(await w.logBytes()).toBe(bytes)
      await rt.runtime.close()
    })
  }, 90_000)

  it('a committed release whose receipt is lost is recognized from the same control row', async () => {
    await withWorld(async w => {
      const state = { fault: 'none' as Fault, hits: 0 }
      const rt = await runtimeOn(w, { storage: faulty(state) })
      const { ref, pending } = await rt.readyCall('acc_v7_receipt')
      state.fault = 'receipt'
      const answered = await rt.service.acknowledgeCall({
        ref,
        expectedResult: { kind: 'response', response: pending.id },
      })
      expect(state.hits).toBe(1)
      expect(answered).toMatchObject({ acknowledged: { cleanup: 'released' } })
      expect(await consistent(w, ref.callId, 2)).toBe('released')
      await rt.runtime.close()
    })
  }, 90_000)

  it('released identities are not reused: neither the same call nor another call may publish under a released locator/version', async () => {
    await withWorld(async w => {
      const rt = await runtimeOn(w)
      const first = await rt.readyCall('acc_v7_reuse_a')
      const readyRef = (await w.entries())
        .filter(ofCall(first.ref.callId))
        .map(entry => payload(entry))
        .find(value => value.kind === 'model_call_reply_ready')?.payload as {
        locator: string
        version: string
      }
      const second = await rt.readyCall('acc_v7_reuse_b')
      expect(
        await rt.service.acknowledgeCall({
          ref: first.ref,
          expectedResult: { kind: 'response', response: first.pending.id },
        }),
      ).toMatchObject({ acknowledged: { cleanup: 'released' } })
      const binding = rt.selected.input.binding
      expect(
        await rt.content.put({
          binding,
          locator: readyRef.locator,
          version: readyRef.version,
          content: { kind: 'reply_ready', value: first.pending },
        }),
        'same call re-publication',
      ).not.toHaveProperty('ref')
      const reused = await rt.content.put({
        binding,
        locator: readyRef.locator,
        version: readyRef.version,
        content: { kind: 'reply_ready', value: second.pending },
      })
      if ('permit' in reused) await reused.permit.release()
      expect(reused, 'another call reusing a released locator/version').not.toHaveProperty('ref')
      await rt.runtime.close()
    })
  }, 90_000)
})

// ---------------------------------------------------------------------------------------------
// A22-V8 / V9: every read entry answers the small acknowledged branch; creation recognition
// ---------------------------------------------------------------------------------------------

describe('A22-V8 all reads after a confirmed ACK are small (RT12 S-97/S-100, MS8 S-59)', () => {
  it('cleanup pending on a real in-memory reader: acquire/wait/readAttempts/reconcile/open never hand out the full value; host stop still reads the durable ACK', async () => {
    await withWorld(async w => {
      const rt = await runtimeOn(w)
      const { ref, pending } = await rt.readyCall('acc_v8_pending')
      const holder = rt.calls.reserve(ref)
      if (!('reservation' in holder)) throw new Error('reservation')
      const target = { kind: 'response' as const, response: pending.id }
      expect(await rt.service.acknowledgeCall({ ref, expectedResult: target })).toMatchObject({
        acknowledged: { cleanup: 'pending', pendingReasons: ['read_in_flight'] },
      })
      expect(await w.contentRows(ref.callId)).toHaveLength(2)
      const results: Record<string, unknown> = {
        read: await rt.service.acquireCall({ ref, mode: 'read' }),
        wait: await rt.service.acquireCall({ ref, mode: 'wait' }),
        attempts: await rt.service.readAttempts(ref),
        reconcile: await rt.service.reconcile({ session: w.host.session }),
        open: await rt.service.openCall(rt.request('acc_v8_pending')),
      }
      for (const [name, value] of Object.entries(results)) noLeak(name, value)
      expect(results.read).toMatchObject({
        view: {
          acknowledged: { cleanup: 'pending' },
          attempts: [{ response: pending.id, disposition: 'disposition_pending' }],
        },
      })
      expect(results.wait).not.toHaveProperty('consumer')
      expect(results.attempts).toHaveProperty('acknowledged')
      expect(results.open).toMatchObject({ ref, acknowledged: { ref } })
      holder.reservation.release()
      expect(await rt.runtime.close()).toEqual({ released: true })
      // S-100 host stop: the durable ACK and its progress stay readable
      expect(await rt.service.acknowledgeCall({ ref, expectedResult: target })).toMatchObject({
        acknowledged: { ref, target },
      })
      const afterStop = await rt.service.acquireCall({ ref, mode: 'read' })
      noLeak('read after stop', afterStop)
      expect(afterStop, 'a stopped host still answers a durable ACK read').toHaveProperty(
        'view.acknowledged',
      )
    })
  }, 90_000)

  it('a second runtime still holding its warm container obeys the ACK another runtime confirmed: no full read, no settle from the stale in-memory copy, no control, no write', async () => {
    await withWorld(async w => {
      const a = await runtimeOn(w, { prefix: 'warm' })
      const { ref, pending } = await a.readyCall('acc_v8_two')
      // A's index and container were built before the ACK
      expect(await a.service.acquireCall({ ref, mode: 'read' })).toHaveProperty(
        'view.result.pending',
      )
      expect(a.calls.find(ref)).toBeDefined()
      const b = await runtimeOn(w, { prefix: 'other' })
      expect(
        await b.service.acknowledgeCall({
          ref,
          expectedResult: { kind: 'response', response: pending.id },
        }),
      ).toMatchObject({ acknowledged: { cleanup: 'released' } })
      expect(await w.contentRows(ref.callId)).toEqual([])
      const before = await w.logBytes()
      const read = await a.service.acquireCall({ ref, mode: 'read' })
      noLeak('warm read', read)
      expect(read).toMatchObject({ view: { acknowledged: { cleanup: 'released' } } })
      const attempts = await a.service.readAttempts(ref)
      noLeak('warm attempts', attempts)
      expect(attempts).toHaveProperty('acknowledged')
      expect(await a.service.interrupt({ ...ref, initiator: 'user' })).toEqual({
        alreadyEnded: true,
      })
      expect(await a.service.dispatch(ref)).toEqual({ alreadyEnded: true })
      // RT12 S-99③⑥: after ACK and without a final the caller's own value is required;
      // the runtime's stale in-memory Pending is not an authority to settle from.
      expect(
        await a.service.settleReply({ ...ref, disposition: { vetoed: { by: 'acc-gate' } } }),
      ).toEqual({ wrongPhase: { phase: 'complete' } })
      expect(await w.logBytes(), 'A wrote after the ACK').toBe(before)
      await a.runtime.close()
      await b.runtime.close()
    })
  }, 90_000)

  it('without an ACK a missing model copy is damage, not an acknowledged or absent call', async () => {
    await withWorld(async w => {
      const rt = await runtimeOn(w)
      const { ref } = await rt.readyCall('acc_v8_damage')
      await w.host.storage.write(async tx => {
        await narrow<{ model_call_content: { call: string } }>(tx)
          .deleteFrom('model_call_content')
          .where('call', '=', ref.callId)
          .execute()
      })
      await rt.runtime.close()
      await w.host.reopen()
      const cold = await runtimeOn(w, { prefix: 'cold' })
      const read = await cold.service.acquireCall({ ref, mode: 'read' })
      expect(read).toEqual({ unavailable: true })
      await cold.runtime.close()
    })
  }, 90_000)
})

describe('A22-V9 cold creation recognition by the core semantic digest (RT12 S-100/S-101)', () => {
  it('after release a fresh process recognizes the same creation (reordered/1.0) and refuses a different one', async () => {
    await withWorld(async w => {
      const rt = await runtimeOn(w)
      const parameters = {
        maxOutputTokens: 100,
        seed: new LosslessNumber('9007199254740993'),
        extra: { a: 1, b: [1, 2] },
      }
      const opened = await rt.service.openCall(rt.request('acc_v9_cold', { parameters }))
      if (!('ref' in opened)) throw new Error('open')
      const ref = opened.ref
      const dispatched = await rt.service.dispatch(ref)
      if (!('replyPending' in dispatched)) throw new Error('dispatch')
      expect(
        await rt.service.acknowledgeCall({
          ref,
          expectedResult: { kind: 'response', response: dispatched.replyPending.id },
        }),
      ).toMatchObject({ acknowledged: { cleanup: 'released' } })
      await rt.runtime.close()
      await w.host.reopen()
      const cold = await runtimeOn(w, { prefix: 'cold' })
      const same = await cold.service.openCall(
        cold.request('acc_v9_cold', {
          parameters: {
            extra: { b: [1, 2], a: new LosslessNumber('1.0') },
            seed: new LosslessNumber('9007199254740993'),
            maxOutputTokens: new LosslessNumber('100.0'),
          },
        }),
      )
      expect(same).toMatchObject({ ref, acknowledged: { ref } })
      for (const differing of [
        { ...parameters, extra: { a: 1, b: [2, 1] } },
        { ...parameters, seed: new LosslessNumber('9007199254740994') },
        { ...parameters, extra: { a: 1, b: [1, 2], c: null } },
      ])
        expect(
          await cold.service.openCall(cold.request('acc_v9_cold', { parameters: differing })),
          JSON.stringify(differing),
        ).toEqual({ creationConflict: true })
      expect(await cold.wire.sends()).toBe(0)
      await cold.runtime.close()
    })
  }, 90_000)
})

// ---------------------------------------------------------------------------------------------
// A22-V10: model-private large references after release
// ---------------------------------------------------------------------------------------------

describe('A22-V10 private references are released with the copy (RT12 S-98)', () => {
  setFlagsFromString('--expose_gc')
  const gc = runInNewContext('gc') as () => void
  async function collect(): Promise<void> {
    for (let index = 0; index < 6; index++) {
      gc()
      await new Promise(resolve => setImmediate(resolve))
    }
  }

  it('measurement control: the GC probe does collect an unreferenced object', async () => {
    let value: object | undefined = { big: new Array(1000).fill('x') }
    const weak = new WeakRef(value)
    value = undefined
    await collect()
    expect(weak.deref()).toBeUndefined()
  })

  it('after released, neither an idle consumer handle nor the runtime keeps the call container (request, pending) reachable', async () => {
    await withWorld(async w => {
      const reachable: Record<string, boolean> = {}
      // Everything the test itself holds lives in this scope and is dropped with it.
      const container = await (async () => {
        let open: (() => void) | undefined
        const gate = new Promise<void>(resolve => {
          open = resolve
        })
        const rt = await runtimeOn(w, { wire: transport({ afterContent: async () => await gate }) })
        const opened = await rt.service.openCall(rt.request('acc_v10_idle'))
        if (!('ref' in opened)) throw new Error('open')
        const ref = opened.ref
        const dispatching = rt.service.dispatch(ref)
        let consumer: { release: () => void; stopped: Promise<unknown> } | undefined
        for (let index = 0; index < 300 && consumer === undefined; index++) {
          const acquired = await rt.service.acquireCall({ ref, mode: 'wait' })
          if ('view' in acquired && acquired.consumer !== undefined) consumer = acquired.consumer
          else await new Promise(resolve => setTimeout(resolve, 10))
        }
        if (consumer === undefined) throw new Error('no live consumer')
        const weak = new WeakRef(rt.calls.find(ref) as object)
        open?.()
        const dispatched = await dispatching
        if (!('replyPending' in dispatched)) throw new Error('dispatch')
        const response = dispatched.replyPending.id
        expect(
          await rt.service.acknowledgeCall({ ref, expectedResult: { kind: 'response', response } }),
        ).toMatchObject({ acknowledged: { cleanup: 'released' } })
        expect(rt.calls.find(ref)).toBeUndefined()
        await collect()
        reachable.released = weak.deref() !== undefined
        consumer.release()
        await consumer.stopped
        consumer = undefined
        await collect()
        reachable.handleDropped = weak.deref() !== undefined
        expect(await rt.runtime.close()).toEqual({ released: true })
        await collect()
        reachable.runtimeClosed = weak.deref() !== undefined
        return weak
      })()
      await collect()
      reachable.runtimeDropped = container.deref() !== undefined
      // Measurement check: once nothing of the runtime is referenced the container is
      // collectable, so the earlier points attribute a holder instead of a GC artefact.
      expect(reachable.runtimeDropped, 'GC probe could not attribute any holder').toBe(false)
      // S-98: released means the model side no longer holds the private copy; an idle
      // caller handle must not keep it either (S-97: handles keep only ref + access entry).
      expect(reachable, 'call container reachability').toEqual({
        released: false,
        handleDropped: false,
        runtimeClosed: false,
        runtimeDropped: false,
      })
    })
  }, 90_000)
})

// ---------------------------------------------------------------------------------------------
// A22-V11 / V12: settlement after ACK with the caller's own value
// ---------------------------------------------------------------------------------------------

describe('A22-V11/V12 settleReply after release (RT12 S-99, MR11 S-46/S-47)', () => {
  it('authority first, then the retained value is required and checked; a valid value settles only through S-99⑧ staging', async () => {
    await withWorld(async w => {
      w.grant('reader', ['read', 'wait'])
      const rt = await runtimeOn(w)
      const { ref, pending } = await rt.readyCall('acc_v11_release')
      expect(
        await rt.service.acknowledgeCall({
          ref,
          expectedResult: { kind: 'response', response: pending.id },
        }),
      ).toMatchObject({ acknowledged: { cleanup: 'released' } })
      const disposition = { vetoed: { by: 'acc-gate' } }
      const before = await w.logBytes()
      const tampered: [string, PendingModelResponse][] = [
        [
          'reply text',
          {
            ...pending,
            reply: {
              ...pending.reply,
              blocks: pending.reply.blocks.map(block =>
                block.kind === 'text' ? { ...block, text: 'forged' } : block,
              ),
            },
          } as PendingModelResponse,
        ],
        ['route provider', { ...pending, route: { ...pending.route, provider: 'other' } }],
        ['usage', { ...pending, usage: { ...pending.usage, output_tokens: 2 } }],
        ['stop reason', { ...pending, stopReason: 'length' }],
        [
          'calibration',
          {
            ...pending,
            inputCalibration: {
              ...pending.inputCalibration,
              observedInput: { kind: 'unavailable', reason: 'not_retained' },
            },
          } as unknown as PendingModelResponse,
        ],
        ['dispatch', { ...pending, dispatch: 2 }],
      ]
      // current settle authority is judged before the value
      w.as('reader')
      expect(
        await rt.service.settleReply({
          ...ref,
          disposition,
          retainedResult: (tampered[0] as [string, PendingModelResponse])[1],
        }),
      ).toEqual({ unavailable: true })
      w.as('owner')
      expect(await rt.service.settleReply({ ...ref, disposition })).toEqual({
        wrongPhase: { phase: 'complete' },
      })
      for (const [name, value] of tampered)
        expect(
          await rt.service.settleReply({ ...ref, disposition, retainedResult: value }),
          name,
        ).toEqual({ invalidInput: { reason: 'malformed' } })
      expect(
        await rt.service.settleReply({
          ...ref,
          disposition: 'persisted' as never,
          retainedResult: pending,
        }),
      ).toEqual({ invalidInput: { reason: 'malformed' } })
      // Every refusal above wrote nothing.
      expect(await w.logBytes()).toBe(before)
      // Adopted after A4 (RT12 S-99⑧ staging landed in HUB d26b80a8): the original assertion
      // here expected `unavailable` because staging was not yet part of the increment
      // (A22-G2). With staging in place the checked value settles through staged work: exactly
      // one final carrying this disposition is appended and the work row is retired.
      const entriesBefore = (await w.entries()).length
      expect(
        await rt.service.settleReply({ ...ref, disposition, retainedResult: pending }),
      ).toEqual({ callId: ref.callId, state: 'complete' })
      const appended = (await w.entries()).slice(entriesBefore)
      expect(appended.map(entry => modelCategory(entry.payload))).toEqual(['response'])
      expect(payload(appended[0] as LogEntry)).toMatchObject({
        id: pending.id,
        replyDisposition: disposition,
      })
      const workRows = await w.host.storage.read(async tx =>
        narrow<{ model_call_settlement_work: { call: string } }>(tx)
          .selectFrom('model_call_settlement_work')
          .select('call')
          .where('call', '=', ref.callId)
          .execute(),
      )
      expect(workRows).toEqual([])
      // The repeat is recognized from the log without any full value (S-99⑦).
      expect(await rt.service.settleReply({ ...ref, disposition })).toEqual({
        callId: ref.callId,
        state: 'complete',
      })
      expect((await w.entries()).length).toBe(entriesBefore + 1)
      // V12: no ACK/read result carries a settle, invocation, persisted or anchored capability
      const read = await rt.service.acquireCall({ ref, mode: 'read' })
      if (!('view' in read)) throw new Error('read')
      expect(Object.keys(read).sort()).toEqual(['view'])
      expect(Object.keys(read.view).sort()).toEqual(
        ['acknowledged', 'attempts', 'origin', 'ref', 'source', 'terminalState'].sort(),
      )
      await rt.runtime.close()
    })
  }, 90_000)

  it('before ACK a caller value may only equal the authority (cold durable ready)', async () => {
    await withWorld(async w => {
      const rt = await runtimeOn(w)
      const { ref, pending } = await rt.readyCall('acc_v11_before')
      await rt.runtime.close()
      await w.host.reopen()
      const cold = await runtimeOn(w, { prefix: 'cold' })
      const disposition = { vetoed: { by: 'acc-gate' } }
      expect(
        await cold.service.settleReply({
          ...ref,
          disposition,
          retainedResult: { ...pending, stopReason: 'length' },
        }),
      ).toEqual({ invalidInput: { reason: 'malformed' } })
      expect(
        await cold.service.settleReply({ ...ref, disposition, retainedResult: pending }),
      ).toEqual({ callId: ref.callId, state: 'complete' })
      await cold.runtime.close()
    })
  }, 90_000)
})

// ---------------------------------------------------------------------------------------------
// A22-V15: CA4 S-43 per-ResponseId selection (pure selector plus the end-to-end sequence above)
// ---------------------------------------------------------------------------------------------

describe('A22-V15 per ResponseId: final > ACK witness, contradictions are not masked', () => {
  const origin = {
    tenant: unwrap(parseOpaqueIdentifier('acc-org', 'OrganizationId') as never) as never,
    session: 'acc-session',
  }
  function witness(response: string, dispatch: number, over: Record<string, unknown> = {}) {
    return {
      response,
      dispatch,
      readyPosition: 5,
      payload: { kind: 'reply_ready', locator: response, version: 'v1', digest: 'a'.repeat(64) },
      origin,
      usage: {
        input_tokens: 503,
        output_tokens: 1,
        cache_read_tokens: 0,
        cache_write_tokens: 'unknown',
        source: 'upstream',
      },
      cost: { cost_usd: new LosslessNumber('503.00'), source: 'upstream_usage' },
      credentialScope: { layer: 'factory' },
      provider: 'test',
      timing: { sentAt: CLOCK_1, firstTokenAt: CLOCK_1, endedAt: CLOCK_1 },
      outcome: 'complete',
      ...over,
    } as never
  }
  const record = (w: unknown) => ({ accountingWitness: w }) as never
  const asFinal = (attempt: ReturnType<typeof attemptFromWitness>) =>
    ({ ...attempt, disposition: 'final', replyDisposition: { vetoed: { by: 'g' } } }) as never

  it('a final equal to the witness replaces it: one account for the ResponseId', () => {
    const w1 = witness('r-1', 1)
    const attempts = acknowledgedAttempts(record(w1), [
      { response: 'r-1' as never, dispatch: 1, final: asFinal(attemptFromWitness(w1)) },
    ])
    expect(attempts).toHaveLength(1)
    expect(attempts?.[0]).toMatchObject({ response: 'r-1', disposition: 'final' })
  })

  it('a final that contradicts the witness is not hidden by final priority', () => {
    const w1 = witness('r-1', 1)
    const other = attemptFromWitness(
      witness('r-1', 1, { cost: { cost_usd: new LosslessNumber('1'), source: 'upstream_usage' } }),
    )
    expect(
      acknowledgedAttempts(record(w1), [
        { response: 'r-1' as never, dispatch: 1, final: asFinal(other) },
      ]),
    ).toBeUndefined()
  })

  it('earlier failed dispatches keep their own account; a different ResponseId is never merged by CallKey', () => {
    const failed = attemptFromWitness(witness('r-1', 1, { outcome: 'failed' }))
    const w2 = witness('r-2', 2)
    const attempts = acknowledgedAttempts(record(w2), [
      { response: 'r-1' as never, dispatch: 1, final: asFinal(failed) },
      { response: 'r-2' as never, dispatch: 2, final: null },
    ])
    expect(attempts?.map(item => [item.response, item.outcome, item.disposition])).toEqual([
      ['r-1', 'failed', 'final'],
      ['r-2', 'complete', 'disposition_pending'],
    ])
  })

  it('a dispatch with neither final nor witness, or a witness naming no dispatch, is unavailable (never an empty default)', () => {
    expect(
      acknowledgedAttempts(record(undefined), [
        { response: 'r-1' as never, dispatch: 1, final: null },
      ]),
    ).toBeUndefined()
    expect(acknowledgedAttempts(record(witness('r-9', 9)), [])).toBeUndefined()
    expect(acknowledgedAttempts(record(undefined), [])).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------
// A22-V16 review-fix rulings B1 / N1 (S1 is covered by acceptance-a22-acknowledgement.spec.ts)
// ---------------------------------------------------------------------------------------------

describe('A22-V16 review fixes B1 and N1', () => {
  it('B1: a durable ready is complete + disposition_pending on every face of a cold process; close releases; releaseCall is alreadyEnded and harmless', async () => {
    await withWorld(async w => {
      const rt = await runtimeOn(w)
      const { ref } = await rt.readyCall('acc_v16_b1')
      expect(await rt.runtime.close()).toEqual({ released: true })
      await w.host.reopen()
      const cold = await runtimeOn(w, { prefix: 'cold' })
      expect(await cold.service.acquireCall({ ref, mode: 'read' })).toMatchObject({
        view: { state: 'complete', result: { disposition: 'disposition_pending' } },
      })
      const attempts = await cold.service.readAttempts(ref)
      expect(attempts).toMatchObject({
        state: 'complete',
        dispatches: [{ result: { disposition: 'disposition_pending' } }],
      })
      const before = await w.logBytes()
      expect(await cold.service.releaseCall(ref)).toEqual({ alreadyEnded: true })
      expect(await cold.service.interrupt({ ...ref, initiator: 'user' })).toEqual({
        alreadyEnded: true,
      })
      expect(await w.logBytes()).toBe(before)
      expect(
        await cold.service.settleReply({ ...ref, disposition: { vetoed: { by: 'acc-gate' } } }),
      ).toEqual({ callId: ref.callId, state: 'complete' })
      expect(await cold.runtime.close()).toEqual({ released: true })
    })
  }, 90_000)

  it('N1 (ACK path): the ACK append and its reads over writers that stop only after requestStop neither hang nor leak a registration', async () => {
    await withWorld(async w => {
      const owner = new StopOnRequestOwner()
      owner.onRequestOnly = false
      const rt = await runtimeOn(w, { owner })
      const { ref, pending } = await rt.readyCall('acc_v16_n1_ack')
      // from here every new task of this owner stops only on request
      owner.onRequestOnly = true
      try {
        const answered = await within(
          20_000,
          rt.service.acknowledgeCall({
            ref,
            expectedResult: { kind: 'response', response: pending.id },
          }),
          'acknowledgeCall',
        )
        expect(answered).toMatchObject({ acknowledged: { cleanup: 'released' } })
        expect(owner.active, 'registrations still held after the ACK').toBe(0)
        expect(await within(20_000, rt.runtime.close(), 'runtime.close')).toEqual({
          released: true,
        })
      } finally {
        owner.stopAll()
      }
    })
  }, 90_000)

  it('N1 (all waiting points): the session selection read of the same service does not wait on a finished task it never asked to stop', async () => {
    await withWorld(async w => {
      const owner = new StopOnRequestOwner()
      const selected = w.host.create({ owner })
      try {
        const effective = await within(
          15_000,
          selected.component.effectiveModel(),
          'effectiveModel over a stop-on-request owner',
        )
        expect(effective).toHaveProperty('ok')
      } finally {
        owner.stopAll()
      }
    })
  }, 90_000)
})
