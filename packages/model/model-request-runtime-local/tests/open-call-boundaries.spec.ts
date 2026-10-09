// @module-tag slow
// Real SQLite and SQL journal with original provider completion and host stop barriers.
import { expect, it, vi } from 'vitest'
import type {
  OpenCallResult,
  PlanFailure,
  RuntimeCloseResult,
  ModelObserverRequest,
  SessionRuntimeBinding,
} from '@omne-harness-lite/model-request-runtime'
import {
  captureModelLogValue,
  prepareModelLogEntry,
} from '@omne-harness-lite/model-request-runtime'
import type {
  CallContainerStore,
  CallContainer,
  CallReservation,
  RuntimeConstruction,
} from '../src/service-types.ts'
import { createCallContainerStore } from '../src/service-container.ts'
import { createModelRuntime } from '../src/service-runtime.ts'
import { createServiceCalls } from '../src/service-calls.ts'
import { referencePorts } from './reference-ports-fixture.ts'
import { profile } from './session-selection-fixture.ts'
import type { TestPlan } from './anchored-invocation-fixture.ts'
import { acknowledgementHost, kinds } from './acknowledgement-host-fixture.ts'
import { deferred } from './settlement-fixture.ts'
import { modelValue } from './log-codec-fixture.ts'

async function adoptionHost(cold: boolean) {
  const h = await acknowledgementHost({ originalInvocation: () => ({ absent: true }) })
  expect(await h.runtime.close()).toEqual({ released: true })
  const actual = createCallContainerStore<TestPlan, object>()
  let insertMode: 'normal' | 'refuse' | 'accepted then throw' = 'normal'
  let releases = 0
  let acquisitions = 0
  let catalogReads = 0
  let failObserverClose = false
  let failLeaseRelease = false
  const observerCloses = new Map<ModelObserverRequest['endpoint'], number>()
  const acquisitionArguments: Array<
    Parameters<RuntimeConstruction<TestPlan, object>['transport']['acquire']>
  > = []
  let originalReservation: CallReservation<TestPlan, object> | undefined
  let candidate: CallContainer<TestPlan, object> | undefined
  const trace: string[] = []
  const calls: CallContainerStore<TestPlan, object> = {
    find(key) {
      expect(this).toBe(calls)
      return actual.find(key)
    },
    reserve(key) {
      expect(this).toBe(calls)
      return actual.reserve(key)
    },
    async waitReserve(key, input) {
      expect(this).toBe(calls)
      const gate = await actual.waitReserve(key, input)
      if ('reservation' in gate) originalReservation = gate.reservation
      return gate
    },
    insert(reservation, prepared) {
      expect(this).toBe(calls)
      expect(reservation).toBe(originalReservation)
      expect(releases).toBe(0)
      candidate = prepared
      trace.push('insert')
      if (insertMode === 'refuse') return false
      const accepted = actual.insert(reservation, prepared)
      expect(accepted).toBe(true)
      if (insertMode === 'accepted then throw')
        throw new Error('accepted insertion lost its return')
      return accepted
    },
    remove(reservation) {
      expect(this).toBe(calls)
      return actual.remove(reservation)
    },
    close() {
      expect(this).toBe(calls)
      return actual.close()
    },
  }
  const bound = await h.construction.sessions.bind(h.host.session)
  if (!('binding' in bound)) throw new Error('original session binding')
  const original = bound.binding
  const binding: SessionRuntimeBinding = {
    ...original,
    catalog: {
      listProfiles(...args) {
        catalogReads++
        return original.catalog.listProfiles(...args)
      },
      readProfile(...args) {
        catalogReads++
        return original.catalog.readProfile(...args)
      },
      credentialPresent(...args) {
        catalogReads++
        return original.catalog.credentialPresent(...args)
      },
    },
    observers: {
      authorize({ request, callId }) {
        return {
          observer: {
            check(target) {
              return target.callId === callId ? { valid: true } : { unavailable: true }
            },
            open(target) {
              return {
                receiver: request.endpoint.open({
                  session: h.host.session,
                  tenant: h.host.tenant,
                  target,
                }),
              }
            },
            async close() {
              observerCloses.set(request.endpoint, (observerCloses.get(request.endpoint) ?? 0) + 1)
              return failObserverClose ? { unavailable: true } : { released: true }
            },
          },
        }
      },
    },
  }
  const runtime = createModelRuntime({
    ...h.construction,
    ...referencePorts(h.host, calls),
    calls,
    sessions: { bind: async () => ({ binding }) },
    transport: {
      clearReuseScope(scope) {
        h.construction.transport.clearReuseScope(scope)
      },
      acquire(...args) {
        acquisitions++
        acquisitionArguments.push(args)
        const acquired = h.construction.transport.acquire(...args)
        if (!('lease' in acquired)) return acquired
        const lease = acquired.lease
        return {
          lease: {
            ...lease,
            release() {
              trace.push('lease released')
              releases++
              lease.release()
              if (failLeaseRelease) throw new Error('original lease release failed')
            },
          },
        }
      },
    },
  })
  const callId = 'boundary-durable-call'
  const adopted = profile('example/model-a')
  const { origin, routeName, registration: _registration, ...snapshot } = adopted
  const anchor = {
    profile: { origin, routeName },
    snapshot,
    adaptation: adopted.adaptation,
    parameters: { maxOutputTokens: 128 },
    selectedBy: 'session',
  }
  if (cold) {
    const captured = captureModelLogValue({
      category: 'record',
      input: {
        kind: 'value',
        value: {
          kind: 'model_call_dispatched',
          call: callId,
          dispatch: 1,
          response: 'boundary-lost-response',
          adaptation: adopted.adaptation,
          profile: { origin, routeName },
          profileSnapshot: snapshot,
          provider: 'test',
          selectedBy: 'session',
          credentialScope: { layer: 'factory' },
          parameters: { maxOutputTokens: 128 },
        },
      },
    })
    if (!('ok' in captured)) throw new Error('durable dispatch capture')
    const prepared = prepareModelLogEntry({
      session: h.host.session,
      shell: { tenant: h.host.tenant },
      captured: captured.ok,
      purpose: { kind: 'record' },
      messagePrefix: [],
    })
    if (!('ok' in prepared)) throw new Error('durable dispatch entry')
    const appended = await h.host.log.append(
      h.host.session,
      [prepared.ok],
      { kind: 'unfenced' },
      { kind: 'unconditional' },
    )
    if ('failure' in appended) throw new Error('durable dispatch publication')
    expect(await runtime.service.reconcile({ session: h.host.session })).toEqual({
      calls: [{ callId, state: 'resumable' }],
    })
  }
  return {
    h,
    runtime,
    actual,
    binding,
    trace,
    anchor,
    acquisitionArguments,
    request: () => h.request('boundary-adoption', cold ? { callId } : {}),
    setInsertMode(value: typeof insertMode) {
      insertMode = value
    },
    releases: () => releases,
    acquisitions: () => acquisitions,
    catalogReads: () => catalogReads,
    candidate: () => candidate,
    originalReservation: () => originalReservation,
    setObserverFailure(value: boolean) {
      failObserverClose = value
    },
    setLeaseReleaseFailure(value: boolean) {
      failLeaseRelease = value
    },
    observerCloseCalls(endpoint: ModelObserverRequest['endpoint']) {
      return observerCloses.get(endpoint) ?? 0
    },
  }
}

