import { describe, expect, it } from 'vitest'
import { invokeModel } from '@omne-harness-lite/model-request-runtime'
import { createAnchoredModelInvocation } from '../src/anchored-invocation.ts'
import { adapter, request, policy, deferred, fixturePlan } from './invoke-policy-fixture.ts'
import { harness, transport } from './anchored-invocation-fixture.ts'

describe('D109 asynchronous planning ownership', () => {
  it('public abort waits for actual planning completion, retains scope, and sends nothing', async () => {
    const started = deferred()
    const native = deferred()
    const port = adapter()
    const scope = Object.freeze({})
    let preparationSignal: AbortSignal | undefined
    let settled = false
    const handle = invokeModel({
      ...request(),
      credential: 'test-secret',
      signal: new AbortController().signal,
      policy: policy(),
      reuseScope: scope,
      transport: {
        ...port.transport,
        async plan(input, execution) {
          expect(execution.reuseScope).toBe(scope)
          preparationSignal = execution.signal
          started.resolve()
          await native.promise
          return { planned: fixturePlan(input) }
        },
      },
    })
    const completed = handle.outcome.then(value => {
      settled = true
      return value
    })
    await started.promise
    handle.abort()
    expect(preparationSignal?.aborted).toBe(true)
    await Promise.resolve()
    expect(settled).toBe(false)
    expect(port.sends()).toBe(0)
    native.resolve()
    expect(await completed).toEqual({ cancelledBeforeSend: true })
    expect(port.sends()).toBe(0)
  })

  it('anchored close retains the original owner and lease until actual plan drain, zero anchors', async () => {
    await harness(async h => {
      const native = deferred()
      const started = deferred()
      const t = transport()
      let planSignal: AbortSignal | undefined
      let leaseTracked = false
      let leaseStopped = false
      let released = false
      const handle = createAnchoredModelInvocation({
        ...h.input,
        transport: {
          ...t.adapter,
          async plan(input, execution) {
            planSignal = execution.signal
            started.resolve()
            await native.promise
            return t.adapter.plan(input, execution)
          },
        },
        trackPlan: async completion => {
          leaseTracked = true
          try {
            return await completion
          } finally {
            leaseStopped = true
          }
        },
        releaseBorrowed: async () => {
          expect(leaseStopped).toBe(true)
          released = true
        },
      })
      await started.promise
      expect(leaseTracked).toBe(true)
      let closed = false
      const closing = handle.close().then(value => {
        closed = true
        return value
      })
      expect(planSignal?.aborted).toBe(true)
      await Promise.resolve()
      expect(closed).toBe(false)
      expect(released).toBe(false)
      native.resolve()
      expect(await handle.outcome).toEqual({ cancelledBeforeDispatch: true })
      expect(await closing).toEqual({ released: true })
      expect(released).toBe(true)
      expect(t.sends()).toBe(0)
    })
  })
})

it('anchored invocation captures valid input before the first planning await', async () => {
  await harness(async h => {
    const pending = deferred()
    const started = deferred()
    const parameters = { temperature: 0.5 }
    const t = transport()
    const handle = createAnchoredModelInvocation({
      ...h.input,
      planInput: { ...h.input.planInput, parameters },
      transport: {
        ...t.adapter,
        async plan(input, execution) {
          started.resolve()
          await pending.promise
          expect(input.parameters).toEqual({ temperature: 0.5 })
          return t.adapter.plan(input, execution)
        },
      },
    })
    parameters.temperature = 0.9
    await started.promise
    pending.resolve()
    expect(await handle.outcome).toHaveProperty('replyPending')
    expect(await handle.settleReply('persisted')).toHaveProperty('settled')
    expect(await handle.close()).toEqual({ released: true })
    expect(t.sends()).toBe(1)
  })
})

it('owns a missing-cap preflight snapshot across the asynchronous adapter boundary', async () => {
  const original = request()
  const snapshot = { ...original.snapshot }
  Reflect.deleteProperty(snapshot, 'maxInputTokens')
  const parameters = { temperature: 0.5 }
  const native = deferred()
  const port = adapter()
  const handle = invokeModel({
    ...original,
    snapshot,
    parameters,
    credential: 'test-secret',
    signal: new AbortController().signal,
    policy: policy(),
    transport: {
      ...port.transport,
      async plan(input) {
        await native.promise
        expect(Object.hasOwn(input.snapshot, 'maxInputTokens')).toBe(false)
        expect(input.parameters).toEqual({ temperature: 0.5 })
        return { planned: fixturePlan(input) }
      },
    },
  })
  snapshot.maxInputTokens = original.snapshot.maxInputTokens
  parameters.temperature = 0.9
  native.resolve()
  expect(await handle.outcome).toEqual({
    rejected: 'invalidInput',
    reason: 'input_limit_missing',
    metrics: ['maxInputTokens'],
  })
  expect(port.sends()).toBe(0)
})
