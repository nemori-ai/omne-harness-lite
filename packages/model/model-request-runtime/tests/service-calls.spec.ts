import { expect, test, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { openJsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'
import { createServiceCalls, ownOpenCallInput, UnknownAppendTracker } from '../src/service-calls.ts'
import { createCallContainerStore } from '../src/service-container.ts'
import { interpretCallHistory } from '../src/call-history.ts'
import type {
  OpenCallInput,
  ModelCallHost,
  RuntimeConstruction,
  SessionRuntimeBinding,
} from '../src/service-types.ts'
import type { PlannedSemantics } from '../src/types.ts'
import type {
  DiagnosticAssociation,
  DiagnosticEvent,
  DiagnosticScope,
} from '../src/diagnostics-types.ts'
import type {
  SettlementLogBinding,
  SettlementOwner,
  SettlementRegistration,
  SettlementTask,
} from '../src/settlement-types.ts'

const session = unwrap(parseOpaqueIdentifier('session_open_call', 'SessionRef'))
const host: ModelCallHost = {
  signal: new AbortController().signal,
  stopping: () => false,
  register: () => ({ registration: { unregister() {} } }),
}

test('unknown append recognition reuses its only registration before release', async () => {
  const generation = Object.freeze({})
  const tenant = unwrap(parseTenantId({ organization: 'open-org', account: 'open-account' }))
  let readable = false
  let releaseRead = () => {}
  const readGate = new Promise<void>(resolve => {
    releaseRead = resolve
  })
  const readSince = vi.fn(async () =>
    readable ? readGate.then(() => ({ entries: [], tail: 0 })) : { failure: 'unavailable' },
  )
  const binding = {
    session,
    tenant,
    generation,
    currentGeneration: () => generation,
    log: { readSince },
  } as unknown as SettlementLogBinding
  let released = 0
  const start: SettlementRegistration['start'] = (_kind, operation) => {
    const completion = Promise.resolve().then(() => operation(new AbortController().signal))
    return { completion, stopped: completion.then(() => undefined), requestStop() {} }
  }
  const registration: SettlementRegistration = {
    start,
    release() {
      released++
    },
  }
  const acquire = vi.fn(() => ({ unavailable: true as const }))
  const owner: SettlementOwner = {
    name: 'single-slot',
    admission: () => 'open',
    acquire,
    opened: () => ({ confirmed: true }),
    unresolvedWrites: () => [],
  }
  const tracker = new UnknownAppendTracker()
  tracker.keep({ session, callId: 'unknown-call' }, binding, owner, registration, {
    completion: Promise.resolve({ failure: 'unavailable' }),
    stopped: Promise.resolve(),
    requestStop() {},
  })
  expect(await tracker.close({ concurrent: 1, call: () => ({ absent: true }) })).toEqual({
    unavailable: true,
  })
  expect(released).toBe(0)
  readable = true
  const first = tracker.close({ concurrent: 1, call: () => ({ absent: true }) })
  const concurrent = tracker.close({ concurrent: 1, call: () => ({ absent: true }) })
  expect(concurrent).toBe(first)
  await vi.waitFor(() => expect(readSince).toHaveBeenCalledTimes(2))
  expect(released).toBe(0)
  releaseRead()
  expect(await Promise.all([first, concurrent])).toEqual([{ released: true }, { released: true }])
  expect(acquire).not.toHaveBeenCalled()
  expect(readSince).toHaveBeenCalledTimes(2)
  expect(released).toBe(1)
  expect(await tracker.close({ concurrent: 1, call: () => ({ absent: true }) })).toEqual({
    released: true,
  })
  expect(released).toBe(1)
})

function request(change: Partial<OpenCallInput> = {}): OpenCallInput {
  return {
    session,
    target: 'model_a',
    basis: {
      routeName: 'model_a',
      profile: { origin: 'official', routeName: 'model_a' },
      selectedBy: 'session',
      selected: 'model_a',
    },
    parameters: { extra: { attemptTag: 'first' } },
    messages: [],
    tools: [],
    host,
    ...change,
  }
}

test('captures an owned complete request before a provider read', () => {
  const mutable = { extra: { attemptTag: 'first' } }
  const source = request({ parameters: mutable })
  const result = ownOpenCallInput(source)
  if (!('request' in result)) throw new Error('valid request rejected')
  const owned = result.request
  expect(owned).not.toBe(source)
  expect(owned.basis).not.toBe(source.basis)
  expect(owned.parameters).not.toBe(source.parameters)
  expect(owned.messages).not.toBe(source.messages)
  expect(owned.tools).not.toBe(source.tools)
  mutable.extra.attemptTag = 'later'
  expect(owned.parameters?.extra?.attemptTag).toBe('first')
})

test('rejects changed target without provenance, mismatched basis, and incomplete Run identity', () => {
  expect(ownOpenCallInput(request({ target: 'model_b' }))).toEqual({
    invalidInput: { reason: 'malformed' },
  })
  expect(
    ownOpenCallInput(
      request({
        basis: {
          routeName: 'model_a',
          profile: { origin: 'official', routeName: 'model_b' },
          selectedBy: 'session',
          selected: 'model_a',
        },
      }),
    ),
  ).toEqual({ invalidInput: { reason: 'malformed' } })
  const incomplete = { ...request(), run: 'run_a', attempt: 1 }
  expect(ownOpenCallInput(incomplete as OpenCallInput)).toEqual({
    invalidInput: { reason: 'malformed' },
  })
})

test('rejects a data-only host and malformed or cross-session observer policy before binding', () => {
  expect(ownOpenCallInput({ ...request(), host: {} } as OpenCallInput)).toEqual({
    invalidInput: { reason: 'malformed' },
  })
  const endpoint = {
    open() {
      return {
        receive: () => ({ completion: Promise.resolve(), stopped: Promise.resolve() }),
        stop() {},
        stopped: Promise.resolve(),
      }
    },
  }
  const observer = {
    session,
    endpoint,
    observer_max_buffered_events: 1,
    observer_max_buffered_bytes: 1024,
  }
  expect(
    ownOpenCallInput(request({ observer: { ...observer, observer_max_buffered_events: 0 } })),
  ).toEqual({ invalidInput: { reason: 'malformed' } })
  expect(
    ownOpenCallInput(
      request({
        observer: {
          ...observer,
          session: unwrap(parseOpaqueIdentifier('other-session', 'SessionRef')),
        },
      }),
    ),
  ).toEqual({ invalidInput: { reason: 'observer_scope_mismatch' } })
})

test('a stopped host rejects registration before any asynchronous session preparation', async () => {
  const bind = vi.fn()
  const register = vi.fn(() => ({ runtimeStopped: true as const }))
  const runtime = {
    identities: { call: () => 'stopped-call' },
    sessions: { bind },
    calls: createCallContainerStore<PlannedSemantics, never>(),
  } as unknown as RuntimeConstruction<PlannedSemantics, never>
  const service = createServiceCalls(runtime)
  expect(
    await service.openCall(
      request({
        host: {
          signal: new AbortController().signal,
          stopping: () => true,
          register,
        },
      }),
    ),
  ).toEqual({ runtimeStopped: true })
  expect(register).toHaveBeenCalledTimes(1)
  expect(bind).not.toHaveBeenCalled()
})

test('host stop during session binding prevents a late call publication and unregisters once', async () => {
  const controller = new AbortController()
  let finishBind: ((value: { readonly failure: 'unavailable' }) => void) | undefined
  const bind = vi.fn(
    () =>
      new Promise<{ readonly failure: 'unavailable' }>(resolve => {
        finishBind = resolve
      }),
  )
  const unregister = vi.fn()
  const register = vi.fn(() => ({ registration: { unregister } }))
  const calls = createCallContainerStore<PlannedSemantics, never>()
  const runtime = {
    identities: { call: () => 'late-call' },
    sessions: { bind },
    calls,
  } as unknown as RuntimeConstruction<PlannedSemantics, never>
  const pending = createServiceCalls(runtime).openCall(
    request({
      host: { signal: controller.signal, stopping: () => controller.signal.aborted, register },
    }),
  )
  expect(register).toHaveBeenCalledTimes(1)
  expect(bind).toHaveBeenCalledTimes(1)
  controller.abort()
  finishBind?.({ failure: 'unavailable' })
  expect(await pending).toEqual({ runtimeStopped: true })
  expect(unregister).toHaveBeenCalledTimes(1)
  expect(calls.find({ session, callId: 'late-call' })).toBeUndefined()
})

test('service close stops and retains a registered preparation until binding actually finishes', async () => {
  let finishBind: ((value: { readonly failure: 'unavailable' }) => void) | undefined
  const bind = vi.fn(
    () =>
      new Promise<{ readonly failure: 'unavailable' }>(resolve => {
        finishBind = resolve
      }),
  )
  const unregister = vi.fn()
  const register = vi.fn(() => ({ registration: { unregister } }))
  const calls = createCallContainerStore<PlannedSemantics, never>()
  const runtime = {
    identities: { call: () => 'closing-preparation-call' },
    sessions: { bind },
    calls,
    settlementContention: { limits: { concurrent: 1 } },
    history: { call: vi.fn() },
  } as unknown as RuntimeConstruction<PlannedSemantics, never>
  const service = createServiceCalls(runtime)
  const pending = service.openCall(
    request({ host: { signal: host.signal, stopping: () => false, register } }),
  )
  expect(bind).toHaveBeenCalledTimes(1)
  expect(await service.close()).toEqual({ unavailable: true })
  expect(unregister).not.toHaveBeenCalled()
  finishBind?.({ failure: 'unavailable' })
  expect(await pending).toEqual({ runtimeStopped: true })
  expect(unregister).toHaveBeenCalledTimes(1)
  expect(await service.close()).toEqual({ released: true })
  expect(calls.find({ session, callId: 'closing-preparation-call' })).toBeUndefined()
})

test('observer association rejects a wrong call before catalog reads or transport acquisition', async () => {
  const tenant = unwrap(parseTenantId({ organization: 'open-org', account: 'open-account' }))
  const generation = Object.freeze({})
  const logBinding = { session, tenant, generation, currentGeneration: () => generation }
  const authorize = vi.fn(() => ({ invalidInput: { reason: 'observer_scope_mismatch' as const } }))
  const catalogRead = vi.fn()
  const binding = {
    log: logBinding,
    selection: { binding: logBinding, owner: { admission: () => 'open' } },
    observers: { authorize },
    catalog: { listProfiles: catalogRead },
  } as unknown as SessionRuntimeBinding
  const acquire = vi.fn()
  const calls = createCallContainerStore<PlannedSemantics, never>()
  const runtime = {
    identities: { call: () => 'observer-call' },
    sessions: { bind: async () => ({ binding }) },
    calls,
    transport: { acquire },
  } as unknown as RuntimeConstruction<PlannedSemantics, never>
  const observer = {
    session,
    endpoint: {
      open: () => ({
        receive: () => ({ completion: Promise.resolve(), stopped: Promise.resolve() }),
        stop() {},
        stopped: Promise.resolve(),
      }),
    },
    observer_max_buffered_events: 1,
    observer_max_buffered_bytes: 1024,
  }
  expect(await createServiceCalls(runtime).openCall(request({ observer }))).toEqual({
    invalidInput: { reason: 'observer_scope_mismatch' },
  })
  expect(authorize).toHaveBeenCalledWith({
    request: observer,
    session,
    tenant,
    callId: 'observer-call',
  })
  expect(catalogRead).not.toHaveBeenCalled()
  expect(acquire).not.toHaveBeenCalled()
  expect(calls.find({ session, callId: 'observer-call' })).toBeUndefined()
})

test.each(['lease', 'invalidInput', 'unavailable'] as const)(
  'preserves transport acquisition %s against the actual empty JSONL prefix',
  async acquisition => {
    const dir = await mkdtemp(join(tmpdir(), 'mrr-open-call-'))
    const log = await openJsonlSessionLog({
      dir,
      processOwnership: {
        current: `open-call:${process.pid}`,
        async observeExit() {
          return 'unknown'
        },
      },
    })
    const tenant = unwrap(parseTenantId({ organization: 'open-org', account: 'open-account' }))
    const generation = Object.freeze({})
    const stopped: SettlementTask<unknown>[] = []
    const owner: SettlementOwner = {
      name: 'open-call-owner',
      admission: () => 'open',
      acquire: () => ({
        registration: {
          start(_kind, operation) {
            const completion = Promise.resolve().then(() => operation(new AbortController().signal))
            const task = {
              completion,
              requestStop() {},
              stopped: completion.then(
                () => undefined,
                () => undefined,
              ),
            }
            stopped.push(task)
            return task
          },
          release() {},
        },
      }),
      opened: () => ({ confirmed: true }),
      unresolvedWrites: () => [],
    }
    const logBinding = { session, tenant, log, generation, currentGeneration: () => generation }
    const profile = {
      routeName: 'model_a',
      origin: 'official',
      registration: 'listed',
      providers: ['openrouter'],
      allowFallback: false,
      inputModalities: ['text'],
      outputModalities: ['text'],
      maxInputTokens: 100,
      maxOutputTokens: 100,
      inputConstraints: {},
      upstreamInputLimits: {
        maxInputTokens: { status: 'limited', value: 100 },
        maxRequestBytes: { status: 'limited', value: 1000 },
      },
      adaptation: {
        implementation: { name: 'adapter', revision: '1' },
        definition: { modelId: 'model_a', revision: '1' },
        configuration: { revision: '1', values: {} },
      },
      updatedAt: '2026-09-28T00:00:00Z',
    }
    const catalog = {
      listProfiles: async () => [{ ref: { origin: 'official', routeName: 'model_a' }, profile }],
      credentialPresent: async () => ({ present: true, scope: { layer: 'factory' } }),
    }
    let observerClosed = 0
    const observerRequest = {
      session,
      endpoint: {
        open: () => ({
          receive: () => ({ completion: Promise.resolve(), stopped: Promise.resolve() }),
          stop() {},
          stopped: Promise.resolve(),
        }),
      },
      observer_max_buffered_events: 2,
      observer_max_buffered_bytes: 4096,
    }
    const replacementObserverRequest = {
      ...observerRequest,
      endpoint: { open: observerRequest.endpoint.open },
    }
    let forceResumable = false
    const binding = {
      log: logBinding,
      selection: {
        binding: logBinding,
        owner,
        sessionTenancy: { holdingTenant: async () => ({ tenant }) },
        compatible: () => ({ ok: true }),
        projection: async () => ({ known: [] }),
      },
      catalog,
      tools: { lookup: vi.fn() },
      observers: {
        authorize: ({ request: asked }: { request: typeof observerRequest }) => ({
          observer: {
            check: () => ({ valid: true as const }),
            open: () => ({ receiver: asked.endpoint.open() }),
            close: async () => {
              observerClosed++
              return { released: true as const }
            },
          },
        }),
      },
    } as unknown as SessionRuntimeBinding
    const calls = createCallContainerStore<PlannedSemantics, never>()
    const planned = vi.fn(input => ({ planned: { input, parameters: input.parameters } }))
    const engineering: {
      scope: DiagnosticScope
      association?: DiagnosticAssociation
      event: DiagnosticEvent
    }[] = []
    let next = 0
    const runtime = {
      sessions: { bind: async () => ({ binding }) },
      calls,
      transport: {
        acquire: () =>
          acquisition === 'invalidInput'
            ? { invalidInput: { reason: 'malformed' } }
            : acquisition === 'unavailable'
              ? { unavailable: true }
              : {
                  lease: {
                    binding: profile.adaptation,
                    transport: { plan: planned },
                    release() {},
                    signal: new AbortController().signal,
                    track: async (value: Promise<unknown>) => await value,
                  },
                },
      },
      settlementContention: {
        name: 'test',
        limits: { submissions: 1, elapsedMs: 100, retainedBytes: 1000, concurrent: 2 },
        decide: () => ({ stop: true }),
      },
      settlementScheduler: {
        nowMonotonicMs: () => 0,
        wait: () => {
          throw new Error('wait not expected')
        },
      },
      reservationWaitPolicy: { maxWaitersPerCall: 2, timeoutMs: 100 },
      tokenMargin: { multiplier: 1.25, reserveTokens: 8 },
      policy: { diagnostic() {} },
      diagnosticCollector: {
        emitter(scope: DiagnosticScope, association?: DiagnosticAssociation) {
          return {
            record(event: DiagnosticEvent) {
              engineering.push({
                scope,
                ...(association === undefined ? {} : { association }),
                event,
              })
              return {
                recorded: { collectorId: 'open-test', sequence: String(engineering.length) },
              }
            },
            close() {},
          }
        },
      },
      identities: { call: () => `call_${++next}` },
      history: {
        calibration: () => ({ noObservation: true }),
        call: (prefix: Parameters<typeof interpretCallHistory>[0]['prefix'], callId: string) =>
          forceResumable && callId === 'call_1'
            ? {
                known: {
                  session,
                  callId,
                  phase: 'resumable',
                  dispatches: [],
                  intent: null,
                  ending: null,
                },
              }
            : interpretCallHistory({ prefix, callId }),
      },
    } as unknown as RuntimeConstruction<PlannedSemantics, never>
    try {
      const service = createServiceCalls(runtime)
      const first = await service.openCall({ ...request({ observer: observerRequest }), host })
      if (acquisition !== 'lease') {
        expect(first).toEqual(
          acquisition === 'invalidInput'
            ? { invalidInput: { reason: 'malformed' } }
            : { unavailable: true },
        )
        expect(planned).not.toHaveBeenCalled()
        expect(engineering).toContainEqual({
          scope: { kind: 'tenant', tenant },
          association: expect.objectContaining({ session, call: 'call_1' }),
          event: {
            source: 'runtime',
            stage: 'binding',
            outcome: acquisition === 'invalidInput' ? 'rejected' : 'unavailable',
            facts: {
              kind: 'decision',
              cause: acquisition === 'invalidInput' ? 'malformed' : 'dependency',
            },
          },
        })
        expect(calls.find({ session, callId: 'call_1' })).toBeUndefined()
        expect(await service.close()).toEqual({ released: true })
        expect(await calls.close()).toEqual({ released: true })
        const prefix = await log.readSince(session, 0)
        if ('failure' in prefix) throw new Error(prefix.failure)
        expect(prefix.entries).toHaveLength(0)
        return
      }
      const second = await service.openCall({ ...request(), host })
      expect(first).toEqual({ callId: 'call_1', state: 'open' })
      expect(second).toEqual({ callId: 'call_2', state: 'open' })
      forceResumable = true
      expect(
        await service.openCall({
          ...request({ callId: 'call_1', observer: replacementObserverRequest }),
          host,
        }),
      ).toEqual({ callId: 'call_1', state: 'resumable' })
      forceResumable = false
      expect(calls.find({ session, callId: 'call_1' })?.view().observer?.request.endpoint).toBe(
        replacementObserverRequest.endpoint,
      )
      expect(observerClosed).toBe(1)
      expect(planned).toHaveBeenCalledTimes(2)
      expect(planned.mock.calls[0]?.[0].tokenMargin).toEqual({ multiplier: 1.25, reserveTokens: 8 })
      expect(calls.find({ session, callId: 'call_1' })).toBeDefined()
      expect(calls.find({ session, callId: 'call_2' })).toBeDefined()
      expect(
        engineering.filter(
          item => item.event.stage === 'binding' && item.event.outcome === 'accepted',
        ),
      ).toHaveLength(2)
      expect(engineering).toContainEqual({
        scope: { kind: 'tenant', tenant },
        association: expect.objectContaining({ session, call: 'call_1' }),
        event: {
          source: 'runtime',
          stage: 'binding',
          outcome: 'accepted',
          facts: { kind: 'decision' },
          binding: {
            profile: 'model_a',
            implementation: 'adapter',
            implementationRevision: '1',
            modelId: 'model_a',
            definitionRevision: '1',
            configurationRevision: '1',
          },
        },
      })
      const read = await log.readSince(session, 0)
      if ('failure' in read) throw new Error(read.failure)
      expect(read.entries).toHaveLength(0)
      expect(await calls.close()).toEqual({ released: true })
      expect(
        engineering.filter(
          item => item.event.stage === 'binding' && item.event.outcome === 'completed',
        ),
      ).toHaveLength(2)
      expect(observerClosed).toBe(2)
      const stoppedRead = await log.readSince(session, 0)
      if ('failure' in stoppedRead) throw new Error(stoppedRead.failure)
      expect(stoppedRead.entries).toHaveLength(2)
      for (const callId of ['call_1', 'call_2']) {
        const entry = stoppedRead.entries.find(item =>
          JSON.stringify(item.payload).includes(`\"call\":\"${callId}\"`),
        )
        expect(entry?.payload).toMatchObject({
          value: {
            kind: 'model_call_ended',
            call: callId,
            ending: 'interrupted',
            initiator: 'run_cancelled',
          },
        })
      }
      expect(JSON.stringify(stoppedRead.entries)).not.toContain('model_call_interrupt_intent')
      expect(await service.close()).toEqual({ released: true })
      expect(stopped.length).toBeGreaterThan(0)
    } finally {
      await log.close()
      await rm(dir, { recursive: true, force: true })
    }
  },
)
