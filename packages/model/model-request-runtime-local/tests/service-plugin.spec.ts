// @module-tag slow
// Real SQLite construction and official Cordis. Controlled ports are not real login evidence.
import { Context } from '@deepseek-ai/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { MODEL_RUNTIME_SERVICE } from '@omne-harness-lite/model-request-runtime/cordis'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type {
  CallConsumer,
  ModelFailureSource,
  ModelRuntimeHostLease,
} from '@omne-harness-lite/model-request-runtime'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createModelRuntimeLocal } from '../src/service-plugin.ts'
import { createProviderContributions } from '../src/provider-contributions.ts'
import {
  namedProviderFixture,
  providerConfig,
  unavailableInputs,
} from './named-provider-fixture.ts'

const session = unwrap(parseOpaqueIdentifier('named-session', 'SessionRef'))
const callId = unwrap(parseOpaqueIdentifier('named-call', 'ModelCallId'))
const key = { session, callId }

describe('named model runtime provider', () => {
  it('loads exact decimal lexemes and rejects numeric objects, invalid syntax and invalid bounds before setup', async () => {
    const exact = {
      ...providerConfig,
      tokenMargin: { multiplier: '1.10000000000000000001', reserveTokens: '9007199254740993' },
      reservationWaitPolicy: { maxWaitersPerCall: '2e1', timeoutMs: '1e3' },
    }
    const provider = createModelRuntimeLocal()
    const schema = provider.plugin.Config
    if (!schema) throw new Error('provider schema absent')
    expect(await schema['~standard'].validate(JSON.parse(JSON.stringify(exact)))).toEqual({
      value: exact,
    })
    for (const value of [1, 'NaN', '01', '+1', '0.99'])
      expect(() =>
        provider.plugin.describeAssembly({
          ...exact,
          tokenMargin: { ...exact.tokenMargin, multiplier: value },
        }),
      ).toThrow()
    for (const value of [0, '-1', '0.5', 'Infinity'])
      expect(() =>
        provider.plugin.describeAssembly({
          ...exact,
          reservationWaitPolicy: { ...exact.reservationWaitPolicy, maxWaitersPerCall: value },
        }),
      ).toThrow()
    const host = await namedProviderFixture({ config: exact })
    try {
      await host.binding.ready
      expect(host.ctx.get(MODEL_RUNTIME_SERVICE)).toBeDefined()
    } finally {
      await host.close()
    }
  })
  it('waits for named dependencies, constructs real private resources and publishes all fifteen methods', async () => {
    const host = await namedProviderFixture({ deferDependencies: true })
    try {
      expect(host.ctx.get(MODEL_RUNTIME_SERVICE)).toBeUndefined()
      expect(host.captures).toEqual([])
      await host.supplyDependencies()
      await host.binding.ready
      const service = host.ctx.get(MODEL_RUNTIME_SERVICE)
      if (!service) throw new Error('actual service not published')
      for (const privateName of [
        'executionSource',
        'runtime',
        'facts',
        'bridge',
        'contributions',
        'owner',
      ])
        expect(Reflect.get(service, privateName)).toBeUndefined()
      for (const name of [
        'acquireCall',
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
        'acknowledgeCall',
      ] as const)
        expect(typeof service[name]).toBe('function')
      expect(await service.acquireCall({ ref: key, mode: 'read' })).toEqual({ unavailable: true })
      for (const invoke of [
        () => service.dispatch(key, { consumeFailure: true }),
        () =>
          service.dispatchAgain({ ...key, plan: { provider: 'test' } }, { consumeFailure: true }),
        () => service.readAttempts(key, { consumeFailure: true }),
      ]) {
        const value = await invoke()
        expect(value).toHaveProperty('result')
        expect(value.consumption.kind).toBe('notApplicable')
      }
      expect(host.releases()).toBe(4)
    } finally {
      await host.close()
    }
  })

  it('captures two actual caller fibers through ordinary methods, without a setup subject shortcut', async () => {
    const seen: unknown[] = []
    const host = await namedProviderFixture({
      capture(fiber) {
        return {
          ...unavailableInputs(),
          sessions: {
            async bind() {
              seen.push(fiber)
              return { failure: 'unavailable' }
            },
          },
        }
      },
    })
    try {
      await host.binding.ready
      const callers = [
        host.ctx.plugin(
          definePlugin({ name: 'caller-a', Config: z.object({}).strict(), apply() {} }),
          {},
        ),
        host.ctx.plugin(
          definePlugin({ name: 'caller-b', Config: z.object({}).strict(), apply() {} }),
          {},
        ),
      ]
      for (const caller of callers) {
        const service = caller.ctx.get(MODEL_RUNTIME_SERVICE)
        if (!service) throw new Error('caller service absent')
        expect(await service.legalTargets({ session })).toEqual({ unavailable: true })
        expect(host.captures.at(-1) === caller.ctx.fiber).toBe(true)
      }
      expect(seen.length).toBe(2)
      for (const [index, caller] of callers.entries())
        expect(seen[index] === caller.ctx.fiber).toBe(true)
      await Promise.all(callers.map(caller => caller.dispose()))
    } finally {
      await host.close()
    }
  })

  it('stops new admission synchronously, retains a failed original borrow and retries the same owner', async () => {
    let blocked = false
    const host = await namedProviderFixture({
      release() {
        if (blocked) throw new Error('borrow return blocked')
      },
    })
    try {
      await host.binding.ready
      const service = host.ctx.get(MODEL_RUNTIME_SERVICE)
      if (!service) throw new Error('service absent')
      const owner = host.binding.owner()
      host.binding.closeAdmission()
      // This fixture has no qualified session. Admission closure cannot grant a subject
      // enough authority to distinguish runtimeStopped from its original unavailable result.
      expect(await service.dispatch(key)).toEqual({ unavailable: true })
      blocked = true
      await expect(host.binding.close()).rejects.toThrow('borrow return blocked')
      expect(host.releases()).toBe(1)
      expect(host.binding.owner().executionSource).toBe(owner.executionSource)
      blocked = false
      expect(await host.binding.close()).toEqual({ released: true })
      expect(host.releases()).toBe(2)
      expect(await host.binding.close()).toEqual({ released: true })
      expect(host.releases()).toBe(2)
    } finally {
      blocked = false
      await host.close()
    }
  })

  it('rejects missing/extra configuration instead of accepting construct or inferred defaults', () => {
    const provider = createModelRuntimeLocal()
    expect(() => provider.plugin.describeAssembly({})).toThrow()
    expect(() => provider.plugin.describeAssembly({ ...providerConfig, construct() {} })).toThrow()
    expect(() => provider.plugin.describeAssembly(providerConfig)).not.toThrow()
    expect(provider.plugin.describeAssembly(providerConfig).requires).not.toContain(
      'modelInputMeters',
    )
  })
})

