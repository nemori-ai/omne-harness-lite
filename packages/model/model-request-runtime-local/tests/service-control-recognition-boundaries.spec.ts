// @module-tag slow
// 真实SQL追加丢回执后，原结算登记、writer和reader仍承担认回责任。
import { describe, expect, it } from 'vitest'
import type {
  DispatchResult,
  SettlementOwner,
  SettlementRegistration,
  SettlementTask,
} from '@omne-harness-lite/model-request-runtime'
import type { SessionLog } from '@omne-harness-lite/session-log'
import { createServiceControl } from '../src/service-control.ts'
import { projectRuntimeComponent } from '../src/runtime-projection.ts'
import type { RuntimeConstruction } from '../src/service-types.ts'
import { acknowledgementHost, type HostOptions } from './acknowledgement-host-fixture.ts'
import { modelValue } from './log-codec-fixture.ts'
import { ControlledSettlementOwner, deferred } from './settlement-fixture.ts'
import type { TestPlan } from './anchored-invocation-fixture.ts'
import { within } from './review3-close-fixture.ts'

type World = Awaited<ReturnType<typeof acknowledgementHost>>
type Construction = RuntimeConstruction<TestPlan, object>

function kind(entry: Parameters<SessionLog['append']>[1][number]): unknown {
  const value = modelValue(entry.payload)
  return value !== null && typeof value === 'object' && 'kind' in value ? value.kind : undefined
}

async function withUnknownIntent(
  work: (fixture: {
    readonly world: World
    readonly inner: ControlledSettlementOwner
    readonly trace: string[]
    readonly armStop: (promise: Promise<void>) => void
    readonly failRelease: (fail: boolean) => void
    readonly held: () => SettlementRegistration
    readonly writer: () => SettlementTask<unknown>
  }) => Promise<void>,
): Promise<void> {
  const inner = new ControlledSettlementOwner()
  const trace: string[] = []
  let unknown = false
  let failure = false
  let stopBarrier: Promise<void> | undefined
  let registration: SettlementRegistration | undefined
  let task: SettlementTask<unknown> | undefined
  const owner: SettlementOwner = {
    name: inner.name,
    admission: inner.admission,
    opened: inner.opened,
    unresolvedWrites: inner.unresolvedWrites,
    acquire(limit) {
      const received = inner.acquire(limit)
      if ('unavailable' in received) return received
      const original = received.registration
      const exposed: SettlementRegistration = {
        start<T>(
          taskKind: Parameters<SettlementRegistration['start']>[0],
          operation: (signal: AbortSignal) => Promise<T>,
        ): SettlementTask<T> {
          const started = original.start(taskKind, operation)
          const observed: SettlementTask<T> = {
            completion: started.completion,
            stopped: started.stopped,
            requestStop() {
              trace.push(`stop:${taskKind}`)
              started.requestStop()
            },
          }
          if (taskKind === 'controlAppend') {
            registration = exposed
            task = observed
          }
          return observed
        },
        release() {
          if (unknown && exposed === registration) {
            trace.push('retained-release')
            if (failure) throw new Error('original retained release unavailable')
          }
          original.release()
        },
      }
      return { registration: exposed }
    },
  }
  const options: HostOptions = {
    owner,
    append:
      real =>
      async (...args) => {
        const result = await real(...args)
        if (!unknown && args[1].some(entry => kind(entry) === 'model_call_interrupt_intent')) {
          unknown = true
          inner.stopBarrier = stopBarrier
          trace.push('intent-landed-receipt-unknown')
          return { failure: 'unavailable' }
        }
        return result
      },
  }
  const world = await acknowledgementHost(options)
  try {
    await work({
      world,
      inner,
      trace,
      armStop(promise) {
        stopBarrier = promise
      },
      failRelease(fail) {
        failure = fail
      },
      held() {
        if (registration === undefined) throw new Error('original writer registration absent')
        return registration
      },
      writer() {
        if (task === undefined) throw new Error('original writer absent')
        return task
      },
    })
  } finally {
    failure = false
    inner.stopBarrier = undefined
    expect(await world.runtime.close()).toEqual({ released: true })
    await world.host.close()
  }
}

