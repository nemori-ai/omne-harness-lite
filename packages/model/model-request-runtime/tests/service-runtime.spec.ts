import { Context } from '@deepseek-ai/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis'
import { z } from 'zod'
import { createModelRuntimePlugin, MODEL_RUNTIME_SERVICE } from '../src/service-plugin.ts'
import { describe, expect, it } from 'vitest'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import type { ModelCallHost, SessionRuntimeBinding } from '../src/service-types.ts'
import { createCallContainerStore } from '../src/service-container.ts'
import { createModelRuntime } from '../src/service-runtime.ts'
import type {
  CallContainerStore,
  RuntimeConstruction,
  ModelRuntimeService,
} from '../src/service-types.ts'
import type { PlannedSemantics } from '../src/types.ts'
import { interpretCallHistory } from '../src/call-history.ts'
import { policy as invocationPolicy } from './invoke-policy-fixture.ts'
import { noWaitScheduler, policy as settlementPolicy } from './settlement-fixture.ts'
import { payload, transport, type TestPlan } from './anchored-invocation-fixture.ts'
import { selectionHost } from './session-selection-fixture.ts'

const parsed = parseOpaqueIdentifier('runtime-session', 'SessionRef')
if (!('ok' in parsed)) throw new Error('session fixture invalid')
const session = parsed.ok
const messageId = (() => {
  const value = parseOpaqueIdentifier('unused-message', 'MessageId')
  if (!('ok' in value)) throw new Error('message fixture invalid')
  return value.ok
})()

function deferred<T>() {
  let finish: ((value: T) => void) | undefined
  const promise = new Promise<T>(resolve => {
    finish = resolve
  })
  return {
    promise,
    finish(value: T) {
      if (finish === undefined) throw new Error('deferred was not created')
      finish(value)
    },
  }
}

function construction(
  input: {
    readonly store?: CallContainerStore<PlannedSemantics, never>
    readonly bind?: RuntimeConstruction<PlannedSemantics, never>['sessions']['bind']
    readonly diagnostics?: string[]
  } = {},
): RuntimeConstruction<PlannedSemantics, never> {
  return {
    maxScopes: 4,
    sessions: { bind: input.bind ?? (async () => ({ failure: 'unavailable' })) },
    calls: input.store ?? createCallContainerStore(),
    transport: { clearReuseScope() {}, acquire: () => ({ unavailable: true }) },
    settlementContention: {
      name: 'runtime-close-test',
      limits: { submissions: 1, elapsedMs: 1, retainedBytes: 1, concurrent: 1 },
      decide: () => ({ stop: true }),
    },
    settlementScheduler: {
      nowMonotonicMs: () => 0,
      wait: () => {
        throw new Error('healthy close must not schedule')
      },
    },
    policy: {
      now: () => '2026-09-28T00:00:00Z',
      schedule: () => {
        throw new Error('healthy close must not schedule')
      },
      firstContentTimeoutMs: 1,
      idleContentTimeoutMs: 1,
      statusCauseTable: {},
      credentialRedaction: {
        credential_fragment_min_length: 8,
        credential_header_names: [],
        credential_patterns: [],
      },
      diagnostic(event) {
        input.diagnostics?.push(event.kind)
      },
    },
    tokenMargin: { multiplier: 1, reserveTokens: 0 },
    identities: {
      call: () => 'unused-call',
      response: () => 'unused-response',
      message: () => messageId,
    },
    history: {
      call: () => ({ unavailable: true, reason: 'history' }),
      calibration: () => ({ sourceUnavailable: true }),
      failure: () => ({ unavailable: true }),
      run: () => ({ unavailable: true }),
    },
    reservationWaitPolicy: { maxWaitersPerCall: 1, timeoutMs: 1 },
    recovery: { enter: async () => ({ unavailable: true }) },
    diagnostic() {},
  }
}

