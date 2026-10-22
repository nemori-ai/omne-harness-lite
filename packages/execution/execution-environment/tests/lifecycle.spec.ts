// Registration, retirement, closing, description and recovery of the registry.
import { expect, it } from 'vitest'
import {
  acquisitionRef,
  commandFacility,
  createRecoveryAccess,
  type EnvironmentBinding,
  type EnvironmentProvider,
  type ManagedResource,
  type RecoveryAuthority,
  type ResourceRecovery,
  type Retirement,
} from '@omne-harness/execution-environment-contract'
import { createEnvironmentRegistry, RetirementPending } from '@omne-harness/execution-environment'
import {
  accessA,
  accessB,
  deferred,
  host,
  leased,
  placed,
  recovery,
  registryWith,
  requirement,
  resource,
  scope,
  scriptedProvider,
  session,
  want,
} from './doubles.ts'

it('refuses a second declaration of a key and keeps the first; a stale removal leaves the new one', async () => {
  const registry = createEnvironmentRegistry<string>({ recovery })
  registry.registerProvider(scriptedProvider())
  const removeFirst = registry.registerFacility(commandFacility)
  expect(() => registry.registerFacility(commandFacility)).toThrow(
    'Facility command is already registered',
  )
  expect(await registry.resolvePlacement(accessA, want(requirement([host])))).toMatchObject({
    kind: 'placement',
  })
  await removeFirst()
  registry.registerFacility(commandFacility)
  await removeFirst()
  expect(await registry.resolvePlacement(accessA, want(requirement([host])))).toMatchObject({
    kind: 'placement',
  })
})

it('refuses a provider with the same name and generation, but takes a new generation', () => {
  const registry = registryWith([scriptedProvider({ generation: '1' })])
  expect(() => registry.registerProvider(scriptedProvider({ generation: '1' }))).toThrow(
    'Provider scripted@1 is already registered',
  )
  expect(() => registry.registerProvider(scriptedProvider({ generation: '2' }))).not.toThrow()
})

it('invalidates only the leases of the provider being removed', async () => {
  const onHost = scriptedProvider({ name: 'on-host' })
  const inSandbox = scriptedProvider({ name: 'in-sandbox', bindingKinds: ['session_sandbox'] })
  const registry = registryWith([inSandbox])
  const remove = registry.registerProvider(onHost)
  const hostLease = await leased(registry, await placed(registry, requirement([host])), 'on-host')
  const sandboxLease = await leased(
    registry,
    await placed(registry, requirement([session])),
    'in-sandbox',
  )
  await remove()
  expect(await registry.inspectAcquisition(accessA, acquisitionRef('on-host'))).toEqual({
    kind: 'invalidated',
    adoption: hostLease.adoption,
    invalidation: { source: 'registry', reason: 'providerRetired' },
  })
  expect(await registry.inspectAcquisition(accessA, acquisitionRef('in-sandbox'))).toEqual({
    kind: 'acquired',
    adoption: sandboxLease.adoption,
  })
})

it('throws RetirementPending while retirement leaves resources, retries on the next removal, then drains', async () => {
  const answers: Retirement[] = [
    { kind: 'pending', resources: [resource('r1')] },
    { kind: 'drained' },
  ]
  const provider = scriptedProvider({
    retire: async () => answers.shift() ?? { kind: 'drained' },
  })
  const registry = registryWith([])
  const remove = registry.registerProvider(provider)
  const failure = await remove().then(
    () => undefined,
    (error: unknown) => error,
  )
  expect(failure).toBeInstanceOf(RetirementPending)
  expect(failure).toMatchObject({
    name: 'RetirementPending',
    subject: 'Provider scripted@1',
    resources: [resource('r1')],
    message: 'Provider scripted@1 retired with 1 known resource(s) still pending',
  })
  const access = createRecoveryAccess()
  expect(await registry.recoverOwned(scope('scope-1'), access)).toMatchObject({
    unsupported: [
      {
        kind: 'provider',
        provider: { name: 'scripted', generation: '1', version: 'test-version' },
      },
    ],
  })

  await expect(remove()).resolves.toBeUndefined()
  expect(provider.calls.retire).toBe(2)
  expect(await registry.recoverOwned(scope('scope-1'), access)).toMatchObject({ unsupported: [] })
  await expect(remove()).resolves.toBeUndefined()
  expect(provider.calls.retire).toBe(2)
})

it('shares one retire call between concurrent removals', async () => {
  const answer = deferred<Retirement>()
  const provider = scriptedProvider({ retire: () => answer.promise })
  const registry = registryWith([])
  const remove = registry.registerProvider(provider)
  const both = Promise.all([remove(), remove()])
  answer.resolve({ kind: 'drained' })
  await both
  expect(provider.calls.retire).toBe(1)
})

