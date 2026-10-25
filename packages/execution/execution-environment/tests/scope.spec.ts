// The requester's scope: it travels with every placement and acquisition, independent of the
// binding layer, and description, scope release and recovery filter by it on every layer.
import { expect, it } from 'vitest'
import {
  createRecoveryAccess,
  originRef,
  type EnvironmentBinding,
  type ProviderAcquireInput,
  type RecoveryAuthority,
} from '@omne-harness/execution-environment-contract'
import {
  accessA,
  acquireInput,
  host,
  leased,
  placed,
  registryWith,
  requirement,
  resource,
  scope,
  scope1,
  scriptedProvider,
  session,
  tenantA,
  want,
  stateOf,
} from './doubles.ts'

const scope2 = scope('scope-2')
const expired = { kind: 'rejected', reason: 'referenceExpired' }
const invalidInput = { kind: 'rejected', reason: 'invalidInput' }

it('invalidates a host lease of the released scope and refuses that scope from then on', async () => {
  const registry = registryWith([scriptedProvider()])
  const inScope1 = await leased(registry, await placed(registry, requirement([host])), 'host-1')
  const inScope2 = await leased(
    registry,
    await placed(registry, requirement([host]), accessA, scope2),
    'host-2',
    undefined,
    accessA,
    scope2,
  )
  expect(await registry.releaseScope(scope1, createRecoveryAccess())).toMatchObject({
    kind: 'recovered',
  })
  await expect(inScope1.lease.invalidated).resolves.toEqual({
    source: 'registry',
    reason: 'scopeReleased',
  })
  expect(await stateOf(registry, accessA, 'host-2')).toEqual({
    kind: 'acquired',
    adoption: inScope2.adoption,
  })
  expect(await registry.resolvePlacement(accessA, want(requirement([host])))).toEqual(expired)
  const placement = await placed(registry, requirement([host]), accessA, scope2)
  expect(
    await registry.acquire(accessA, acquireInput(placement, 'host-3', undefined, scope1)),
  ).toEqual(expired)
  expect(await stateOf(registry, accessA, 'host-3')).toEqual({
    kind: 'rejected',
    reason: 'referenceExpired',
  })
})

it('describes a host placement under the scope that acquired it, not under another scope', async () => {
  const registry = registryWith([scriptedProvider()])
  await leased(registry, await placed(registry, requirement([host])), 'host-1')
  expect(await registry.describe(accessA, scope1)).toMatchObject([
    { acquisition: 'host-1', binding: host, state: 'acquired' },
  ])
  expect(await registry.describe(accessA, scope2)).toEqual([])
})

it('refuses a sandbox layer that names another scope than the requester, without a record', async () => {
  const provider = scriptedProvider({ bindingKinds: ['session_sandbox', 'stateless_sandbox'] })
  const registry = registryWith([provider])
  expect(await registry.resolvePlacement(accessA, want(requirement([session]), scope2))).toEqual(
    invalidInput,
  )
  const placement = await placed(registry, requirement([session]))
  expect(
    await registry.acquire(accessA, acquireInput(placement, 'acq-1', undefined, scope2)),
  ).toEqual(invalidInput)
  const stateless: EnvironmentBinding = {
    kind: 'stateless_sandbox',
    scope: scope1,
    origin: originRef('call-1'),
  }
  expect(await registry.resolvePlacement(accessA, want(requirement([stateless]), scope2))).toEqual(
    invalidInput,
  )
  expect(provider.calls.acquire).toBe(0)
  expect(await stateOf(registry, accessA, 'acq-1')).toEqual({
    kind: 'unrecorded',
  })
})

it('a tenant sandbox placement fits any requester scope and is filed under that scope', async () => {
  const tenantSandbox: EnvironmentBinding = { kind: 'tenant_sandbox', tenant: tenantA }
  const registry = registryWith([scriptedProvider({ bindingKinds: ['tenant_sandbox'] })])
  const placement = await placed(registry, requirement([tenantSandbox]), accessA, scope2)
  await leased(registry, placement, 'tenant-1', undefined, accessA, scope2)
  expect(await registry.describe(accessA, scope2)).toMatchObject([{ acquisition: 'tenant-1' }])
  expect(await registry.describe(accessA, scope1)).toEqual([])
})

it('a repeat under the same key from another requester scope is a parameter conflict', async () => {
  const provider = scriptedProvider()
  const registry = registryWith([provider])
  const placement = await placed(registry, requirement([host]))
  await leased(registry, placement, 'host-1')
  expect(
    await registry.acquire(accessA, acquireInput(placement, 'host-1', undefined, scope2)),
  ).toEqual({ kind: 'rejected', reason: 'acquisitionConflict' })
  expect(provider.calls.acquire).toBe(1)
})

it('hands the requester scope to the provider', async () => {
  const seen: ProviderAcquireInput[] = []
  const healthy = scriptedProvider()
  const provider = scriptedProvider({
    acquire: async input => {
      seen.push(input)
      return healthy.acquire(input)
    },
  })
  const registry = registryWith([provider])
  await leased(
    registry,
    await placed(registry, requirement([host]), accessA, scope2),
    'host-1',
    undefined,
    accessA,
    scope2,
  )
  expect(seen.map(input => input.scope)).toEqual([scope2])
})

it('offers the pending resources of a host acquisition to recovery under its requester scope', async () => {
  const offered: unknown[] = []
  const authority: RecoveryAuthority = {
    async authorizeRecovery(_access, asked, resources) {
      offered.push([asked.ref, resources])
      return 'notAuthorized'
    },
  }
  const provider = scriptedProvider({
    release: async () => ({ kind: 'pending', resources: [resource('r1')] }),
  })
  const registry = registryWith([provider], authority)
  const acquired = await leased(registry, await placed(registry, requirement([host])), 'host-1')
  await acquired.lease.release()
  await registry.recoverOwned(scope1, createRecoveryAccess())
  await registry.recoverOwned(scope2, createRecoveryAccess())
  expect(offered).toEqual([
    ['scope-1', [resource('r1')]],
    ['scope-2', []],
  ])
})
