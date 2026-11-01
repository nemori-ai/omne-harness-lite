import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type {
  AuthorityDecision,
  ContextReader,
  ProducerHandle,
  RegisterProducerResult,
  ScopeRef,
} from '@omne-harness/runtime-context-contract'
import { createTestAuthorityPorts } from '@omne-harness/runtime-context-contract/testing'
import type { TestAuthorityPorts } from '@omne-harness/runtime-context-contract/testing'
import {
  runtimeContextKey,
  runtimeContextScopeKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
import type { RuntimeContextService } from '@omne-harness/runtime-context-cordis-contract/cordis'
import { RuntimeContextProvider } from '@omne-harness/runtime-context-cordis/cordis'
import { deferred, descriptor, plugin, scope, tenantA, trustOf } from './support.js'

// Real Cordis 4.0.4: loading, configuration, isolate uniqueness, producer effects, scope-filtered
// wake-ups, intercept consistency and unloading (docs/cordis.md 验证义务).

const FAILED = 3

async function loaded(config: Record<string, unknown> = {}) {
  const ctx = new Context()
  const ports = createTestAuthorityPorts<unknown>()
  await ctx.plugin(trustOf(ports))
  const fiber = await ctx.plugin(RuntimeContextProvider, config)
  const service = ctx.get(runtimeContextKey)
  if (!service) throw new Error('The provider did not load')
  return { ctx, ports, fiber, service }
}

/** Opens a scope, registers the block, and binds a model reader through an intercepted context. */
async function opened(
  ctx: Context,
  ports: TestAuthorityPorts<unknown>,
  service: RuntimeContextService<unknown>,
  target: ScopeRef,
): Promise<ContextReader> {
  ports.bind(target, tenantA)
  const begun = await service.beginReplay('holder', {
    scope: target,
    tenant: tenantA,
    through: null,
    supersedes: null,
  })
  if (begun.kind !== 'replaying') throw new Error(begun.kind)
  await service.finishReplay('holder', {
    replay: begun.replay,
    material: { registrations: [], checkpoints: [], end: null },
  })
  const applied = await service.applyCommit('holder', {
    kind: 'registration',
    commit: { commit: `${target.ref}:add` },
    change: {
      kind: 'add',
      creating: true,
      scope: target,
      tenant: tenantA,
      key: 'test.value',
      basedOn: 0,
      required: true,
      bindings: [],
      parameters: undefined,
    },
  })
  if (applied.kind !== 'applied') throw new Error(applied.kind)
  const issued = await service.issueEligibility('holder', {
    supersedes: null,
    scope: target,
    consumer: 'model',
    principal: 'reader',
    tenant: tenantA,
    keys: ['test.value'],
    bindings: [],
    registrationRevision: 1,
  })
  if (issued.kind !== 'issued') throw new Error(issued.kind)
  const model = ctx.intercept(runtimeContextKey, { consumer: 'model' }).get(runtimeContextKey)
  const bound = await model?.bind(issued.eligibility.id)
  if (bound?.kind !== 'bound') throw new Error(`bind: ${bound?.kind}`)
  return bound.reader
}

function producerPlugin(name: string, handles: ProducerHandle[], identity = 'producer') {
  return plugin(
    name,
    async inner => {
      const result = await inner.runtimeContext.registerProducer('producer', {
        key: 'test.value',
        tenant: tenantA,
        producer: { producer: identity },
        declaration: descriptor,
        scoped: true,
      })
      if (result.kind === 'registered') handles.push(result.handle)
    },
    [runtimeContextKey],
  )
}

async function value(reader: ContextReader) {
  const s = await reader.snapshot()
  if (s.kind !== 'success') return s
  return s.value.blocks[0]?.state ?? { missing: s.value.missing.map(item => item.cause) }
}

describe('loading', () => {
  it('a configuration error fails the fiber and provides no service', async () => {
    const configs: unknown[] = [
      { readCacheEntries: -1 },
      { retension: 64 },
      { diagnostics: 'loud' },
    ]
    for (const config of configs) {
      const ctx = new Context()
      await ctx.plugin(trustOf(createTestAuthorityPorts<unknown>()))
      // The configuration is outside data: the schema, not the type, has to refuse it.
      const fiber = ctx.plugin(RuntimeContextProvider, config as never)
      await expect(fiber).rejects.toThrow()
      expect(fiber.state as number).toBe(FAILED)
      expect(ctx.get(runtimeContextKey)).toBeUndefined()
    }
  })

  it('a second provider under the same isolate label fails and the first one stays', async () => {
    const { ctx, service } = await loaded()
    const second = ctx.plugin(RuntimeContextProvider)
    await expect(second).rejects.toThrow(/has been registered/)
    expect(second.state as number).toBe(FAILED)
    expect(ctx.get(runtimeContextKey)).toBeDefined()
    // The first provider's mechanism was not touched: it still answers instead of `closed`.
    const prepared = await service.prepareRegistration('holder', {
      kind: 'remove',
      creating: false,
      scope: scope('dup/a'),
      tenant: tenantA,
      key: 'test.value',
      basedOn: 0,
    })
    expect(prepared).toEqual({ kind: 'refused', reason: 'unauthorized' })
  })
})

describe('producer registration', () => {
  it('a producer unload withdraws its registration and the block reads missing', async () => {
    const { ctx, ports, service } = await loaded()
    const handles: ProducerHandle[] = []
    const producer = await ctx.plugin(producerPlugin('producer', handles))
    const reader = await opened(ctx, ports, service, scope('unload/a'))
    expect(
      (await handles[0]?.publish({ scope: scope('unload/a'), tenant: tenantA, value: 3 }))?.kind,
    ).toBe('published')
    expect(await value(reader)).toEqual({ kind: 'value', value: 3 })
    await producer.dispose()
    expect(await value(reader)).toEqual({ missing: ['producer-withdrawn'] })
  })

  it('a new generation registered before the old fiber unloads keeps its registration', async () => {
    const { ctx, ports, service } = await loaded()
    const handles: ProducerHandle[] = []
    const old = await ctx.plugin(producerPlugin('old', handles, 'shared'))
    await ctx.plugin(producerPlugin('new', handles, 'shared'))
    const [previous, current] = handles
    if (!previous || !current) throw new Error('Missing handles')
    expect(current.generation).toBeGreaterThan(previous.generation)
    const target = scope('rerun/a')
    const reader = await opened(ctx, ports, service, target)
    await old.dispose()
    expect((await current.publish({ scope: target, tenant: tenantA, value: 8 })).kind).toBe(
      'published',
    )
    expect((await previous.publish({ scope: target, tenant: tenantA, value: 9 })).kind).toBe(
      'rejected',
    )
    expect(await value(reader)).toEqual({ kind: 'value', value: 8 })
  })

  it('when the calling fiber unloads during registration, the registration is withdrawn and a contract result returns', async () => {
    const { ctx, ports } = await loaded()
    const gate = deferred<AuthorityDecision<unknown>>()
    const producerFace = ports.authority.producer
    let held = 0
    ports.authority.producer = (principal, action) => {
      if (action.kind === 'register' && held++ === 0) return gate.promise
      return producerFace(principal, action)
    }
    let pending: Promise<RegisterProducerResult> | undefined
    const caller = await ctx.plugin(
      plugin(
        'short-lived',
        inner => {
          pending = inner.runtimeContext.registerProducer('producer', {
            key: 'test.value',
            tenant: tenantA,
            producer: { producer: 'short-lived' },
            declaration: descriptor,
            scoped: true,
          })
        },
        [runtimeContextKey],
      ),
    )
    await caller.dispose()
    gate.resolve({ kind: 'authorized', principal: 'producer', current: () => true })
    expect(await pending).toEqual({ kind: 'rejected', reason: 'closed' })
    // The slot is free again: another producer identity of the tenant can register.
    const handles: ProducerHandle[] = []
    await ctx.plugin(producerPlugin('successor', handles, 'successor'))
    expect(handles).toHaveLength(1)
  })

  it('explicit disposal and a later caller unload share one idempotent withdrawal', async () => {
    const { ctx } = await loaded()
    const handles: ProducerHandle[] = []
    const producer = await ctx.plugin(producerPlugin('explicit', handles))
    await handles[0]?.dispose()
    expect(
      (await handles[0]?.publish({ scope: scope('x/a'), tenant: tenantA, value: 1 }))?.kind,
    ).toBe('rejected')
    await producer.dispose()
  })
})

describe('wake-ups and consumer class', () => {
  it('a wake-up reaches only listeners of the same scope and carries no block key', async () => {
    const { ctx, ports, service } = await loaded()
    const handles: ProducerHandle[] = []
    await ctx.plugin(producerPlugin('producer', handles))
    const a = scope('wake/a')
    const b = scope('wake/b')
    await opened(ctx, ports, service, a)
    await opened(ctx, ports, service, b)
    const received: unknown[][] = []
    await ctx.plugin(
      plugin('listeners', inner => {
        inner
          .extend({ [runtimeContextScopeKey]: a })
          .on('runtime-context-cordis-contract/changed', (...args) => {
            received.push(['a', ...args])
          })
        inner
          .extend({ [runtimeContextScopeKey]: b })
          .on('runtime-context-cordis-contract/changed', (...args) => {
            received.push(['b', ...args])
          })
      }),
    )
    await handles[0]?.publish({ scope: a, tenant: tenantA, value: 1 })
    expect(received).toHaveLength(1)
    expect(received[0]?.[0]).toBe('a')
    expect(received[0]?.slice(1)).toHaveLength(2)
    expect(received[0]?.[1]).toEqual(a)
    expect(typeof received[0]?.[2]).toBe('number')
  })

  it('a listener that throws does not undo the publication', async () => {
    const { ctx, ports, service } = await loaded()
    const handles: ProducerHandle[] = []
    await ctx.plugin(producerPlugin('producer', handles))
    const a = scope('wake/throw')
    const reader = await opened(ctx, ports, service, a)
    await ctx.plugin(
      plugin('bad-listener', inner => {
        inner
          .extend({ [runtimeContextScopeKey]: a })
          .on('runtime-context-cordis-contract/changed', () => {
            throw new Error('listener failed')
          })
      }),
    )
    expect((await handles[0]?.publish({ scope: a, tenant: tenantA, value: 4 }))?.kind).toBe(
      'published',
    )
    expect(await value(reader)).toEqual({ kind: 'value', value: 4 })
  })

  it('bind refuses a caller whose intercept declares another class or none', async () => {
    const { ctx, ports, service } = await loaded()
    const target = scope('bind/class')
    await opened(ctx, ports, service, target)
    const issued = await service.issueEligibility('holder', {
      supersedes: null,
      scope: target,
      consumer: 'model',
      principal: 'reader',
      tenant: tenantA,
      keys: [],
      bindings: [],
      registrationRevision: 1,
    })
    if (issued.kind !== 'issued') throw new Error(issued.kind)
    const replies: unknown[] = []
    for (const inject of [
      { runtimeContext: { consumer: 'tool' } },
      [runtimeContextKey],
      { runtimeContext: { consumer: 'model' } },
    ])
      await ctx.plugin(
        plugin(
          'consumer',
          async inner => {
            const bound = await inner.runtimeContext.bind(issued.eligibility.id)
            replies.push(bound.kind === 'bound' ? 'bound' : bound)
          },
          inject,
        ),
      )
    expect(replies).toEqual([
      { kind: 'refused', reason: 'callerMismatch' },
      { kind: 'refused', reason: 'callerMismatch' },
      'bound',
    ])
  })
})

describe('unloading', () => {
  it('closes the mechanism: a captured reader answers closed and a read in flight settles', async () => {
    const { ctx, ports, fiber, service } = await loaded({ settleBoundMs: 50 })
    const reader = await opened(ctx, ports, service, scope('unload/read'))
    const hanging = deferred<AuthorityDecision<unknown>>()
    const readerFace = ports.authority.reader
    let calls = 0
    ports.authority.reader = (principal, eligibility) => {
      calls++
      return calls === 1 ? hanging.promise : readerFace(principal, eligibility)
    }
    const reading = reader.snapshot()
    const started = Date.now()
    await fiber.dispose()
    expect(Date.now() - started).toBeLessThan(1000)
    expect(await reading).toEqual({ kind: 'refused', reason: 'closed' })
    expect(await reader.snapshot()).toEqual({ kind: 'refused', reason: 'closed' })
    expect(ctx.get(runtimeContextKey)).toBeUndefined()
  })

  it('producer disposers that run after the provider closed return safely', async () => {
    const { ctx, fiber } = await loaded()
    const handles: ProducerHandle[] = []
    const producer = await ctx.plugin(producerPlugin('late', handles))
    await fiber.dispose()
    await expect(producer.dispose()).resolves.toBeUndefined()
    await expect(handles[0]?.dispose()).resolves.toBeUndefined()
  })
})
