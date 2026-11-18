import { afterEach, describe, expect, it } from 'vitest'
import type { TenantId } from '@omne-harness/legal-identity'
import {
  ENABLED_EXTENSIONS_BLOCK,
  type EnabledExtensionsRead,
} from '@omne-harness/loop-extension-contract'
import {
  createEnabledExtensionsPublisher,
  createEnabledExtensionsViews,
} from '@omne-harness/loop-extension-host-local'
import { createRuntimeContext } from '@omne-harness/runtime-context'
import {
  decodeScopeRef,
  type ProducerHandle,
  type ProducerRegistration,
  type RegisterProducerResult,
  type ScopeRef,
} from '@omne-harness/runtime-context-contract'
import { createTestAuthorityPorts } from '@omne-harness/runtime-context-contract/testing'
import { openTenant, probe, sourcesOf, tenantA, tenantB, type TenantWorld } from './world.ts'

const worlds: TenantWorld[] = []
afterEach(async () => {
  await Promise.all(worlds.splice(0).map(world => world.close()))
})

function scopeOf(ref: string): ScopeRef {
  const decoded = decodeScopeRef({ ref })
  if (!('ok' in decoded)) throw new Error('Invalid fixture scope')
  return decoded.ok
}

/** A real Runtime Context with one open scope of the tenant that registered this block when it was created. */
async function context(tenant: TenantId, ref: string) {
  const ports = createTestAuthorityPorts<string>()
  const rc = createRuntimeContext<string>({
    trust: { authority: ports.authority, bindings: ports.bindings },
    config: {},
  })
  const scope = scopeOf(ref)
  ports.bind(scope, tenant)
  const begun = await rc.beginReplay('holder', { scope, tenant, through: null, supersedes: null })
  if (begun.kind !== 'replaying') throw new Error(JSON.stringify(begun))
  const ready = await rc.finishReplay('holder', {
    replay: begun.replay,
    material: { registrations: [], checkpoints: [], end: null },
  })
  if (ready.kind !== 'ready') throw new Error(JSON.stringify(ready))
  async function register() {
    const applied = await rc.applyCommit('holder', {
      kind: 'registration',
      commit: { commit: `${ref}:register` },
      after: null,
      change: {
        kind: 'add',
        creating: true,
        scope,
        tenant,
        key: ENABLED_EXTENSIONS_BLOCK,
        basedOn: 0,
        required: true,
        bindings: [],
        parameters: undefined,
      },
    })
    if (applied.kind !== 'applied') throw new Error(JSON.stringify(applied))
  }
  async function read() {
    const issued = await rc.issueEligibility('holder', {
      supersedes: null,
      scope,
      consumer: 'coordinator',
      principal: 'reader',
      tenant,
      keys: [ENABLED_EXTENSIONS_BLOCK],
      bindings: [],
      registrationRevision: 0,
    })
    if (issued.kind !== 'issued') throw new Error(JSON.stringify(issued))
    const bound = await rc.bind(issued.eligibility.id)
    if (bound.kind !== 'bound') throw new Error(JSON.stringify(bound))
    const snapshot = await bound.reader.snapshot()
    if (snapshot.kind !== 'success') return snapshot
    return snapshot.value.perRequest.find(entry => entry.key === ENABLED_EXTENSIONS_BLOCK)
  }
  return { rc, register, read }
}

async function enabledTenant() {
  const world = await openTenant(tenantA)
  worlds.push(world)
  const version = await world.publish(probe('probe'))
  world.setRun('probe', { kind: 'value', value: true })
  return { world, version }
}

it('a coordinator reads the block and gets the view of this moment, and after a disable the next read gets the new view', async () => {
  const { world, version } = await enabledTenant()
  const views = createEnabledExtensionsViews({ sources: sourcesOf(world) })
  const { rc, register, read } = await context(tenantA, 'session/one')
  const publisher = createEnabledExtensionsPublisher({
    tenant: tenantA,
    principal: 'producer',
    runtime: rc,
    views,
  })
  expect(await publisher.start()).toMatchObject({ kind: 'registered' })
  await register()
  expect(await read()).toMatchObject({
    kind: 'value',
    value: {
      members: [{ capability: 'probe', version, declaration: probe('probe') }],
      basis: { assets: '2', settings: '1' },
    },
  })
  await world.setEnabled('probe', false)
  expect(await read()).toMatchObject({
    kind: 'value',
    value: { members: [], basis: { assets: '3', settings: '1' } },
  })
  await publisher.close()
  await rc.close()
})

