// @module-tag slow
// Actual SQLite-backed runtime admission; pure capture cases share this file for the original check.
import { describe, expect, it, vi } from 'vitest'
import type {
  DispatchResult,
  ModelObserverEndpoint,
  ModelObserverRequest,
  OpenCallInput,
} from '@omne-harness-lite/model-request-runtime'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { readJsonStrict } from '@omne-harness-lite/content-blocks'
import { brandMessage } from '@omne-harness-lite/messages'
import { ownOpenCallInput } from '../src/service-calls.ts'
import { createRuntimeAcquire } from '../src/service-acquire.ts'
import { acknowledgementHost } from './acknowledgement-host-fixture.ts'
import { deferred } from './anchored-invocation-fixture.ts'

const session = unwrap(parseOpaqueIdentifier('p5_capture_session', 'SessionRef'))
function request(): OpenCallInput {
  return {
    creationKey: unwrap(parseOpaqueIdentifier('p5_capture_creation', 'CreationKey')),
    session,
    target: 'model_a',
    basis: {
      routeName: 'model_a',
      profile: { origin: 'official', routeName: 'model_a' },
      selectedBy: 'session',
      selected: 'model_a',
    },
    messages: [],
    tools: [],
    host: {
      signal: new AbortController().signal,
      stopping: () => false,
      register: () => ({ registration: { unregister() {} } }),
    },
  }
}
function observer(owner = session): ModelObserverRequest {
  return {
    session: owner,
    endpoint: {
      open() {
        throw new Error('capture must not open a receiver')
      },
    },
    observer_max_buffered_events: 1,
    observer_max_buffered_bytes: 1000,
  }
}
const malformed = { invalidInput: { reason: 'malformed' } }
const scopeMismatch = { invalidInput: { reason: 'observer_scope_mismatch' } }
const inspect = (input: unknown) => Reflect.apply(ownOpenCallInput, undefined, [input])

