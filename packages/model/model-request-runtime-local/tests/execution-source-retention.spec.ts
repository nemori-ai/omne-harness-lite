// @module-tag slow
// Real SQLite/SQL journal factory, actual invocation/container, and six-round GC attribution.
import { describe, expect, it } from 'vitest'
import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type { OpenCallInput, SessionRuntimeBinding } from '@omne-harness-lite/model-request-runtime'
import { interpretCallHistory } from '@omne-harness-lite/model-request-runtime'
import { createModelRuntime } from '../src/service-runtime.ts'
import { createCallContainerStore } from '../src/service-container.ts'
import type { RuntimeConstruction } from '../src/service-types.ts'
import { selectionHost } from './session-selection-fixture.ts'
import { referencePorts } from './reference-ports-fixture.ts'
import { transport, type TestPlan } from './anchored-invocation-fixture.ts'
import { policy as invocationPolicy } from './invoke-policy-fixture.ts'
import { noWaitScheduler, policy as settlementPolicy } from './settlement-fixture.ts'

setFlagsFromString('--expose_gc')
const gc = runInNewContext('gc') as () => void
async function collect() {
  for (let index = 0; index < 6; index++) {
    gc()
    await new Promise(resolve => setImmediate(resolve))
  }
}

async function fixture() {
  const host = await selectionHost(true, true)
  const selected = host.create()
  const calls = createCallContainerStore<TestPlan, object>()
  const wire = transport()
  const binding: SessionRuntimeBinding = {
    log: selected.input.binding,
    sourceVersions: { fixture: 'execution-source-retention-v1' },
    selection: { ...selected.input, projection: async () => ({ known: [] }) },
    catalog: host.catalog,
    currentEvaluationInputs: host.reader,
    credentials: {
      value: async () => ({
        scope: { layer: 'factory' },
        value: new TextEncoder().encode('test-only-retention-credential'),
      }),
    },
    tools: {
      lookup: async () => {
        throw new Error('no tools requested')
      },
    },
  }
  const construction: RuntimeConstruction<TestPlan, object> = {
    ...referencePorts(host, calls),
    maxScopes: 4,
    calls,
    sessions: { bind: async () => ({ binding }) },
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
          track: async completion => await completion,
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
      call: () => 'retention-call',
      response: () => 'retention-response',
      message: () => unwrap(parseOpaqueIdentifier('retention-message', 'MessageId')),
    },
    history: {
      call: (prefix, callId) => interpretCallHistory({ prefix, callId }),
      calibration: () => ({ sourceUnavailable: true }),
      failure: () => ({ unavailable: true }),
      run: () => ({ unavailable: true }),
    },
    recovery: {
      authorize: async () => ({ authorized: true }),
      enter: async () => ({ unavailable: true }),
    },
    diagnostic() {},
  }
  const runtime = createModelRuntime(construction)
  const selection = await runtime.service.selectModel({
    session: host.session,
    routeName: 'example/model-a',
  })
  if (!('selected' in selection)) throw new Error('selection')
  const effective = await runtime.service.effectiveModel({ session: host.session })
  if (!('effectiveModel' in effective)) throw new Error('effective')
  const request: OpenCallInput = {
    session: host.session,
    creationKey: unwrap(parseOpaqueIdentifier('retention-creation', 'CreationKey')),
    target: effective.effectiveModel.routeName,
    basis: effective.effectiveModel,
    messages: [],
    tools: [],
    host: {
      signal: new AbortController().signal,
      stopping: () => false,
      register: () => ({ registration: { unregister() {} } }),
    },
  }
  async function ready() {
    const opened = await runtime.service.openCall(request)
    if (!('ref' in opened)) throw new Error('open')
    const result = await runtime.service.dispatch(opened.ref)
    if (!('replyPending' in result)) throw new Error('dispatch ' + JSON.stringify(result))
    return { ref: opened.ref, pending: result.replyPending }
  }
  return { host, runtime, calls, ready, binding, content: construction.callFacts.content }
}

