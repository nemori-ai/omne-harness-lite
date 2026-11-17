import { afterEach, expect, it } from 'vitest'
import type { TenantId } from '@omne-harness/legal-identity'
import { ENABLED_EXTENSIONS_BLOCK } from '@omne-harness/loop-extension-contract'
import {
  createEnabledExtensionsPublisher,
  createEnabledExtensionsViews,
} from '@omne-harness/loop-extension-host-local'
import { createRuntimeContext } from '@omne-harness/runtime-context'
import { decodeScopeRef, type ScopeRef } from '@omne-harness/runtime-context-contract'
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
  await world.hold('probe')
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