describe('D102 unified model runtime owner', () => {
  it.each([false, true])(
    'runs the real SQLite/JSONL runtime through close (scope cleanup initially fails: %s)',
    async initiallyFails => {
      const host = await selectionHost(true, true)
      try {
        const selected = host.create()
        const registrations = new Set<Parameters<ModelCallHost['register']>[0]>()
        const callHost: ModelCallHost = {
          signal: new AbortController().signal,
          stopping: () => false,
          register(close) {
            registrations.add(close)
            return {
              registration: {
                unregister() {
                  if (!registrations.delete(close)) throw new Error('call owner released twice')
                },
              },
            }
          },
        }
        const wire = transport()
        const calls = createCallContainerStore<TestPlan, object>()
        let released = 0
        let nextCall = 0
        let holdBind = false
        let cleanupFailed = initiallyFails
        let cleanupAttempts = 0
        const bound = deferred<{ readonly binding: SessionRuntimeBinding }>()
        const binding: SessionRuntimeBinding = {
          log: selected.input.binding,
          selection: { ...selected.input, projection: async () => ({ known: [] }) },
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
        const construction: RuntimeConstruction<TestPlan, object> = {
          maxScopes: 4,
          sessions: { bind: async () => (holdBind ? await bound.promise : { binding }) },
          calls,
          transport: {
            clearReuseScope() {
              cleanupAttempts++
              expect(released).toBe(2)
              if (cleanupFailed) throw new Error('private cleanup error')
            },
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
            call: () => `runtime-call-${++nextCall}`,
            response: () => 'runtime-response',
            message: () => messageId,
          },
          history: {
            call: (prefix, callId) => interpretCallHistory({ prefix, callId }),
            calibration: () => ({ sourceUnavailable: true }),
            failure: () => ({ unavailable: true }),
            run: () => ({ unavailable: true }),
          },
          recovery: { enter: async () => ({ unavailable: true }) },
          diagnostic() {},
        }
        const runtime = createModelRuntime(construction)
        expect(
          await runtime.service.selectModel({
            session: host.session,
            routeName: 'example/model-a',
          }),
        ).toEqual({ selected: 'example/model-a' })
        const effective = await runtime.service.effectiveModel({ session: host.session })
        if (!('effectiveModel' in effective)) throw new Error('effective model absent')
        const opened = await runtime.service.openCall({
          session: host.session,
          target: effective.effectiveModel.routeName,
          basis: effective.effectiveModel,
          messages: [],
          tools: [],
          host: callHost,
        })
        expect(opened).toEqual({ callId: 'runtime-call-1', state: 'open' })
        const dispatched = await runtime.service.dispatch({
          session: host.session,
          callId: 'runtime-call-1',
        })
        expect(dispatched).toHaveProperty('replyPending')
        expect(wire.sends()).toBe(1)
        const settled = await runtime.service.settleReply({
          session: host.session,
          callId: 'runtime-call-1',
          disposition: { vetoed: { by: 'runtime-gate' } },
        })
        expect(settled).toEqual({ callId: 'runtime-call-1', state: 'complete' })
        const attempts = await runtime.service.readAttempts({
          session: host.session,
          callId: 'runtime-call-1',
        })
        expect(attempts).toMatchObject({ state: 'complete' })
        const log = await host.log.readSince(host.session, 0)
        if (!('entries' in log)) throw new Error('durable log unavailable')
        expect(log.entries.map(entry => payload(entry).kind).filter(Boolean)).toEqual([
          'model_selection_changed',
          'model_call_dispatched',
          'model_call_opened',
        ])
        expect(
          await runtime.service.openCall({
            session: host.session,
            target: effective.effectiveModel.routeName,
            basis: effective.effectiveModel,
            messages: [],
            tools: [],
            host: callHost,
          }),
        ).toEqual({ callId: 'runtime-call-2', state: 'open' })
        holdBind = true
        const lateOpen = runtime.service.openCall({
          session: host.session,
          target: effective.effectiveModel.routeName,
          basis: effective.effectiveModel,
          messages: [],
          tools: [],
          host: callHost,
        })
        let closeFinished = false
        const closing = runtime.close().then(result => {
          closeFinished = true
          return result
        })
        await Promise.resolve()
        expect(closeFinished).toBe(false)
        expect(await runtime.service.openCall({} as never)).toEqual({ runtimeStopped: true })
        bound.finish({ binding })
        expect(await lateOpen).toEqual({ runtimeStopped: true })
        expect(await closing).toEqual(initiallyFails ? { unavailable: true } : { released: true })
        expect(cleanupAttempts).toBe(1)
        if (initiallyFails) {
          cleanupFailed = false
          expect(await runtime.close()).toEqual({ released: true })
          expect(cleanupAttempts).toBe(2)
        }
        expect(await runtime.close()).toEqual({ released: true })
        expect(cleanupAttempts).toBe(initiallyFails ? 2 : 1)
        expect(released).toBe(2)
        expect(registrations.size).toBe(0)
        const closedLog = await host.log.readSince(host.session, 0)
        if (!('entries' in closedLog)) throw new Error('durable log unavailable after close')
        expect(
          closedLog.entries.filter(entry => payload(entry).kind === 'model_call_ended'),
        ).toHaveLength(1)
      } finally {
        await host.close()
      }
    },
  )

  it('composes all thirteen actual methods and closes their shared healthy owners', async () => {
    const runtime = createModelRuntime(construction())
    expect(Object.keys(runtime.service)).toHaveLength(13)
    expect(await runtime.service.effectiveModel({ session })).toEqual({ unavailable: true })
    const first = runtime.close()
    expect(runtime.close()).toBe(first)
    expect(await first).toEqual({ released: true })
    expect(await runtime.close()).toEqual({ released: true })
    expect(await runtime.service.effectiveModel({ session })).toEqual({ unavailable: true })
    expect(await runtime.service.openCall({} as never)).toEqual({ runtimeStopped: true })
    expect(await runtime.service.dispatch({} as never)).toEqual({ runtimeStopped: true })
    expect(await runtime.service.dispatchAgain({} as never)).toEqual({ runtimeStopped: true })
  })

  it('waits for an already registered operation before reporting released', async () => {
    const bound = deferred<{ readonly failure: 'unavailable' }>()
    const runtime = createModelRuntime(construction({ bind: () => bound.promise }))
    const inFlight = runtime.service.effectiveModel({ session })
    let closeFinished = false
    const closing = runtime.close().then(result => {
      closeFinished = true
      return result
    })
    await Promise.resolve()
    expect(closeFinished).toBe(false)
    bound.finish({ failure: 'unavailable' })
    expect(await inFlight).toEqual({ unavailable: true })
    expect(await closing).toEqual({ released: true })
  })

  it('retains an owner after a close exception, then retries without giving the store to another runtime', async () => {
    const actual = createCallContainerStore<PlannedSemantics, never>()
    let attempts = 0
    const store: CallContainerStore<PlannedSemantics, never> = {
      ...actual,
      close() {
        attempts++
        if (attempts === 1) return Promise.reject(new Error('close failed'))
        return actual.close()
      },
    }
    const diagnostics: string[] = []
    const config = construction({ store, diagnostics })
    const runtime = createModelRuntime(config)
    expect(() => createModelRuntime(config)).toThrow('call store already owned')
    expect(await runtime.close()).toEqual({ unavailable: true })
    expect(diagnostics).toEqual(['model_runtime.close_component_failed'])
    expect(await runtime.close()).toEqual({ released: true })
  })
})

it.each(['open', 'dispatch'] as const)(
  'D109 %s preparation keeps its exact lease until close drains the actual task',
  async phase => {
    const host = await selectionHost(true, true)
    const started = deferred<void>()
    const native = deferred<void>()
    let closing: Promise<unknown> | undefined
    const ctx = new Context()
    const closeStarted = deferred<void>()
    let ownerReleased = 0
    let cleanup: (() => Promise<void>) | undefined
    try {
      const selected = host.create()
      const wire = transport()
      let block = phase === 'open'
      let planSignal: AbortSignal | undefined
      let tracked = 0
      let released = 0
      const seenScopes: object[] = []
      const clearedScopes: object[] = []
      const active = new Set<Promise<unknown>>()
      const binding: SessionRuntimeBinding = {
        log: selected.input.binding,
        selection: { ...selected.input, projection: async () => ({ known: [] }) },
        catalog: host.catalog,
        currentEvaluationInputs: host.reader,
        credentials: {
          value: async () => ({
            scope: { layer: 'factory' },
            value: new TextEncoder().encode('test-secret'),
          }),
        },
        tools: {
          lookup: async () => {
            throw new Error('no tools requested')
          },
        },
      }
      const base = construction()
      const runtime = createModelRuntime<TestPlan, object>({
        ...base,
        maxScopes: 4,
        sessions: { bind: async () => ({ binding }) },
        calls: createCallContainerStore(),
        settlementContention: settlementPolicy(),
        settlementScheduler: noWaitScheduler,
        policy: { ...invocationPolicy(), schedule: () => () => {} },
        reservationWaitPolicy: { maxWaitersPerCall: 2, timeoutMs: 100 },
        history: {
          ...base.history,
          call: (prefix, callId) => interpretCallHistory({ prefix, callId }),
        },
        transport: {
          clearReuseScope(scope) {
            expect(active.size).toBe(0)
            expect(released).toBe(1)
            clearedScopes.push(scope)
          },
          acquire: binding => ({
            lease: {
              binding,
              signal: new AbortController().signal,
              transport: {
                ...wire.adapter,
                async plan(input, execution) {
                  if (execution.reuseScope === undefined) throw new Error('scope absent')
                  seenScopes.push(execution.reuseScope)
                  if (block) {
                    planSignal = execution.signal
                    started.finish()
                    await native.promise
                  }
                  return wire.adapter.plan(input, execution)
                },
              },
              async track<T>(completion: Promise<T>) {
                tracked++
                active.add(completion)
                try {
                  return await completion
                } finally {
                  active.delete(completion)
                }
              },
              release() {
                expect(active.size).toBe(0)
                released++
              },
            },
          }),
        },
      })
      const dependencies = await ctx.plugin(
        definePlugin({
          name: 'planning-owner-dependencies',
          Config: z.object({}).strict(),
          apply(inner) {
            for (const name of [
              'sessionLog',
              'modelCatalogRead',
              'credentialLookup',
              'modelTransport',
              'storage',
              'clock',
            ])
              inner.provide(name, {})
          },
        }),
        {},
      )
      const consumer = await ctx.plugin(
        createModelRuntimePlugin({
          construct: async () => ({
            service: runtime.service,
            owner: {
              close: () => {
                closeStarted.finish()
                return runtime.close()
              },
              release: () => {
                ownerReleased++
              },
            },
          }),
        }),
        {},
      )
      await consumer.await()
      cleanup = async () => {
        await consumer.dispose()
        await dependencies.dispose()
      }
      const offered: unknown = ctx.get(MODEL_RUNTIME_SERVICE)
      if (!isRuntimeService(offered)) throw new Error('real Cordis service absent')
      const service = offered
      const callHost: ModelCallHost = {
        signal: new AbortController().signal,
        stopping: () => false,
        register: () => ({ registration: { unregister() {} } }),
      }
      await service.selectModel({ session: host.session, routeName: 'example/model-a' })
      const effective = await service.effectiveModel({ session: host.session })
      if (!('effectiveModel' in effective)) throw new Error('effective model absent')
      const opening = service.openCall({
        session: host.session,
        target: effective.effectiveModel.routeName,
        basis: effective.effectiveModel,
        messages: [],
        tools: [],
        host: callHost,
      })
      const operation =
        phase === 'open'
          ? opening
          : opening.then(async opened => {
              if (!('callId' in opened)) throw new Error('call not opened')
              block = true
              return service.dispatch({ session: host.session, callId: opened.callId })
            })
      await started.promise
      expect(tracked).toBeGreaterThan(0)
      let closed = false
      closing = consumer.dispose().then(async () => {
        const result = await runtime.close()
        closed = true
        return result
      })
      await closeStarted.promise
      expect(planSignal?.aborted).toBe(true)
      expect(closed).toBe(false)
      expect(released).toBe(0)
      expect(clearedScopes).toEqual([])
      expect(new Set(seenScopes).size).toBe(1)
      expect(wire.sends()).toBe(0)
      native.finish()
      await operation
      expect(await closing).toEqual({ released: true })
      expect(released).toBe(1)
      expect(ownerReleased).toBe(1)
      expect(clearedScopes).toEqual([seenScopes[0]])
      expect(wire.sends()).toBe(0)
      expect(await runtime.close()).toEqual({ released: true })
      expect(released).toBe(1)
    } finally {
      native.finish()
      await closing
      await cleanup?.()
      await host.close()
    }
  },
)

function isRuntimeService(value: unknown): value is ModelRuntimeService {
  if (value === null || typeof value !== 'object') return false
  return [
    'legalTargets',
    'displayList',
    'effectiveModel',
    'selectModel',
    'openCall',
    'dispatch',
    'dispatchAgain',
    'interrupt',
    'releaseCall',
    'reconcile',
    'readAttempts',
    'settleReply',
    'canDispatchAgain',
  ].every(name => name in value && typeof Reflect.get(value, name) === 'function')
}