describe('synchronous open request capture boundaries', () => {
  it('reports observer scope before route provenance and Run association errors', () => {
    const input = {
      ...request(),
      target: 'model_b',
      attempt: 1,
      observer: observer(unwrap(parseOpaqueIdentifier('other_session', 'SessionRef'))),
    }
    expect(inspect(input)).toEqual(scopeMismatch)
    expect(
      inspect({ ...input, observer: { ...input.observer, observer_max_buffered_events: 0 } }),
    ).toEqual(malformed)
  })
  it('reports initial host representation before reading the observer', () => {
    const getter = vi.fn(() => {
      throw new Error('observer was read')
    })
    const input = {
      ...request(),
      host: null,
      get observer() {
        return getter()
      },
    }
    expect(inspect(input)).toEqual(malformed)
    expect(getter).not.toHaveBeenCalled()
  })
  it('preserves a getter exception without converting it to invalidInput', () => {
    const failure = new Error('original host getter')
    expect(() =>
      inspect({
        ...request(),
        get host() {
          throw failure
        },
      }),
    ).toThrow(failure)
  })
  it('copies JSON while retaining host and endpoint capabilities without invoking them', () => {
    const input = request(),
      observation = observer(),
      parameters = { extra: { nested: { value: 1 } } }
    const result = ownOpenCallInput({ ...input, observer: observation, parameters })
    if (!('request' in result)) throw new Error('valid input rejected')
    parameters.extra.nested.value = 2
    expect(result.request.parameters).toEqual({ extra: { nested: { value: 1 } } })
    expect(result.request.host).toBe(input.host)
    expect(result.request.observer?.endpoint).toBe(observation.endpoint)
    expect(Object.isFrozen(result.request)).toBe(true)
    expect(Object.isFrozen(result.request.observer)).toBe(true)
    expect(Object.isFrozen(result.request.messages)).toBe(true)
    expect(Object.isFrozen(result.request.tools)).toBe(true)
  })
  it.each(['session', 'runId', 'attempt'])(
    'rejects a report with a different %s association',
    field => {
      const report = {
        session,
        runId: 'run_capture',
        attempt: 1,
        [field]: field === 'attempt' ? 2 : 'different',
      }
      expect(inspect({ ...request(), run: 'run_capture', attempt: 1, report })).toEqual(malformed)
    },
  )
  it('compares report attempts exactly and captures a valid associated report', () => {
    const parsed = readJsonStrict('1.000000000000000000001')
    if ('failed' in parsed) throw new Error('exact numeric fixture')
    expect(
      inspect({
        ...request(),
        run: 'run_capture',
        attempt: 1,
        report: { session, runId: 'run_capture', attempt: parsed.ok },
      }),
    ).toEqual(malformed)
    const report = { session, runId: 'run_capture', attempt: 1, extra: { value: 1 } }
    const result = inspect({ ...request(), run: 'run_capture', attempt: 1, report })
    expect(result).toHaveProperty('request.report', report)
    expect(result.request.report).not.toBe(report)
    report.extra.value = 2
    expect(result.request.report.extra.value).toBe(1)
  })
  it('rejects incomplete Run choice before cloning the basis', () => {
    const getter = vi.fn(() => {
      throw new Error('basis clone was attempted')
    })
    const basis = {
      ...request().basis,
      get selected() {
        return getter()
      },
    }
    expect(inspect({ ...request(), basis, run: 'run_capture' })).toEqual(malformed)
    expect(getter).not.toHaveBeenCalled()
  })
  it('requires complete tool call/result pairs and unique requested tool names', () => {
    const visibility = { toHuman: true, toModel: true },
      createdAt = '2026-09-23T10:00:00Z'
    const call = brandMessage({
      id: 'p5_assistant',
      type: 'assistant',
      response: 'p5_response',
      ending: 'complete',
      createdAt,
      blocks: [
        {
          id: 'p5_block',
          kind: 'tool_call',
          complete: true,
          callId: 'p5_tool_call',
          tool: 'invoke',
          arguments: {},
          visibility,
        },
      ],
    })
    const result = brandMessage({
      id: 'p5_tool',
      type: 'tool',
      callId: 'p5_tool_call',
      createdAt,
      blocks: [
        {
          id: 'p5_result',
          kind: 'tool_result',
          callId: 'p5_tool_call',
          outcome: 'completed',
          visibility,
          blocks: [],
        },
      ],
    })
    expect(
      ownOpenCallInput({ ...request(), messages: [call, result], tools: ['invoke'] }),
    ).toHaveProperty('request')
    for (const messages of [[call], [result], [call, call, result], [call, result, result]])
      expect(ownOpenCallInput({ ...request(), messages })).toEqual(malformed)
    expect(ownOpenCallInput({ ...request(), tools: ['invoke', 'invoke'] })).toEqual(malformed)
  })
})