const refusals: readonly {
  readonly name: string
  readonly failure: PlanFailure
  readonly expected: OpenCallResult
}[] = [
  { name: 'unavailable', failure: { rejected: 'unavailable' }, expected: { unavailable: true } },
  {
    name: 'malformed',
    failure: { rejected: 'invalidInput', reason: 'malformed' },
    expected: { invalidInput: { reason: 'malformed' } },
  },
  {
    name: 'orphan tool call',
    failure: { rejected: 'orphan_tool_call' },
    expected: { invalidInput: { reason: 'malformed' } },
  },
  {
    name: 'internal tool',
    failure: { rejected: 'tool_internal_in_request' },
    expected: { invalidInput: { reason: 'malformed' } },
  },
  {
    name: 'missing input limit',
    failure: {
      rejected: 'invalidInput',
      reason: 'input_limit_missing',
      metrics: ['maxRequestBytes', 'maxInputTokens'],
    },
    expected: {
      invalidInput: {
        reason: 'input_limit_missing',
        metrics: ['maxRequestBytes', 'maxInputTokens'],
      },
    },
  },
  {
    name: 'unavailable measurement',
    failure: {
      rejected: 'invalidInput',
      reason: 'input_size_unavailable',
      metrics: ['maxImageBytes'],
    },
    expected: { invalidInput: { reason: 'input_size_unavailable', metrics: ['maxImageBytes'] } },
  },
  {
    name: 'exact limit',
    failure: {
      rejected: 'invalidInput',
      reason: 'input_limit_exceeded',
      basis: 'exact',
      metric: 'maxRequestBytes',
      actual: 11,
      limit: 10,
    },
    expected: {
      invalidInput: {
        reason: 'input_limit_exceeded',
        basis: 'exact',
        metric: 'maxRequestBytes',
        actual: 11,
        limit: 10,
      },
    },
  },
  {
    name: 'estimated limit',
    failure: {
      rejected: 'invalidInput',
      reason: 'input_limit_exceeded',
      basis: 'estimated',
      metric: 'maxInputTokens',
      estimatedTokens: 9,
      admissionTokens: 12,
      limit: 10,
    },
    expected: {
      invalidInput: {
        reason: 'input_limit_exceeded',
        basis: 'estimated',
        metric: 'maxInputTokens',
        estimatedTokens: 9,
        admissionTokens: 12,
        limit: 10,
      },
    },
  },
]