describe('original control unknown intent recognition', () => {
  it('retains the original reader across projection and retries the same failed registration release', async () => {
    await withUnknownIntent(async f => {
      const opened = await f.world.service.openCall(f.world.request('p6-recognition-release-retry'))
      if (!('ref' in opened)) throw new Error('actual original call absent')
      let originalReads = 0
      let replacementReads = 0
      const original: Construction = {
        ...f.world.construction,
        history: {
          ...f.world.construction.history,
          call(prefix, callId) {
            originalReads++
            return f.world.construction.history.call(prefix, callId)
          },
        },
      }
      const control = createServiceControl(original)
      const projected = projectRuntimeComponent(control, {
        ...original,
        history: {
          ...original.history,
          call() {
            replacementReads++
            throw new Error('retained reader replaced')
          },
        },
      })
      try {
        expect(await control.interrupt({ ...opened.ref, initiator: 'user' })).toEqual({
          unavailable: true,
        })
        const held = f.held(),
          writer = f.writer()
        await writer.stopped
        const readsBefore = originalReads
        f.failRelease(true)
        expect(await projected.interrupt({ ...opened.ref, initiator: 'run_cancelled' })).toEqual({
          unavailable: true,
        })
        expect(originalReads).toBe(readsBefore + 1)
        expect(replacementReads).toBe(0)
        expect(f.held()).toBe(held)
        expect(f.writer()).toBe(writer)
        expect(f.inner.active).toBe(1)
        const beforeRetry = await f.world.entries()
        expect(
          beforeRetry.filter(entry => kind(entry) === 'model_call_interrupt_intent'),
        ).toHaveLength(1)
        f.failRelease(false)
        expect(await projected.interrupt({ ...opened.ref, initiator: 'run_cancelled' })).toEqual({
          stage: 'before_dispatch',
        })
        expect(originalReads).toBe(readsBefore + 2)
        expect(replacementReads).toBe(0)
        expect(f.trace.filter(value => value === 'retained-release')).toHaveLength(2)
        expect(await control.close()).toEqual({ released: true })
        const after = await f.world.entries()
        expect(after.filter(entry => kind(entry) === 'model_call_interrupt_intent')).toHaveLength(1)
        const endings = after
          .filter(entry => kind(entry) === 'model_call_ended')
          .map(entry => modelValue(entry.payload))
        expect(endings).toEqual([
          expect.objectContaining({ ending: 'interrupted', initiator: 'user' }),
        ])
        expect(f.inner.active).toBe(0)
      } finally {
        f.failRelease(false)
        expect(await control.close()).toEqual({ released: true })
      }
    })
  })

  it('cannot recognize completion as actual stop and close waits for the original writer proof', async () => {
    await withUnknownIntent(async f => {
      const opened = await f.world.service.openCall(f.world.request('p6-recognition-actual-stop'))
      if (!('ref' in opened)) throw new Error('actual original call absent')
      const barrier = deferred<void>()
      f.armStop(barrier.promise)
      const control = createServiceControl(f.world.construction)
      try {
        expect(await control.interrupt({ ...opened.ref, initiator: 'user' })).toEqual({
          unavailable: true,
        })
        const writer = f.writer(),
          held = f.held()
        await writer.completion
        const before = await f.world.entries()
        expect(await control.interrupt({ ...opened.ref, initiator: 'user' })).toEqual({
          unavailable: true,
        })
        expect(await f.world.entries()).toEqual(before)
        expect(f.inner.active).toBe(1)
        let closed = false
        const closing = control.close().then(result => {
          closed = true
          return result
        })
        await Promise.resolve()
        await Promise.resolve()
        expect(closed).toBe(false)
        expect(f.inner.active).toBe(1)
        expect(f.held()).toBe(held)
        expect(f.writer()).toBe(writer)
        barrier.resolve()
        expect(await closing).toEqual({ released: true })
        expect(f.trace).toContain('stop:controlAppend')
        expect(f.inner.active).toBe(0)
        expect(await f.world.entries()).toEqual(before)
      } finally {
        barrier.resolve()
        expect(await control.close()).toEqual({ released: true })
      }
    })
  })
})