describe('actual acquire input admission on SQLite-backed facts', () => {
  it('rejects malformed refs, modes and observers before Session binding', async () => {
    const world = await acknowledgementHost()
    world.grant('owner', ['read', 'wait'])
    const bind = vi.fn(world.construction.sessions.bind)
    const acquire = createRuntimeAcquire({
      ...world.construction,
      sessions: { ...world.construction.sessions, bind },
    })
    try {
      const ref = { session: world.host.session, callId: 'p5_missing' },
        validObserver = observer(world.host.session)
      const cases: unknown[] = [
        null,
        [],
        {},
        { ref: null, mode: 'read' },
        { ref: [], mode: 'read' },
        { ref: { ...ref, extra: 1 }, mode: 'read' },
        { ref: { session: ref.session }, mode: 'read' },
        {
          ref: Object.assign(Object.create({ session: ref.session }), { callId: ref.callId }),
          mode: 'read',
        },
        { ref: { ...ref, callId: '' }, mode: 'read' },
        { ref, mode: 'other' },
        { ref, mode: 'read', observer: validObserver },
        ...[
          null,
          1,
          { ...validObserver, session },
          { ...validObserver, endpoint: null },
          { ...validObserver, endpoint: { open: 1 } },
          { ...validObserver, observer_max_buffered_events: 0 },
          { ...validObserver, observer_max_buffered_bytes: -1 },
        ].map(value => ({ ref, mode: 'wait', observer: value })),
      ]
      for (const input of cases)
        expect(await Reflect.apply(acquire.acquireCall, undefined, [input])).toEqual(malformed)
      expect(bind).not.toHaveBeenCalled()
      expect(await acquire.acquireCall({ ref, mode: 'wait', observer: validObserver })).toEqual({
        callNotFound: true,
      })
      expect(bind).toHaveBeenCalledTimes(1)
    } finally {
      expect(await acquire.close()).toEqual({ released: true })
      expect(await world.runtime.close()).toEqual({ released: true })
      await world.host.close()
    }
  })
  it('keeps the captured observer method and receiver across asynchronous binding', async () => {
    const world = await acknowledgementHost(),
      entered = deferred<void>(),
      finish = deferred<void>(),
      stopped = deferred<void>()
    const originalRead = world.wire.adapter.read
    Object.assign(world.wire.adapter, {
      async *read(...args: Parameters<typeof originalRead>) {
        const iterator = originalRead(...args)
        while (true) {
          const step = await iterator.next()
          if (step.done) return step.value
          yield step.value
          if (step.value.t === 'fill') {
            entered.resolve()
            await finish.promise
          }
        }
      },
    })
    let gated = false
    const bindEntered = deferred<void>(),
      bindFinish = deferred<void>()
    const bound = await world.construction.sessions.bind(world.host.session)
    if (!('binding' in bound)) throw new Error('actual Session binding')
    const receive = vi.fn(() => ({ completion: Promise.resolve(), stopped: Promise.resolve() }))
    const receiver = { receive, stop: () => stopped.resolve(), stopped: stopped.promise }
    const open = vi.fn(function (this: ModelObserverEndpoint) {
      expect(this).toBe(endpoint)
      return receiver
    })
    const endpoint: ModelObserverEndpoint = { open }
    const authorizedRequests: ModelObserverRequest[] = []
    const binding = {
      ...bound.binding,
      observers: {
        authorize({ request: current }: { request: ModelObserverRequest }) {
          authorizedRequests.push(current)
          return {
            observer: {
              check: () => ({ valid: true as const }),
              open: (target: Parameters<typeof endpoint.open>[0]['target']) => ({
                receiver: current.endpoint.open({
                  session: world.host.session,
                  tenant: binding.log.tenant,
                  target,
                }),
              }),
              close: async () => ({ released: true as const }),
            },
          }
        },
      },
    }
    const construction = {
      ...world.construction,
      sessions: {
        ...world.construction.sessions,
        async bind() {
          if (gated) {
            bindEntered.resolve()
            await bindFinish.promise
          }
          return { binding }
        },
      },
    }
    const acquire = createRuntimeAcquire(construction)
    let dispatching: Promise<DispatchResult> | undefined
    let consumer: { release(): void; stopped: Promise<void> } | undefined
    try {
      const opened = await world.service.openCall(world.request('p5_capture_receiver'))
      if (!('ref' in opened)) throw new Error('actual creation: ' + JSON.stringify(opened))
      dispatching = world.service.dispatch(opened.ref)
      await Promise.race([
        entered.promise,
        dispatching.then(result => {
          throw new Error(
            'dispatch ended before the physical reader barrier: ' + JSON.stringify(result),
          )
        }),
      ])
      world.grant('owner', ['read', 'wait'])
      gated = true
      const pending = acquire.acquireCall({
        ref: opened.ref,
        mode: 'wait',
        observer: { ...observer(world.host.session), endpoint },
      })
      await bindEntered.promise
      const replacement = vi.fn(() => receiver)
      Object.assign(endpoint, { open: replacement })
      bindFinish.resolve()
      const acquired = await pending
      expect(acquired).toHaveProperty('consumer')
      if (!('view' in acquired) || acquired.consumer === undefined) throw new Error('live consumer')
      consumer = acquired.consumer
      expect(open).toHaveBeenCalledTimes(1)
      expect(replacement).not.toHaveBeenCalled()
      expect(authorizedRequests).toHaveLength(1)
      expect(Object.isFrozen(authorizedRequests[0])).toBe(true)
      expect(authorizedRequests[0]?.endpoint).not.toBe(endpoint)
      consumer.release()
      // Queue close polls actual receiver stop; retry this owner until that proof is available.
      await vi.waitFor(async () => expect(await acquire.close()).toEqual({ released: true }))
      await consumer.stopped
      consumer = undefined
    } finally {
      gated = false
      bindFinish.resolve()
      finish.resolve()
      consumer?.release()
      await consumer?.stopped
      await dispatching
      expect(await acquire.close()).toEqual({ released: true })
      expect(await world.runtime.close()).toEqual({ released: true })
      await world.host.close()
    }
  })
})