it.each(refusals)(
  'open retains the original $name refusal and performs no publication',
  async ({ name, failure, expected }) => {
    const h = await acknowledgementHost()
    const entries = await h.entries()
    const plan = vi.spyOn(h.wire.adapter, 'plan').mockResolvedValue(failure)
    let unregisters = 0
    try {
      const request = h.request(`open-refusal-${name}`, {
        host: {
          signal: new AbortController().signal,
          stopping: () => false,
          register: () => ({
            registration: {
              unregister() {
                unregisters++
              },
            },
          }),
        },
      })
      expect(await h.service.openCall(request)).toEqual(expected)
      expect(plan).toHaveBeenCalledTimes(1)
      expect(await h.entries()).toEqual(entries)
      expect(h.wire.sends()).toBe(0)
      expect(h.runtime.executionSource.snapshot(h.host.session)).toEqual([])
      expect(unregisters).toBe(1)
    } finally {
      plan.mockRestore()
      expect(await h.runtime.close()).toEqual({ released: true })
      await h.host.close()
    }
  },
)

it('open modality refusal appends the original ended record without created content or send', async () => {
  const h = await acknowledgementHost()
  const before = await h.entries()
  const plan = vi
    .spyOn(h.wire.adapter, 'plan')
    .mockResolvedValue({ rejected: 'modality_not_carried' })
  try {
    const result = await h.service.openCall(h.request('open-modality-refusal'))
    expect(result).toMatchObject({ state: 'handed_up', undispatched: 'modality_mismatch' })
    if (!('callId' in result)) throw new Error('original undispatched call ID')
    const entries = await h.entries()
    expect(entries.slice(0, before.length)).toEqual(before)
    expect(kinds(entries.slice(before.length))).toEqual(['model_call_ended'])
    expect(await h.contentRows(result.callId)).toBe(0)
    expect(h.runtime.executionSource.snapshot(h.host.session)).toEqual([])
    expect(h.wire.sends()).toBe(0)
  } finally {
    plan.mockRestore()
    expect(await h.runtime.close()).toEqual({ released: true })
    await h.host.close()
  }
})