it('a view that cannot be read, and a producer that left, each read as a missing block, never as an empty view', async () => {
  const { world } = await enabledTenant()
  const views = createEnabledExtensionsViews({ sources: sourcesOf(world) })
  const { rc, register, read } = await context(tenantA, 'session/two')
  const publisher = createEnabledExtensionsPublisher({
    tenant: tenantA,
    principal: 'producer',
    runtime: rc,
    views,
  })
  await publisher.start()
  await register()
  world.setRun('probe', { kind: 'unavailable' })
  const unreadable = await read()
  expect(unreadable?.kind).not.toBe('value')
  expect(unreadable?.kind).not.toBe('none')
  world.setRun('probe', { kind: 'value', value: true })
  expect(await read()).toMatchObject({ kind: 'value' })
  await publisher.close()
  expect(await read()).toMatchObject({ kind: 'missing' })
  expect(await publisher.start()).toEqual({ kind: 'rejected', reason: 'closed' })
  await rc.close()
})

it('the producer of one tenant refuses a read for another tenant', async () => {
  const { world } = await enabledTenant()
  const views = createEnabledExtensionsViews({ sources: sourcesOf(world) })
  const supplied: unknown[] = []
  const publisher = createEnabledExtensionsPublisher<string>({
    tenant: tenantA,
    principal: 'producer',
    runtime: {
      async registerProducer(_principal, registration) {
        const scope = scopeOf('session/three')
        for (const tenant of [tenantB, tenantA])
          supplied.push(await registration.supply?.({ scope, tenant, principal: 'reader' }))
        return { kind: 'rejected', reason: 'closed' }
      },
    },
    views,
  })
  await publisher.start()
  expect(supplied).toMatchObject([{ kind: 'refused' }, { kind: 'value' }])
})

describe('the producer, by itself', () => {
  type Key = typeof ENABLED_EXTENSIONS_BLOCK
  type Registration = RegisterProducerResult<Key>
  const view = { members: [], basis: { assets: '1', settings: '1' } }
  const readable: EnabledExtensionsRead = { kind: 'view', view }
  const asked = (tenant: TenantId) => ({
    scope: scopeOf('session/unit'),
    tenant,
    principal: 'reader',
  })

  function arranged(answer?: Promise<Registration>) {
    const seen = { registrations: [] as ProducerRegistration<Key, string>[], disposed: 0 }
    const handle = {
      async dispose() {
        seen.disposed += 1
      },
    } as unknown as ProducerHandle<Key>
    const state = { read: readable }
    const publisher = createEnabledExtensionsPublisher<string>({
      tenant: tenantA,
      principal: 'producer',
      runtime: {
        async registerProducer(_principal, registration) {
          seen.registrations.push(registration)
          return answer ?? { kind: 'registered', handle }
        },
      },
      views: { read: async () => state.read },
    })
    return { publisher, seen, state, handle }
  }

  it('registers once for the tenant, not for a scope, and answers each read from the view of that moment', async () => {
    const a = arranged()
    expect(await a.publisher.start()).toEqual({ kind: 'registered', handle: a.handle })
    await a.publisher.start()
    expect(a.seen.registrations).toHaveLength(1)
    const [registration] = a.seen.registrations
    expect(registration).toMatchObject({
      key: ENABLED_EXTENSIONS_BLOCK,
      tenant: tenantA,
      scoped: false,
    })
    const supply = registration?.supply as (input: unknown) => Promise<unknown>
    expect(await supply(asked(tenantA))).toEqual({ kind: 'value', value: view })
    a.state.read = { kind: 'unavailable', diagnostic: 'away' }
    expect(await supply(asked(tenantA))).toEqual({ kind: 'unavailable' })
    expect(await supply(asked(tenantB))).toEqual({ kind: 'refused' })
    a.state.read = readable
    await a.publisher.close()
    expect(a.seen.disposed).toBe(1)
    expect(await supply(asked(tenantA))).toEqual({ kind: 'unavailable' })
  })

  it('gives the answer of a registration that was not taken, and then has nothing to dispose', async () => {
    const rejected: Registration = { kind: 'rejected', reason: 'other-producer' }
    const a = arranged(Promise.resolve(rejected))
    expect(await a.publisher.start()).toEqual(rejected)
    await a.publisher.close()
    expect(a.seen.disposed).toBe(0)
  })

  it('closes without a start, and is closed to a start after that', async () => {
    const a = arranged()
    await a.publisher.close()
    expect(await a.publisher.start()).toEqual({ kind: 'rejected', reason: 'closed' })
    expect(a.seen.registrations).toEqual([])
  })

  it.each([
    [
      'taken',
      (handle: ProducerHandle<Key>): Registration => ({ kind: 'registered', handle }),
      { kind: 'rejected', reason: 'closed' },
      1,
    ],
    [
      'not taken',
      (): Registration => ({ kind: 'rejected', reason: 'other-producer' }),
      { kind: 'rejected', reason: 'other-producer' },
      0,
    ],
  ] as const)(
    'a close that arrives while it registers leaves no producer behind when the registration is %s',
    async (_name, answer, expected, disposed) => {
      const pending = Promise.withResolvers<Registration>()
      const a = arranged(pending.promise)
      const starting = a.publisher.start()
      const closing = a.publisher.close()
      pending.resolve(answer(a.handle))
      expect(await starting).toEqual(expected)
      await closing
      expect(a.seen.disposed).toBe(disposed)
    },
  )
})