it('treats a throwing retire as pending with no known resources', async () => {
  const provider = scriptedProvider({
    retire: async () => {
      throw new Error('retire lost')
    },
  })
  const registry = registryWith([])
  const remove = registry.registerProvider(provider)
  await expect(remove()).rejects.toMatchObject({ name: 'RetirementPending', resources: [] })
  expect(await registry.close()).toEqual({ kind: 'pending', resources: [] })
})

it('closes as pending with the resources of every provider that did not drain', async () => {
  const drained = scriptedProvider({ name: 'drained' })
  const first = scriptedProvider({
    name: 'first',
    retire: async () => ({ kind: 'pending', resources: [resource('r1', 'first')] }),
  })
  const second = scriptedProvider({
    name: 'second',
    retire: async () => ({ kind: 'pending', resources: [resource('r2', 'second')] }),
  })
  const registry = registryWith([drained, first, second])
  const closing = registry.close()
  expect(registry.close()).toBe(closing)
  expect(await closing).toEqual({
    kind: 'pending',
    resources: [resource('r1', 'first'), resource('r2', 'second')],
  })
})

it('refuses placement, description and new providers after close, but still answers state and recovery', async () => {
  const provider = scriptedProvider()
  const registry = registryWith([provider])
  const acquired = await leased(registry, await placed(registry, requirement([host])))
  expect(await registry.close()).toEqual({ kind: 'drained' })
  const stopped = { kind: 'rejected', reason: 'ownerStopped' }
  expect(await registry.resolvePlacement(accessA, want(requirement([host])))).toEqual(stopped)
  expect(await registry.describe(accessA, scope('scope-1'))).toEqual(stopped)
  expect(() => registry.registerProvider(scriptedProvider({ name: 'late' }))).toThrow(
    'The environment registry is closed',
  )
  expect(await registry.inspectAcquisition(accessA, acquisitionRef('acq-1'))).toMatchObject({
    kind: 'invalidated',
    adoption: acquired.adoption,
  })
  expect(await registry.recoverOwned(scope('scope-1'), createRecoveryAccess())).toMatchObject({
    kind: 'recovered',
  })
})

it('describes only adopted, unreleased acquisitions of the caller tenant in the given scope', async () => {
  const provider = scriptedProvider({ bindingKinds: ['session_sandbox'] })
  const registry = registryWith([provider])
  const scope2: EnvironmentBinding = { kind: 'session_sandbox', scope: scope('scope-2') }
  const inScope1 = await placed(registry, requirement([session]))
  const kept = await leased(registry, inScope1, 'kept')
  const released = await leased(registry, inScope1, 'released')
  await released.lease.release()
  await leased(registry, inScope1, 'other-tenant', undefined, accessB)
  await leased(
    registry,
    await placed(registry, requirement([scope2]), accessA, scope('scope-2')),
    'other-scope',
  )
  expect(await registry.describe(accessA, scope('scope-1'))).toEqual([
    {
      acquisition: 'kept',
      origin: 'call-1',
      binding: session,
      provider: { name: 'scripted', generation: '1', version: 'test-version' },
      instance: { id: 'scripted-instance', generation: '1' },
      continuity: { kind: 'not_guaranteed' },
      facilities: ['command'],
      state: 'acquired',
    },
  ])
  expect(kept.adoption.acquisition).toBe('kept')
  expect(await registry.describe(accessB, scope('scope-1'))).toMatchObject([
    { acquisition: 'other-tenant' },
  ])
})

function recoveringProvider(name: string, answers: Readonly<Record<string, ResourceRecovery>>) {
  const listed = Object.keys(answers).map(key => resource(key, name))
  return scriptedProvider({
    name,
    recoverable: {
      list: async () => ({ kind: 'listed', resources: listed }),
      recover: async (managed: ManagedResource) => {
        const answer = answers[managed.key]
        if (answer === undefined) throw new Error('unknown resource')
        return answer
      },
    },
  })
}