it.each(['complete', 'reject'] as const)(
  'a broken planning tracker waits for the original provider to %s before release',
  async outcome => {
    const h = await acknowledgementHost()
    const entered = deferred<void>()
    const native = deferred<void>()
    const originalPlan = h.wire.adapter.plan.bind(h.wire.adapter)
    const originalAcquire = h.construction.transport.acquire.bind(h.construction.transport)
    const trace: string[] = []
    const trackingError = new Error('original tracker failed')
    const before = await h.entries()
    let releases = 0
    let unregisters = 0
    let openDone = false
    let closeDone = false
    let opening: Promise<OpenCallResult> | undefined
    let closing: Promise<RuntimeCloseResult> | undefined
    const plan = vi.spyOn(h.wire.adapter, 'plan').mockImplementation(async (input, execution) => {
      entered.resolve()
      await native.promise
      trace.push('native stopped')
      if (outcome === 'reject') throw new Error('native provider failure')
      return await originalPlan(input, execution)
    })
    const acquire = vi.spyOn(h.construction.transport, 'acquire').mockImplementation((...args) => {
      const result = originalAcquire(...args)
      if (!('lease' in result)) return result
      const lease = result.lease
      return {
        lease: {
          ...lease,
          track<T>(_completion: Promise<T>): Promise<T> {
            trace.push('track failed')
            throw trackingError
          },
          release() {
            trace.push('lease released')
            releases++
            lease.release()
          },
        },
      }
    })
    try {
      opening = h.service
        .openCall(
          h.request(`open-broken-track-${outcome}`, {
            host: {
              signal: new AbortController().signal,
              stopping: () => false,
              register: () => ({
                registration: {
                  unregister() {
                    unregisters++
                  },
                },
              }),
            },
          }),
        )
        .then(result => {
          openDone = true
          return result
        })
      await entered.promise
      closing = h.runtime.close().then(result => {
        closeDone = true
        return result
      })
      await new Promise<void>(resolve => setImmediate(resolve))
      expect(trace).toEqual(['track failed'])
      expect(openDone).toBe(false)
      expect(closeDone).toBe(false)
      expect(releases).toBe(0)
      expect(unregisters).toBe(0)
      expect(await h.entries()).toEqual(before)
      native.resolve()
      expect(await opening).toEqual({ runtimeStopped: true })
      expect(await closing).toEqual({ released: true })
      expect(trace).toEqual(['track failed', 'native stopped', 'lease released'])
      expect(releases).toBe(1)
      expect(unregisters).toBe(1)
      expect(await h.entries()).toEqual(before)
      expect(h.wire.sends()).toBe(0)
    } finally {
      native.resolve()
      await opening
      await closing
      plan.mockRestore()
      acquire.mockRestore()
      expect(await h.runtime.close()).toEqual({ released: true })
      await h.host.close()
    }
  },
)

it.each(['host stop', 'generation changed'] as const)(
  'open rechecks the original %s after now before publishing',
  async change => {
    const h = await acknowledgementHost()
    const entered = deferred<void>()
    const finish = deferred<void>()
    const controller = new AbortController()
    const originalNow = h.construction.policy.now.bind(h.construction.policy)
    const before = await h.entries()
    let pending: Promise<OpenCallResult> | undefined
    const now = vi.spyOn(h.construction.policy, 'now').mockImplementation(async () => {
      entered.resolve()
      await finish.promise
      return await originalNow()
    })
    try {
      pending = h.service.openCall(
        h.request(`open-now-${change}`, {
          host: {
            signal: controller.signal,
            stopping: () => controller.signal.aborted,
            register: () => ({ registration: { unregister() {} } }),
          },
        }),
      )
      await entered.promise
      if (change === 'host stop') controller.abort()
      else await h.host.replaceGeneration()
      finish.resolve()
      expect(await pending).toEqual(
        change === 'host stop' ? { runtimeStopped: true } : { unavailable: true },
      )
      expect(await h.entries()).toEqual(before)
      expect(h.runtime.executionSource.snapshot(h.host.session)).toEqual([])
      expect(h.wire.sends()).toBe(0)
    } finally {
      finish.resolve()
      await pending
      now.mockRestore()
      expect(await h.runtime.close()).toEqual({ released: true })
      await h.host.close()
    }
  },
)