it('preserves the original in-flight signal error boundary after durable intent', async () => {
  const entered = deferred<void>()
  const resume = deferred<void>()
  const world = await acknowledgementHost()
  world.grant('owner', ['read', 'wait', 'settle', 'ack'])
  let dispatching: Promise<DispatchResult> | undefined
  let originalInvocation: ReturnType<World['calls']['find']> | undefined
  const send = world.wire.adapter.send
  const fault = new Error('original signal failure')
  const signals: string[] = []
  let control: ReturnType<typeof createServiceControl<TestPlan, object>> | undefined
  try {
    Object.defineProperty(world.wire.adapter, 'send', {
      value: async (...args: Parameters<typeof send>) => {
        entered.resolve()
        await resume.promise
        return await send(...args)
      },
      configurable: true,
    })
    const opened = await world.service.openCall(world.request('p6-control-signal-in-flight'))
    if (!('ref' in opened)) throw new Error('actual call absent')
    dispatching = world.service.dispatch(opened.ref)
    await within(5_000, entered.promise, 'original dispatch gate')
    originalInvocation = world.calls.find(opened.ref)
    if (originalInvocation?.view().invocation === undefined)
      throw new Error('actual dispatch invocation absent')
    const construction: Construction = {
      ...world.construction,
      calls: {
        ...world.calls,
        async waitReserve(key, input) {
          const reserved = await world.calls.waitReserve(key, input)
          if ('unavailable' in reserved) return reserved
          const original = reserved.reservation
          return {
            reservation: {
              ...original,
              view() {
                const actual = original.view()
                if (actual === undefined || actual.operation.phase !== 'dispatching')
                  throw new Error('actual original dispatch not active')
                return {
                  ...actual,
                  operation: {
                    ...actual.operation,
                    interrupt(initiator) {
                      signals.push(initiator)
                      throw fault
                    },
                  },
                }
              },
            },
          }
        },
      },
    }
    control = createServiceControl(construction)
    const interrupted = within(
      5_000,
      control.interrupt({ ...opened.ref, initiator: 'user' }),
      'original control signal',
    )
    expect(await interrupted).toEqual({ unavailable: true })
    expect(signals).toEqual(['user'])
    expect(
      (await world.entries())
        .filter(entry => kind(entry) === 'model_call_interrupt_intent')
        .map(entry => modelValue(entry.payload)),
    ).toEqual([expect.objectContaining({ call: opened.callId, initiator: 'user' })])
    const next = world.calls.reserve(opened.ref)
    expect(next).toHaveProperty('reservation')
    if ('reservation' in next) next.reservation.release()
  } finally {
    originalInvocation?.view().invocation?.interrupt('user')
    resume.resolve()
    if (dispatching !== undefined) await within(5_000, dispatching, 'original dispatch teardown')
    Object.defineProperty(world.wire.adapter, 'send', { value: send, configurable: true })
    if (control !== undefined) expect(await control.close()).toEqual({ released: true })
    expect(await world.runtime.close()).toEqual({ released: true })
    await world.host.close()
  }
})

it.each(['unavailable', 'throw'] as const)(
  'recognizes a durable interrupted ending after its receipt is lost and retries original close %s',
  async failure => {
    const owner = new ControlledSettlementOwner()
    let receiptLost = false
    const world = await acknowledgementHost({
      owner,
      append:
        real =>
        async (...args) => {
          const result = await real(...args)
          if (!receiptLost && args[1].some(entry => kind(entry) === 'model_call_ended')) {
            receiptLost = true
            return { failure: 'unavailable' }
          }
          return result
        },
    })
    const fault = new Error('original container close failure')
    let blocked = true
    let closes = 0
    let removes = 0
    const construction: Construction = {
      ...world.construction,
      calls: {
        ...world.calls,
        find(key) {
          const original = world.calls.find(key)
          if (original === undefined) return undefined
          return {
            ...original,
            async close() {
              closes++
              if (blocked) {
                if (failure === 'throw') throw fault
                return { unavailable: true }
              }
              return await original.close()
            },
          }
        },
        remove(reservation) {
          removes++
          return world.calls.remove(reservation)
        },
      },
    }
    const control = createServiceControl(construction)
    try {
      const opened = await world.service.openCall(world.request(`p6-failed-ending-${failure}`))
      if (!('ref' in opened)) throw new Error('actual original call absent')
      expect(await control.interrupt({ ...opened.ref, initiator: 'user' })).toEqual({
        stage: 'before_dispatch',
      })
      if (failure === 'throw') await expect(control.close()).rejects.toBe(fault)
      else expect(await control.close()).toEqual({ unavailable: true })
      expect(receiptLost).toBe(true)
      expect(closes).toBe(1)
      expect(removes).toBe(0)
      expect(owner.active).toBe(0)
      const entries = await world.entries()
      expect(
        entries
          .filter(entry => kind(entry) === 'model_call_interrupt_intent')
          .map(entry => modelValue(entry.payload)),
      ).toEqual([expect.objectContaining({ call: opened.callId, initiator: 'user' })])
      expect(
        entries
          .filter(entry => kind(entry) === 'model_call_ended')
          .map(entry => modelValue(entry.payload)),
      ).toEqual([
        expect.objectContaining({ call: opened.callId, ending: 'interrupted', initiator: 'user' }),
      ])
      blocked = false
      expect(await control.close()).toEqual({ released: true })
      expect(closes).toBe(2)
      expect(removes).toBe(0)
      expect(owner.active).toBe(0)
      expect(await world.entries()).toEqual(entries)
    } finally {
      blocked = false
      expect(await control.close()).toEqual({ released: true })
      expect(await world.runtime.close()).toEqual({ released: true })
      await world.host.close()
    }
  },
)