describe('ACK erases the source private copy independently of metadata and idle frames', () => {
  it('checks live process copies even when another custodian has released durable content', async () => {
    const f = await fixture()
    let frame: ReturnType<typeof f.runtime.executionSource.capture> | undefined
    try {
      const { ref, pending } = await f.ready()
      frame = f.runtime.executionSource.capture(f.host.session)
      if (!('capture' in frame)) throw new Error('capture missing')
      const target = {
        ref,
        expectedResult: { kind: 'response' as const, response: pending.id },
      }
      expect(await f.runtime.service.acknowledgeCall(target)).toMatchObject({
        acknowledged: { cleanup: 'pending', pendingReasons: ['external_retention'] },
      })
      // The real content owner cannot see another process's in-memory source pins.
      expect(
        await f.content.releaseAcknowledged({ binding: f.binding.log, call: ref.callId }),
      ).toEqual({ cleanup: 'released' })
      expect(await f.content.retention({ binding: f.binding.log, call: ref.callId })).toEqual({
        phase: 'released',
        publishers: 0,
      })
      expect(await f.runtime.service.acknowledgeCall(target)).toMatchObject({
        acknowledged: { cleanup: 'pending', pendingReasons: ['external_retention'] },
      })
      expect(f.runtime.executionSource.lookup(ref)).toMatchObject({
        execution: { copyReleased: false },
      })
      expect(await f.content.retention({ binding: f.binding.log, call: ref.callId })).toEqual({
        phase: 'released',
        publishers: 0,
      })
      frame.capture.release()
      expect(await f.runtime.service.acknowledgeCall(target)).toMatchObject({
        acknowledged: { cleanup: 'released' },
      })
      expect(f.runtime.executionSource.lookup(ref)).toMatchObject({
        execution: { copyReleased: true },
      })
    } finally {
      if (frame && 'capture' in frame) frame.capture.release()
      await f.runtime.close()
      await f.host.close()
    }
  }, 90_000)

  it('keeps private copies when an original physical reservation blocks in-memory cleanup', async () => {
    const f = await fixture()
    let held: ReturnType<typeof f.calls.reserve> | undefined
    try {
      const { ref, pending } = await f.ready()
      held = f.calls.reserve(ref)
      if (!('reservation' in held)) throw new Error('reservation missing')
      const target = {
        ref,
        expectedResult: { kind: 'response' as const, response: pending.id },
      }
      expect(await f.runtime.service.acknowledgeCall(target)).toMatchObject({
        acknowledged: { cleanup: 'pending', pendingReasons: ['read_in_flight'] },
      })
      expect(f.runtime.executionSource.lookup(ref)).toMatchObject({
        execution: { registered: true, released: false, copyReleased: false },
      })
      expect(await f.content.retention({ binding: f.binding.log, call: ref.callId })).toEqual({
        phase: 'acknowledged',
        publishers: 0,
      })
      held.reservation.release()
      expect(await f.runtime.service.acknowledgeCall(target)).toMatchObject({
        acknowledged: { cleanup: 'released' },
      })
      expect(f.runtime.executionSource.lookup(ref)).toMatchObject({
        execution: { copyReleased: true },
      })
    } finally {
      if (held && 'reservation' in held) held.reservation.release()
      await f.runtime.close()
      await f.host.close()
    }
  }, 90_000)

  it('attributes GC correctly with a retained and an unreferenced positive control', async () => {
    let held: object | undefined = { big: new Array(1000).fill('x') }
    const weak = new WeakRef(held)
    await collect()
    expect(weak.deref()).toBe(held)
    held = undefined
    await collect()
    expect(weak.deref()).toBeUndefined()
  })

  it('metadata and a released idle capture do not hold actual request, pending or invocation', async () => {
    const f = await fixture()
    try {
      const retained = await (async () => {
        const { ref, pending } = await f.ready()
        const container = f.calls.find(ref)
        if (container === undefined) throw new Error('physical container missing')
        const view = container.view()
        if (view.invocation === undefined) throw new Error('actual invocation missing')
        const weak = {
          container: new WeakRef(container),
          request: new WeakRef(view.request),
          pending: new WeakRef(pending),
          invocation: new WeakRef(view.invocation),
        }
        const metadata = f.runtime.executionSource.lookup(ref)
        const snapshot = f.runtime.executionSource.snapshot(f.host.session)
        const borrowed = f.runtime.executionSource.capture(f.host.session)
        if (!('capture' in borrowed)) throw new Error('capture missing')
        expect(borrowed.capture.executions[0]?.invocation).toBe(view.invocation)
        borrowed.capture.release()
        borrowed.capture.release()
        expect(borrowed.capture.executions).toEqual([])
        expect(
          await f.runtime.service.acknowledgeCall({
            ref,
            expectedResult: { kind: 'response', response: pending.id },
          }),
        ).toMatchObject({ acknowledged: { cleanup: 'released' } })
        expect(f.calls.find(ref)).toBeUndefined()
        expect(f.runtime.executionSource.lookup(ref)).toMatchObject({
          execution: {
            released: true,
            registered: false,
            copyReleased: true,
          },
        })
        return { weak, metadata, snapshot, idle: borrowed.capture }
      })()
      await collect()
      expect(
        Object.fromEntries(
          Object.entries(retained.weak).map(([name, weak]) => [name, weak.deref() !== undefined]),
        ),
      ).toEqual({
        container: false,
        request: false,
        pending: false,
        invocation: false,
      })
      expect(retained.metadata).not.toHaveProperty('execution.invocation')
      expect(retained.snapshot[0]).not.toHaveProperty('invocation')
      expect(retained.idle.executions).toEqual([])
    } finally {
      expect(await f.runtime.close()).toEqual({ released: true })
      expect(f.runtime.executionSource.release()).toEqual({ released: true })
      await f.host.close()
    }
  }, 90_000)

  it('an actual recovery capture pins ACK cleanup until release and seals new handle capture', async () => {
    const f = await fixture()
    try {
      const { ref, pending } = await f.ready()
      const borrowed = f.runtime.executionSource.capture(f.host.session)
      if (!('capture' in borrowed)) throw new Error('capture missing')
      const expectation = {
        ref,
        expectedResult: { kind: 'response' as const, response: pending.id },
      }
      expect(await f.runtime.service.acknowledgeCall(expectation)).toMatchObject({
        acknowledged: { cleanup: 'pending', pendingReasons: ['external_retention'] },
      })
      expect(f.calls.find(ref)).toBeUndefined()
      expect(f.runtime.executionSource.lookup(ref)).toMatchObject({
        execution: {
          released: true,
          copyReleased: false,
        },
      })
      const sealed = f.runtime.executionSource.capture(f.host.session)
      if (!('capture' in sealed)) throw new Error('sealed capture missing')
      expect(sealed.capture.executions[0]).not.toHaveProperty('invocation')
      expect(await f.runtime.close()).toEqual({ released: true })
      expect(f.runtime.executionSource.release()).toEqual({ unavailable: true })
      borrowed.capture.release()
      sealed.capture.release()
      // Already-admitted ACK remains usable after runtime close, along the original contract.
      expect(await f.runtime.service.acknowledgeCall(expectation)).toMatchObject({
        acknowledged: { cleanup: 'released' },
      })
      expect(f.runtime.executionSource.lookup(ref)).toMatchObject({
        execution: { copyReleased: true },
      })
      expect(f.runtime.executionSource.release()).toEqual({ released: true })
    } finally {
      await f.runtime.close()
      await f.host.close()
    }
  }, 90_000)
})