it.each([
  { cold: false, mode: 'refuse' },
  { cold: false, mode: 'accepted then throw' },
  { cold: true, mode: 'refuse' },
  { cold: true, mode: 'accepted then throw' },
] as const)(
  'open keeps original adoption cleanup cold=$cold insert=$mode',
  async ({ cold, mode }) => {
    const f = await adoptionHost(cold)
    const before = await f.h.entries()
    let unregisters = 0
    f.setInsertMode(mode)
    try {
      const request = {
        ...f.request(),
        host: {
          signal: new AbortController().signal,
          stopping: () => false,
          register: () => ({
            registration: {
              unregister() {
                f.trace.push('unregister')
                unregisters++
              },
            },
          }),
        },
      }
      expect(await f.runtime.service.openCall(request)).toEqual({ unavailable: true })
      const candidate = f.candidate()
      const reservation = f.originalReservation()
      if (candidate === undefined || reservation === undefined)
        throw new Error('original insertion objects')
      expect(candidate.view().request.host).toBe(request.host)
      expect(f.trace).toEqual(['insert', 'lease released', 'unregister'])
      expect(f.releases()).toBe(1)
      expect(unregisters).toBe(1)
      expect(candidate.canRemove()).toBe(true)
      const next = f.actual.reserve(candidate.key)
      expect(next).toHaveProperty('reservation')
      if (!('reservation' in next)) throw new Error('original reservation not released')
      next.reservation.release()
      if (mode === 'refuse')
        expect(f.runtime.executionSource.snapshot(f.h.host.session)).toEqual([])
      else
        expect(f.runtime.executionSource.lookup(candidate.key)).toMatchObject({
          execution: {
            released: true,
            registered: true,
            executionGeneration: candidate.view().executionGeneration,
          },
        })
      expect(f.acquisitions()).toBe(1)
      expect(f.h.wire.plans()).toBe(cold ? 0 : 1)
      expect(f.catalogReads()).toBe(cold ? 0 : 2)
      expect(f.h.wire.sends()).toBe(0)
      const entries = await f.h.entries()
      expect(entries.slice(0, before.length)).toEqual(before)
      expect(kinds(entries.slice(before.length))).toEqual(
        cold ? ['model_call_ended'] : ['model_call_created', 'model_call_ended'],
      )
      const ended = entries.at(-1)
      if (ended === undefined) throw new Error('original stop record')
      expect(modelValue(ended.payload)).toEqual({
        kind: 'model_call_ended',
        call: candidate.key.callId,
        ending: 'interrupted',
        initiator: 'run_cancelled',
      })
    } finally {
      expect(await f.runtime.close()).toEqual({ released: true })
      await f.h.host.close()
    }
  },
)

it('a cold resume keeps the exact durable binding and performs no catalog or planning work', async () => {
  const f = await adoptionHost(true)
  const before = await f.h.entries()
  try {
    const request = { ...f.request(), parameters: { maxOutputTokens: 1 } }
    const opened = await f.runtime.service.openCall(request)
    expect(opened).toEqual({
      ref: { session: f.h.host.session, callId: 'boundary-durable-call' },
      callId: 'boundary-durable-call',
      state: 'resumable',
    })
    const original = f.candidate()
    if (original === undefined) throw new Error('original durable container')
    const view = original.view()
    expect(view.binding.profile).toEqual(f.anchor.profile)
    expect(view.binding.snapshot).toEqual(f.anchor.snapshot)
    expect(view.binding.parameters).toEqual(f.anchor.parameters)
    expect(view.binding.selectedBy).toBe(f.anchor.selectedBy)
    expect(view.request.parameters).toEqual({ maxOutputTokens: 1 })
    expect(f.acquisitionArguments).toEqual([[f.anchor.adaptation, f.anchor.profile.routeName]])
    expect(f.catalogReads()).toBe(0)
    expect(f.h.wire.plans()).toBe(0)
    expect(f.h.wire.sends()).toBe(0)
    expect(await f.h.entries()).toEqual(before)
    expect(f.releases()).toBe(0)
  } finally {
    expect(await f.runtime.close()).toEqual({ released: true })
    expect(f.releases()).toBe(1)
    await f.h.host.close()
  }
})

