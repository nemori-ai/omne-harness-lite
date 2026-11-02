import { tenantCodec } from '@omne-harness/legal-identity'
import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import type {
  EligibilityMaterial,
  SuppliedBlockDescriptor,
  ScopeRef,
  ProducerHandle,
} from '@omne-harness/runtime-context-contract'
import {
  RuntimeContextService,
  runtimeContextKey,
  runtimeContextScopeKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
import { Probe, plugin } from './support.js'

function scope(ref: string): ScopeRef {
  const result = decodeScopeRef({ ref })
  if ('failure' in result) throw new Error('invalid fixture')
  return result.ok
}
const first = scope('a'),
  second = scope('b')
const decodedTenant = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_00000000000000000000000000',
    account: 'acc_00000000000000000000000000',
  }),
)
if (!decodedTenant.ok) throw new Error('Invalid fixture tenant')
const tenant = decodedTenant.value
const descriptor: SuppliedBlockDescriptor<'probe.value', unknown> & { volatility: 'stable' } = {
  kind: 'supplied',
  key: 'probe.value',
  schema: { '~standard': { version: 1, vendor: 'probe', validate: value => ({ value }) } },
  consumers: ['model', 'tool'],
  required: true,
  disclosure: 'plain',
  carriesPrevious: true,
  volatility: 'stable',
  recovery: 'reread',
}