describe('caller contribution responsibility', () => {
  function lease(release: () => void): ModelRuntimeHostLease {
    return { generation: Object.freeze({}), isCurrent: () => true, release }
  }
  it('observes actual stopped and closes independently of caller disposal', async () => {
    const context = new Context()
    const caller = context.plugin(
      definePlugin({ name: 'consumer-caller', Config: z.object({}).strict(), apply() {} }),
      {},
    )
    const stopped = Promise.withResolvers<void>()
    let releases = 0,
      returned = 0
    const consumer: CallConsumer = {
      wait: async () => ({ released: true }),
      release() {
        releases++
      },
      stopped: stopped.promise,
    }
    const contributions = createProviderContributions()
    const borrow = contributions.borrow(
      lease(() => returned++),
      caller.ctx,
    )
    await borrow.complete(consumer)
    borrow.consumer(consumer).release()
    await Promise.resolve()
    expect(releases).toBe(1)
    expect(returned).toBe(0)
    const closed = contributions.close()
    stopped.resolve()
    await closed
    expect(returned).toBe(1)
    expect(releases).toBe(1)
    await caller.dispose()
    await context.fiber.dispose()
  })

  it('returns a late consumer to the original owner after caller withdrawal', async () => {
    const context = new Context()
    const caller = context.plugin(
      definePlugin({ name: 'late-caller', Config: z.object({}).strict(), apply() {} }),
      {},
    )
    const contributions = createProviderContributions()
    let returned = 0,
      requested = 0
    const requestedStop = Promise.withResolvers<void>()
    const borrow = contributions.borrow(
      lease(() => returned++),
      caller.ctx,
    )
    const withdrawn = caller.dispose()
    const stopped = Promise.withResolvers<void>()
    const completing = borrow.complete({
      wait: async () => ({ released: true }),
      release() {
        requested++
        requestedStop.resolve()
      },
      stopped: stopped.promise,
    })
    await requestedStop.promise
    expect(returned).toBe(0)
    expect(requested).toBe(1)
    stopped.resolve()
    await completing
    await withdrawn
    expect(returned).toBe(1)
    await contributions.close()
    await context.fiber.dispose()
  })

  it('finishes an empty acquisition after the active caller has started disposing', async () => {
    const context = new Context()
    const caller = context.plugin(
      definePlugin({ name: 'empty-acquisition-caller', Config: z.object({}).strict(), apply() {} }),
      {},
    )
    await caller
    const contributions = createProviderContributions()
    let returned = 0
    const borrow = contributions.borrow(
      lease(() => returned++),
      caller.ctx,
    )
    const disposing = caller.dispose()
    await expect(borrow.complete()).resolves.toBeUndefined()
    await disposing
    expect(returned).toBe(1)
    await contributions.close()
    await context.fiber.dispose()
  })

  it('returns a naturally stopped consumer without requiring an explicit release request', async () => {
    const stopped = Promise.withResolvers<void>(),
      contributions = createProviderContributions()
    let returned = 0,
      requests = 0
    const borrow = contributions.borrow(lease(() => returned++))
    await borrow.complete({
      wait: async () => ({ released: true }),
      release() {
        requests++
      },
      stopped: stopped.promise,
    })
    stopped.resolve()
    await stopped.promise
    expect(returned).toBe(1)
    await contributions.close()
    expect(requests).toBe(0)
  })

  it('returns the lease when effect registration fails on an actually disposed caller', async () => {
    const context = new Context(),
      contributions = createProviderContributions()
    const caller = context.plugin(
      definePlugin({ name: 'disposed-caller', Config: z.object({}).strict(), apply() {} }),
      {},
    )
    await caller
    await caller.dispose()
    let returned = 0
    expect(() =>
      contributions.borrow(
        lease(() => returned++),
        caller.ctx,
      ),
    ).toThrow()
    expect(returned).toBe(1)
    await contributions.close()
    await context.fiber.dispose()
  })

  it('retains a throwing failure-source release and retries the original source before returning its lease', async () => {
    const contributions = createProviderContributions()
    const borrow = contributions.borrow(lease(() => order.push('lease')))
    const order: string[] = []
    let blocked = true
    const original: ModelFailureSource = {
      // This fixture verifies synchronous custody only; actual authorized subjects are covered
      // by the SQL/TLS failure-consumption tests, rather than by this opaque stand-in.
      subject: Object.freeze({}) as ModelFailureSource['subject'],
      verify() {
        return { unavailable: true }
      },
      release() {
        order.push('source')
        if (blocked) throw new Error('original source retained')
      },
    }
    await borrow.complete(original)
    const source = borrow.source(original)
    expect(
      source.verify(original.subject, {} as Parameters<ModelFailureSource['verify']>[1]),
    ).toEqual({ unavailable: true })
    expect(() => source.release()).toThrow('original source retained')
    await expect(contributions.close()).rejects.toThrow('original source retained')
    expect(order).toEqual(['source', 'source'])
    blocked = false
    await contributions.close()
    source.release()
    expect(order).toEqual(['source', 'source', 'source', 'lease'])
  })
})
