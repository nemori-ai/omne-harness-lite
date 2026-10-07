// @module-tag slow
// 归慢层：整套装配＋真库：用例经会话选择宿主起租户、时钟与评估输入的整套装配（SQLite 文件库），并开真实 JSONL 会话日志。
/**
 * Independent acceptance 2026-09-30, T29 round 3: the one remaining N-5 waiting point
 * (verification A22-V16′, "all waits on a finished task first request the stop").
 *
 * `interrupt` of an in-flight call appends its intent; when that receipt is unknown the service
 * retains the writer and starts a background recovery that must see the writer actually stopped
 * before it reads the complete prefix. Against an owner whose tasks stop only once asked
 * (completion and actual stop are independent), a recovery that merely waits for `stopped`
 * never ends: the durable intent stays unrecognized, every later control answers
 * `unavailable`, and `runtime.close` waits on the recovery forever.
 *
 * Real assembly: SQLite Storage, JSONL SessionLog and the Cordis host of
 * tests/session-selection-fixture.ts. The only wrappers are (a) one lost receipt of an intent
 * that really lands in the JSONL log and (b) a transport that holds the stream after its first
 * content until the test opens it. Every verdict is read back from the durable log or from the
 * owner's own registration count, never from the runtime's report alone.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type { LogEntry, SessionLog } from '@omne-harness-lite/session-log'
import { createCallContainerStore } from '../src/service-container.ts'
import { createModelRuntime } from '../src/service-runtime.ts'
import { interpretCallHistory } from '@omne-harness-lite/model-request-runtime'
import { createModelCallContentStore } from '../src/reference-content.ts'
import { createModelCallFacts } from '../src/reference-facts.ts'
import type { CallAccess, CallPresence } from '@omne-harness-lite/model-request-runtime'
import type { ModelCallHost, SessionRuntimeBinding } from '@omne-harness-lite/model-request-runtime'
import type { RuntimeConstruction } from '../src/service-types.ts'
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

const rejections: unknown[] = []
process.on('unhandledRejection', reason => rejections.push(reason))
afterAll(() => expect(rejections).toEqual([]))

const messageId = unwrap(parseOpaqueIdentifier('rv3-message', 'MessageId'))

/**
 * Tasks started while `onRequestOnly` is set report `stopped` only after `requestStop`, even
 * when their completion is long settled. `stopAll` is the test's escape hatch so a detected
 * hang cannot also hang the teardown.
 */
class StopOnRequestOwner implements SettlementOwner {
  readonly name = 'rv3-stop-only-on-request'
  onRequestOnly = false
  active = 0
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
        const asked = new Promise<void>(resolve =>
          controller.signal.addEventListener('abort', () => resolve(), { once: true }),
        )
        const stopped = completion
          .then(
            () => undefined,
            () => undefined,
          )
          .then(async () => {
            if (onRequestOnly) await asked
            running--
            this.#controllers.delete(controller)
          })
        return { completion, requestStop: () => controller.abort(), stopped }
      },
      release: () => {
        if (running !== 0) throw new Error('released a live registration')
        this.active--
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

function kindOf(entry: LogEntry): unknown {
  try {
    return payload(entry).kind
  } catch {
    return undefined
  }
}

/** One production runtime over the real host; only the session-log append may be wrapped. */
async function runtimeOver(
  host: Awaited<ReturnType<typeof selectionHost>>,
  options: {
    readonly owner: SettlementOwner
    readonly wire: ReturnType<typeof transport>
    readonly append: (real: SessionLog['append']) => SessionLog['append']
  },
) {
  const selected = host.create({ owner: options.owner })
  const realLog = selected.input.binding.log
  const logBinding = {
    ...selected.input.binding,
    log: {
      append: options.append((...args) => realLog.append(...args)),
      readSince: (...args: Parameters<SessionLog['readSince']>) => realLog.readSince(...args),
      readByKey: (...args: Parameters<SessionLog['readByKey']>) => realLog.readByKey(...args),
    } satisfies SessionLog,
  }
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
                sourceVersion: 'rv3-log-v1',
                target: null,
                unknownBatches: [],
              }
            : {
                kind: 'live',
                source: input.source,
                executionGeneration: local.executionGeneration,
                sourceVersion: 'rv3-log-v1',
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
        sourceVersion: 'rv3-log-v1',
        revoked: new AbortController().signal,
      }
      return { allowed: await admitted(evidence), evidence }
    },
  }
  const binding: SessionRuntimeBinding = {
    log: logBinding,
    sourceVersions: { fixture: 'rv3-v1' },
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
          transport: options.wire.adapter,
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
      call: () => `rv3-call-${++nextCall}`,
      response: () => `rv3-response-${++nextResponse}`,
      message: () => messageId,
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
  return { runtime: createModelRuntime(construction), diagnostics }
}