it('local observer replacement retains failed cleanup and retries it without a new lease', async () => {
  const f = await adoptionHost(true)
  const endpoint: ModelObserverRequest['endpoint'] = {
    open() {
      throw new Error('resume cannot open an observer receiver')
    },
  }
  const nextEndpoint: ModelObserverRequest['endpoint'] = {
    open() {
      throw new Error('resume cannot open a replacement receiver')
    },
  }
  const observer: ModelObserverRequest = {
    session: f.h.host.session,
    endpoint,
    observer_max_buffered_events: 2,
    observer_max_buffered_bytes: 4096,
  }
  const replacement: ModelObserverRequest = { ...observer, endpoint: nextEndpoint }
  const request = { ...f.request(), observer }
  try {
    const first = await f.runtime.service.openCall(request)
    expect(first).toHaveProperty('ref')
    if (!('ref' in first)) throw new Error('original resumable call')
    const original = f.actual.find(first.ref)
    if (original === undefined) throw new Error('original local container')
    const before = await f.h.entries()
    f.setObserverFailure(true)
    expect(await f.runtime.service.openCall({ ...request, observer: replacement })).toEqual({
      unavailable: true,
    })
    expect(original.view().observerReplacementPending).toBe(true)
    expect(original.view().observer?.request.endpoint).toBe(endpoint)
    expect(f.observerCloseCalls(endpoint)).toBe(1)
    expect(f.observerCloseCalls(nextEndpoint)).toBe(1)
    f.setObserverFailure(false)
    expect(await f.runtime.service.openCall({ ...request, observer: replacement })).toEqual(first)
    expect(original.view().observerReplacementPending).toBe(false)
    expect(original.view().observer?.request.endpoint).toBe(nextEndpoint)
    expect(f.observerCloseCalls(endpoint)).toBe(2)
    expect(f.observerCloseCalls(nextEndpoint)).toBe(2)
    expect(f.actual.find(first.ref)).toBe(original)
    expect(f.acquisitions()).toBe(1)
    expect(f.catalogReads()).toBe(0)
    expect(f.h.wire.plans()).toBe(0)
    expect(f.h.wire.sends()).toBe(0)
    expect(f.releases()).toBe(0)
    expect(await f.h.entries()).toEqual(before)
  } finally {
    f.setObserverFailure(false)
    const closed = await f.runtime.close()
    await f.h.host.close()
    expect(closed).toEqual({ released: true })
    expect(f.observerCloseCalls(nextEndpoint)).toBe(3)
    expect(f.releases()).toBe(1)
  }
})

it('recognition clears creation busy before preparation unregister reenters the same key', async () => {
  const h = await acknowledgementHost()
  const request = h.request('cleanup-reentry')
  let nested: Promise<OpenCallResult> | undefined
  let unregisters = 0
  try {
    const first = await h.service.openCall(request)
    expect(first).toHaveProperty('ref')
    const before = await h.entries()
    const result = await h.service.openCall({
      ...request,
      host: {
        signal: new AbortController().signal,
        stopping: () => false,
        register: () => ({
          registration: {
            unregister() {
              unregisters++
              expect(nested).toBeUndefined()
              nested = h.service.openCall(request)
            },
          },
        }),
      },
    })
    expect(result).toEqual(first)
    expect(nested).toBeDefined()
    expect(await nested).toEqual(first)
    expect(unregisters).toBe(1)
    expect(h.wire.plans()).toBe(1)
    expect(h.wire.sends()).toBe(0)
    expect(await h.entries()).toEqual(before)
  } finally {
    expect(await h.runtime.close()).toEqual({ released: true })
    await h.host.close()
  }
})