it('exports only the abstract Services, their unique keys and scope metadata key', async () => {
  expect(
    Object.keys(await import('@omne-harness/runtime-context-cordis-contract/cordis')).sort(),
  ).toEqual(
    [
      'RuntimeContextService',
      'RuntimeContextTrustService',
      'RuntimeContextReaderEligibilityService',
      'runtimeContextKey',
      'runtimeContextTrustKey',
      'runtimeContextReaderEligibilityKey',
      'runtimeContextScopeKey',
    ].sort(),
  )
  expect(runtimeContextKey).toBe(RuntimeContextService.provide)
  expect(runtimeContextKey).toBe('runtimeContext')
  expect(runtimeContextScopeKey).toBe('scope')
})
it('loads a real subclass under the Service key and removes it on unload', async () => {
  const ctx = new Context(),
    fiber = await ctx.plugin(Probe)
  expect(ctx.get(runtimeContextKey)).toBeInstanceOf(Probe)
  await fiber.dispose()
  expect(ctx.get(runtimeContextKey)).toBeUndefined()
})
it('inject-object-config-reaches-service-resolve-config', async () => {
  const ctx = new Context(),
    provider = await ctx.plugin(Probe),
    service = ctx.get(runtimeContextKey)
  expect(service).toBeDefined()
  const ids = [{ eligibility: 'unknown-model' }, { eligibility: 'unknown-tool' }]
  await ctx.plugin(
    plugin(
      'model-caller',
      async inner => {
        await inner.runtimeContext.bind(ids[0] ?? { eligibility: 'never' })
      },
      { runtimeContext: { consumer: 'model' } },
    ),
  )
  await ctx.plugin(
    plugin(
      'tool-caller',
      async inner => {
        await inner.runtimeContext.bind(ids[1] ?? { eligibility: 'never' })
      },
      { runtimeContext: { consumer: 'tool' } },
    ),
  )
  const instance = ctx.get(runtimeContextKey)
  if (!(instance instanceof Probe)) throw new Error('Missing fixture provider')
  expect(instance.consumers).toEqual(['model', 'tool'])
  await provider.dispose()
})
it('bind compares declared consumer against an actually issued eligibility, without authorizing via intercept', async () => {
  const ctx = new Context(),
    provider = await ctx.plugin(Probe),
    instance = ctx.get(runtimeContextKey)
  if (!(instance instanceof Probe)) throw new Error('Missing fixture provider')
  await instance.prepare(first, tenant, 'probe.other')
  const material: EligibilityMaterial = {
    scope: first,
    tenant,
    principal: 'probe',
    consumer: 'model',
    keys: [],
    bindings: [],
    registrationRevision: 0,
    supersedes: null,
  }
  const issued = await instance.issueEligibility('probe', material)
  expect(issued.kind).toBe('issued')
  if (issued.kind !== 'issued') throw new Error('No fixture eligibility')
  expect(await instance.bind(issued.eligibility.id)).toEqual({
    kind: 'refused',
    reason: 'unauthorized',
  })
  const replies: unknown[] = []
  await ctx.plugin(
    plugin(
      'wrong-consumer',
      async inner => {
        replies.push(await inner.runtimeContext.bind(issued.eligibility.id))
      },
      { runtimeContext: { consumer: 'tool' } },
    ),
  )
  await ctx.plugin(
    plugin(
      'right-consumer',
      async inner => {
        replies.push((await inner.runtimeContext.bind(issued.eligibility.id)).kind)
      },
      { runtimeContext: { consumer: 'model' } },
    ),
  )
  expect(replies).toEqual([{ kind: 'refused', reason: 'unauthorized' }, 'bound'])
  expect(instance.consumers).toEqual([undefined, 'tool', 'model'])
  await provider.dispose()
})
it('registerProducer effect belongs to the caller fiber, and caller unload withdraws only its registration', async () => {
  const ctx = new Context(),
    provider = await ctx.plugin(Probe)
  let handle: ProducerHandle | undefined
  const producer = await ctx.plugin(
    plugin(
      'producer',
      async inner => {
        const result = await inner.runtimeContext.registerProducer('probe', {
          key: 'probe.value',
          tenant,
          producer: { producer: 'producer' },
          declaration: descriptor,
          scoped: true,
        })
        expect(result.kind).toBe('registered')
        if (result.kind === 'registered') handle = result.handle
      },
      [runtimeContextKey],
    ),
  )
  expect(handle).toBeDefined()
  await producer.dispose()
  expect((await handle?.publish({ scope: first, tenant, value: 12 }))?.kind).toBe('rejected')
  expect(ctx.get(runtimeContextKey)).toBeInstanceOf(Probe)
  await provider.dispose()
})
it('explicit handle disposal and later caller disposal share idempotent cleanup', async () => {
  const ctx = new Context(),
    provider = await ctx.plugin(Probe)
  let handle: ProducerHandle | undefined
  const producer = await ctx.plugin(
    plugin(
      'explicit-producer',
      async inner => {
        const result = await inner.runtimeContext.registerProducer('probe', {
          key: 'probe.value',
          tenant,
          producer: { producer: 'producer' },
          declaration: descriptor,
          scoped: true,
        })
        if (result.kind === 'registered') handle = result.handle
      },
      [runtimeContextKey],
    ),
  )
  await handle?.dispose()
  expect((await handle?.publish({ scope: first, tenant, value: 12 }))?.kind).toBe('rejected')
  await producer.dispose()
  await provider.dispose()
})
it('emit-filter-selects-listeners-by-extended-ctx', async () => {
  const ctx = new Context(),
    received: unknown[][] = []
  const listener = await ctx.plugin(
    plugin('scoped-listener', inner => {
      inner
        .extend({ [runtimeContextScopeKey]: first })
        .on('runtime-context-cordis-contract/changed', (...args) => {
          received.push(['a', ...args])
        })
      inner
        .extend({ [runtimeContextScopeKey]: second })
        .on('runtime-context-cordis-contract/changed', (...args) => {
          received.push(['b', ...args])
        })
    }),
  )
  const dispatch = ctx.extend({
    [Context.filter]: (target: Context) => target[runtimeContextScopeKey]?.ref === first.ref,
  })
  ctx.emit(dispatch, 'runtime-context-cordis-contract/changed', first, 2)
  expect(received).toEqual([['a', first, 2]])
  await listener.dispose()
  ctx.emit(dispatch, 'runtime-context-cordis-contract/changed', first, 3)
  expect(received).toEqual([['a', first, 2]])
})
it('global listeners bypass the filter, which is why the contract forbids that subscription form', async () => {
  const ctx = new Context(),
    received: unknown[][] = []
  const listener = await ctx.plugin(
    plugin('nonconforming-global-listener', inner => {
      inner.extend({ scope: second }).on(
        'runtime-context-cordis-contract/changed',
        (...args) => {
          received.push(args)
        },
        { global: true },
      )
    }),
  )
  ctx.emit(
    ctx.extend({ [Context.filter]: () => false }),
    'runtime-context-cordis-contract/changed',
    first,
    7,
  )
  expect(received).toEqual([[first, 7]])
  await listener.dispose()
})
it('ctx-set-does-not-notify', async () => {
  const ctx = new Context()
  let owner: Context | undefined,
    runs = 0,
    notifications = 0
  const provider = await ctx.plugin(
    plugin('set-owner', inner => {
      owner = inner
      inner.provide('probeState', { revision: 1 })
    }),
  )
  const consumer = await ctx.plugin(
    plugin(
      'set-consumer',
      () => {
        runs++
      },
      ['probeState'],
    ),
  )
  const listener = await ctx.plugin(
    plugin('service-observer', inner => {
      inner.on('internal/service', name => {
        if (name === 'probeState') notifications++
      })
    }),
  )
  owner?.set('probeState', { revision: 2 })
  expect(ctx.get('probeState')).toEqual({ revision: 2 })
  expect(runs).toBe(1)
  expect(notifications).toBe(0)
  await listener.dispose()
  await consumer.dispose()
  await provider.dispose()
})