describe('A22-V16′ N-5: the control recovery after an unknown intent receipt (service-control)', () => {
  it('asks the retained writer to stop before waiting: the landed intent is recognized, later control answers its stage, close neither hangs nor leaks', async () => {
    const host = await selectionHost(true, true)
    const owner = new StopOnRequestOwner()
    let reachedContent: (() => void) | undefined
    const reached = new Promise<void>(resolve => {
      reachedContent = resolve
    })
    let openStream: (() => void) | undefined
    const stream = new Promise<void>(resolve => {
      openStream = resolve
    })
    let lostIntentReceipts = 0
    const built = await runtimeOver(host, {
      owner,
      wire: transport({
        afterContent: async () => {
          reachedContent?.()
          await stream
        },
      }),
      // The first interrupt intent really lands in JSONL; only its receipt is lost.
      append: real => async (session, entries, fence, condition) => {
        const first = entries[0] as unknown as LogEntry | undefined
        const landed = await real(session, entries, fence, condition)
        if (
          lostIntentReceipts === 0 &&
          first !== undefined &&
          kindOf(first) === 'model_call_interrupt_intent' &&
          !('failure' in landed)
        ) {
          lostIntentReceipts++
          return { failure: 'unavailable' }
        }
        return landed
      },
    })
    const service = built.runtime.service
    const intents = async (callId: string): Promise<number> => {
      const log = await host.log.readSince(host.session, 0)
      if (!('entries' in log)) throw new Error('durable log unavailable')
      return log.entries.filter(
        entry => kindOf(entry) === 'model_call_interrupt_intent' && payload(entry).call === callId,
      ).length
    }
    let dispatching: Promise<unknown> | undefined
    try {
      expect(
        await service.selectModel({ session: host.session, routeName: 'example/model-a' }),
      ).toEqual({ selected: 'example/model-a' })
      const effective = await service.effectiveModel({ session: host.session })
      if (!('effectiveModel' in effective)) throw new Error('effective model')
      const opened = await service.openCall({
        creationKey: unwrap(parseOpaqueIdentifier('rv3_control_recovery', 'CreationKey')),
        session: host.session,
        target: effective.effectiveModel.routeName,
        basis: effective.effectiveModel,
        messages: [],
        tools: [],
        host: {
          signal: new AbortController().signal,
          stopping: () => false,
          register: () => ({ registration: { unregister() {} } }),
        } satisfies ModelCallHost,
      })
      if (!('ref' in opened)) throw new Error(`open: ${JSON.stringify(opened)}`)
      const ref = opened.ref
      dispatching = service.dispatch(ref)
      await within(15_000, reached, 'the stream reaching its first content')
      // From here every new task of this owner stops only once it is asked to.
      owner.onRequestOnly = true

      // 1. The intent lands, its receipt is unknown: the caller is told unavailable.
      expect(
        await within(15_000, service.interrupt({ ...ref, initiator: 'user' }), 'first interrupt'),
      ).toEqual({ unavailable: true })
      expect(lostIntentReceipts, 'the wrapper lost exactly one real intent receipt').toBe(1)
      expect(await intents(ref.callId), 'the intent really landed').toBe(1)

      // 2. The background recovery must stop the retained writer and recognize the landed
      // intent; a later interrupt then answers the durable stage without a second intent.
      let later: unknown = { unavailable: true }
      const deadline = Date.now() + 8_000
      while (Date.now() < deadline) {
        later = await within(5_000, service.interrupt({ ...ref, initiator: 'user' }), 'interrupt')
        if (!(typeof later === 'object' && later !== null && 'unavailable' in later)) break
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      expect(
        later,
        'the landed intent of the unknown receipt was never recognized (retained writer never asked to stop)',
      ).toMatchObject({ stage: expect.stringMatching(/^(in_flight|speaking)$/) })
      expect(await intents(ref.callId), 'no second intent is appended').toBe(1)

      // 3. The stream observes the interrupt; the call ends and the service closes cleanly.
      openStream?.()
      await within(15_000, dispatching, 'dispatch after the interrupt')
      expect(await within(20_000, built.runtime.close(), 'runtime.close')).toEqual({
        released: true,
      })
      expect(owner.active, 'registrations still held after close').toBe(0)
    } finally {
      owner.stopAll()
      openStream?.()
      if (dispatching !== undefined) await within(10_000, dispatching, 'teardown').catch(() => {})
      await within(10_000, built.runtime.close(), 'teardown close').catch(() => {})
      await host.close()
    }
  }, 90_000)
})