it('a host stop after actual created append keeps its durable publication and same-key recognition', async () => {
  const abort = new AbortController()
  let stopped = false
  const h = await acknowledgementHost({
    append:
      real =>
      async (...args) => {
        const result = await real(...args)
        if (
          !stopped &&
          args[1].some(entry => {
            const record = modelValue(entry.payload)
            return (
              record !== null &&
              typeof record === 'object' &&
              'kind' in record &&
              record.kind === 'model_call_created'
            )
          })
        ) {
          stopped = true
          abort.abort()
        }
        return result
      },
  })
  const request = h.request('publication-host-stop', {
    host: {
      signal: abort.signal,
      stopping: () => abort.signal.aborted,
      register: () => ({ registration: { unregister() {} } }),
    },
  })
  try {
    expect(await h.service.openCall(request)).toEqual({ runtimeStopped: true })
    expect(stopped).toBe(true)
    const before = await h.entries()
    expect(kinds(before).filter(kind => kind === 'model_call_created')).toHaveLength(1)
    const recognized = await h.service.openCall({
      ...request,
      host: {
        signal: new AbortController().signal,
        stopping: () => false,
        register: () => ({ registration: { unregister() {} } }),
      },
    })
    expect(recognized).toHaveProperty('ref')
    expect(h.wire.plans()).toBe(1)
    expect(h.wire.sends()).toBe(0)
    expect(await h.entries()).toEqual(before)
  } finally {
    expect(await h.runtime.close()).toEqual({ released: true })
    await h.host.close()
  }
})

it('a throwing original lease release takes precedence over a planner refusal', async () => {
  const f = await adoptionHost(false)
  const plan = vi
    .spyOn(f.h.wire.adapter, 'plan')
    .mockResolvedValue({ rejected: 'invalidInput', reason: 'malformed' })
  f.setLeaseReleaseFailure(true)
  const before = await f.h.entries()
  try {
    expect(await f.runtime.service.openCall(f.request())).toEqual({ unavailable: true })
    expect(f.releases()).toBe(1)
    expect(f.candidate()).toBeUndefined()
    expect(await f.h.entries()).toEqual(before)
    expect(f.h.wire.sends()).toBe(0)
  } finally {
    f.setLeaseReleaseFailure(false)
    plan.mockRestore()
    expect(await f.runtime.close()).toEqual({ released: true })
    await f.h.host.close()
  }
})

it('a throwing borrowed planning scope release rejects the result after original provider completion', async () => {
  const h = await acknowledgementHost()
  expect(await h.runtime.close()).toEqual({ released: true })
  const calls = createCallContainerStore<TestPlan, object>()
  const ports = referencePorts(h.host, calls)
  const trace: string[] = []
  const acquire = h.construction.transport.acquire.bind(h.construction.transport)
  const service = createServiceCalls(
    {
      ...h.construction,
      ...ports,
      calls,
      transport: {
        clearReuseScope(scope) {
          h.construction.transport.clearReuseScope(scope)
        },
        acquire(...args) {
          const result = acquire(...args)
          if (!('lease' in result)) return result
          const lease = result.lease
          return {
            lease: {
              ...lease,
              release() {
                trace.push('lease released')
                lease.release()
              },
            },
          }
        },
      },
    },
    {
      acquire() {
        return {
          lease: {
            release() {
              trace.push('scope released')
              throw new Error('original scope release failed')
            },
          },
        }
      },
      close() {
        throw new Error('borrowed scope must not be closed by component')
      },
    },
  )
  const native = h.wire.adapter.plan.bind(h.wire.adapter)
  const plan = vi.spyOn(h.wire.adapter, 'plan').mockImplementation(async (...args) => {
    const result = await native(...args)
    trace.push('provider completed')
    return result
  })
  const before = await h.entries()
  try {
    expect(await service.openCall(h.request('scope-release-failure'))).toEqual({
      unavailable: true,
    })
    expect(trace).toEqual(['provider completed', 'scope released', 'lease released'])
    expect(await h.entries()).toEqual(before)
    expect(h.wire.sends()).toBe(0)
  } finally {
    plan.mockRestore()
    expect(await service.close()).toEqual({ released: true })
    expect(await calls.close()).toEqual({ released: true })
    expect(await ports.callFacts.close()).toEqual({ released: true })
    await h.host.close()
  }
})