it('ancestor intercept is inherited, while a nearer caller declaration overrides it', async () => {
  const ctx = new Context(),
    provider = await ctx.plugin(Probe)
  const inherited = ctx.intercept(runtimeContextKey, { consumer: 'tool' })
  await inherited.plugin(
    plugin(
      'inherited-array',
      async inner => {
        await inner.runtimeContext.bind({ eligibility: 'missing' })
      },
      [runtimeContextKey],
    ),
  )
  await inherited.plugin(
    plugin(
      'local-model',
      async inner => {
        await inner.runtimeContext.bind({ eligibility: 'missing' })
      },
      { runtimeContext: { consumer: 'model' } },
    ),
  )
  const instance = ctx.get(runtimeContextKey)
  if (!(instance instanceof Probe)) throw new Error('Missing fixture provider')
  expect(instance.consumers).toEqual(['tool', 'model'])
  await provider.dispose()
})
it('late disposal from an older caller does not remove a newer generation of the same producer', async () => {
  const ctx = new Context(),
    provider = await ctx.plugin(Probe)
  const handles: ProducerHandle[] = []
  async function register(inner: Context) {
    const result = await inner.runtimeContext.registerProducer('probe', {
      key: 'probe.value',
      tenant,
      producer: { producer: 'shared' },
      declaration: descriptor,
      scoped: true,
    })
    if (result.kind === 'registered') handles.push(result.handle)
  }
  const old = await ctx.plugin(plugin('old-producer', register, [runtimeContextKey]))
  const replacement = await ctx.plugin(plugin('new-producer', register, [runtimeContextKey]))
  const previous = handles[0],
    current = handles[1]
  if (!previous || !current) throw new Error('Missing handles')
  expect(current.generation).toBeGreaterThan(previous.generation)
  const instance = ctx.get(runtimeContextKey)
  if (!(instance instanceof Probe)) throw new Error('Missing fixture provider')
  await instance.prepare(first, tenant, 'probe.value')
  await old.dispose()
  expect((await current.publish({ scope: first, tenant, value: 8 })).kind).toBe('published')
  expect((await previous.publish({ scope: first, tenant, value: 9 })).kind).toBe('rejected')
  await replacement.dispose()
  await provider.dispose()
})