it('sorts recovered resources into stopped, pending and unsupported, and keeps them when later providers fail', async () => {
  const sorter = recoveringProvider('sorter', {
    stops: { status: 'confirmedStopped', evidence: null },
    waits: { status: 'pending', evidence: null },
    refuses: { status: 'unsupported', evidence: null },
  })
  const throwingStop = scriptedProvider({
    name: 'throwing-stop',
    recoverable: {
      list: async () => ({ kind: 'listed', resources: [resource('t1', 'throwing-stop')] }),
      recover: async () => {
        throw new Error('stop lost')
      },
    },
  })
  const unlisted = scriptedProvider({
    name: 'unlisted',
    recoverable: {
      list: async () => ({ kind: 'unavailable' }),
      recover: async () => ({ status: 'confirmedStopped', evidence: null }),
    },
  })
  const throwingList = scriptedProvider({
    name: 'throwing-list',
    recoverable: {
      list: async () => {
        throw new Error('index down')
      },
      recover: async () => ({ status: 'confirmedStopped', evidence: null }),
    },
  })
  const halfRecoverable: EnvironmentProvider = {
    ...scriptedProvider({ name: 'list-only' }),
    listRecoveryResources: async () => ({ kind: 'listed', resources: [resource('x')] }),
  }
  const plain = scriptedProvider({ name: 'plain' })
  const registry = registryWith([
    sorter,
    throwingStop,
    unlisted,
    throwingList,
    halfRecoverable,
    plain,
  ])
  expect(await registry.recoverOwned(scope('scope-1'), createRecoveryAccess())).toEqual({
    kind: 'recovered',
    scope: scope('scope-1'),
    stopped: [resource('stops', 'sorter')],
    pending: [resource('waits', 'sorter'), resource('t1', 'throwing-stop')],
    unsupported: [
      { kind: 'resource', resource: resource('refuses', 'sorter') },
      {
        kind: 'provider',
        provider: { name: 'list-only', generation: '1', version: 'test-version' },
      },
      { kind: 'provider', provider: { name: 'plain', generation: '1', version: 'test-version' } },
    ],
    unavailable: [
      { name: 'unlisted', generation: '1', version: 'test-version' },
      { name: 'throwing-list', generation: '1', version: 'test-version' },
    ],
  })
  expect(unlisted.calls.recover).toBe(0)
})

it('refuses recovery with the authority answer, or unavailable when the authority throws, and recovers nothing', async () => {
  const answers: ('notAuthorized' | 'unavailable' | Error)[] = [
    'notAuthorized',
    'unavailable',
    new Error('authority down'),
  ]
  const authority: RecoveryAuthority = {
    async authorizeRecovery() {
      const answer = answers.shift()
      if (answer instanceof Error) throw answer
      return answer ?? 'unavailable'
    },
  }
  const provider = recoveringProvider('sorter', {
    stops: { status: 'confirmedStopped', evidence: null },
  })
  const registry = registryWith([provider], authority)
  const access = createRecoveryAccess()
  expect(await registry.recoverOwned(scope('scope-1'), access)).toEqual({
    kind: 'rejected',
    reason: 'notAuthorized',
  })
  expect(await registry.recoverOwned(scope('scope-1'), access)).toEqual({
    kind: 'rejected',
    reason: 'unavailable',
  })
  expect(await registry.releaseScope(scope('scope-1'), access)).toEqual({
    kind: 'rejected',
    reason: 'unavailable',
  })
  expect(provider.calls.list).toBe(0)
  expect(provider.calls.recover).toBe(0)
})

it('releases one scope only: leases of another scope stay valid', async () => {
  const provider = scriptedProvider({ bindingKinds: ['session_sandbox'] })
  const registry = registryWith([provider])
  const scope2: EnvironmentBinding = { kind: 'session_sandbox', scope: scope('scope-2') }
  await leased(registry, await placed(registry, requirement([session])), 'in-1')
  const other = await leased(
    registry,
    await placed(registry, requirement([scope2]), accessA, scope('scope-2')),
    'in-2',
  )
  await registry.releaseScope(scope('scope-1'), createRecoveryAccess())
  expect(await registry.inspectAcquisition(accessA, acquisitionRef('in-1'))).toMatchObject({
    kind: 'invalidated',
    invalidation: { source: 'registry', reason: 'scopeReleased' },
  })
  expect(await registry.inspectAcquisition(accessA, acquisitionRef('in-2'))).toEqual({
    kind: 'acquired',
    adoption: other.adoption,
  })
})

it('keeps adopted descriptions through invalidation and pending release, then removes settled acquisitions', async () => {
  const firstRelease =
    deferred<import('@omne-harness/execution-environment-contract').LeaseRelease>()
  let releases = 0
  const provider = scriptedProvider({
    release: async () => (++releases === 1 ? firstRelease.promise : { kind: 'released' }),
  })
  const registry = registryWith([provider])
  const acquired = await leased(
    registry,
    await placed(registry, requirement([host])),
    'description-states',
  )
  const describe = () => registry.describe(accessA, scope('scope-1'))
  expect(await describe()).toMatchObject([
    { state: 'acquired', instance: acquired.adoption.instance },
  ])
  provider.invalidateLeases({ source: 'provider', reason: 'lost' })
  await acquired.lease.invalidated
  expect(await describe()).toMatchObject([
    { state: 'invalidated', instance: acquired.adoption.instance },
  ])
  const release = acquired.lease.release()
  expect(await describe()).toMatchObject([
    { state: 'releasing', instance: acquired.adoption.instance },
  ])
  firstRelease.resolve({ kind: 'pending', resources: [] })
  await release
  expect(await describe()).toMatchObject([
    { state: 'pendingRelease', instance: acquired.adoption.instance },
  ])
  await acquired.lease.release()
  expect(await describe()).toEqual([])
})
