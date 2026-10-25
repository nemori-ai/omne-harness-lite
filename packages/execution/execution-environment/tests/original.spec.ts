// Original acquisitions: the local query and its cache table, the original and recovery queries,
// same-key adoption after a lost response, and recovery over the acquisition path.
import { expect, it } from 'vitest'
import {
  createRecoveryAccess,
  type AcquisitionSettlement,
  type OriginalAcquisition,
  type Placement,
  type ProviderAcquisitionStatus,
  type RecoveryAuthority,
} from '@omne-harness/execution-environment-contract'
import {
  accessA,
  accessB,
  acquireInput,
  host,
  local,
  openAuthority,
  placed,
  registryWith,
  requirement,
  resource,
  scope,
  scope1,
  scopeB,
  scriptedProvider,
  stateOf,
  tenantA,
} from './doubles.ts'

function originalOf(placement: Placement, key = 'acq-1'): OriginalAcquisition {
  const input = acquireInput(placement, key)
  return {
    tenant: tenantA,
    acquisition: input.acquisition,
    origin: input.origin,
    scope: input.scope,
    placement,
  }
}

/** A provider whose first allocation answer is lost; its original record still answers queries. */
function lostResponse(
  inspect?: (original: OriginalAcquisition) => Promise<ProviderAcquisitionStatus>,
) {
  const healthy = scriptedProvider()
  return {
    healthy,
    provider: scriptedProvider({
      acquire: async input => {
        await healthy.acquire(input)
        throw new Error('response lost')
      },
      inspect: inspect ?? (original => healthy.inspectAcquisition(original)),
    }),
  }
}

it('answers an original query of another tenant as not authorized without asking the provider', async () => {
  const provider = scriptedProvider()
  const registry = registryWith([provider])
  const placement = await placed(registry, requirement([host]))
  await registry.acquire(accessA, acquireInput(placement))
  expect(
    await registry.inspectAcquisition(accessB, {
      kind: 'original',
      original: originalOf(placement),
    }),
  ).toEqual({ kind: 'refused', reason: 'notAuthorized' })
  // The scope is tenant B's, so only the description's tenant can refuse it (rule 3).
  const claimed = { ...originalOf(placement), scope: scopeB }
  expect(
    await registry.inspectAcquisition(accessB, { kind: 'original', original: claimed }),
  ).toEqual({ kind: 'refused', reason: 'notAuthorized' })
  expect(provider.calls.inspect).toBe(0)
})

it('adopts a lost allocation once, even for two concurrent repeats, without a second provider call', async () => {
  const { provider } = lostResponse()
  const registry = registryWith([provider])
  const placement = await placed(registry, requirement([host]))
  expect((await registry.acquire(accessA, acquireInput(placement))).kind).toBe('unknown')
  expect(await stateOf(registry, accessA, 'acq-1')).toEqual({ kind: 'provisional' })
  const [first, second] = await Promise.all([
    registry.acquire(accessA, acquireInput(placement)),
    registry.acquire(accessA, acquireInput(placement)),
  ])
  if (first.kind !== 'acquired' || second.kind !== 'acquired') throw new Error('expected leases')
  expect(second.lease).toBe(first.lease)
  expect(second.adoption).toBe(first.adoption)
  expect(provider.calls.acquire).toBe(1)
})

it('records a confirmed non-allocation as a final refusal that the same key repeats', async () => {
  const { provider } = lostResponse(async () => ({ kind: 'notAllocated' }))
  const registry = registryWith([provider])
  const placement = await placed(registry, requirement([host]))
  await registry.acquire(accessA, acquireInput(placement))
  expect(await stateOf(registry, accessA, 'acq-1')).toEqual({
    kind: 'rejected',
    reason: 'allocationNotPerformed',
  })
  expect(await registry.acquire(accessA, acquireInput(placement))).toEqual({
    kind: 'rejected',
    reason: 'allocationNotPerformed',
  })
  expect(provider.calls.acquire).toBe(1)
})

it('maps settled, releasing, conflict, unavailable and unknown original answers per the cache table', async () => {
  const answers: ProviderAcquisitionStatus[] = [
    { kind: 'unavailable' },
    { kind: 'unknown' },
    { kind: 'conflict' },
    { kind: 'pending', phase: 'releasing', resources: [resource('r1')] },
  ]
  const { provider } = lostResponse(async () => answers.shift() ?? { kind: 'settled' })
  const registry = registryWith([provider])
  const placement = await placed(registry, requirement([host]))
  await registry.acquire(accessA, acquireInput(placement))
  expect(await registry.inspectAcquisition(accessA, local('acq-1'))).toEqual({
    kind: 'queryUnavailable',
    cause: 'provider',
  })
  expect(await registry.inspectAcquisition(accessA, local('acq-1'))).toEqual({
    kind: 'queryUnknown',
    cause: 'provider',
  })
  expect(await registry.inspectAcquisition(accessA, local('acq-1'))).toEqual({
    kind: 'original',
    status: 'conflict',
    original: originalOf(placement),
  })
  expect(await stateOf(registry, accessA, 'acq-1')).toEqual({
    kind: 'pendingRelease',
    adoption: null,
    resources: [resource('r1')],
  })
  expect(await registry.acquire(accessA, acquireInput(placement))).toMatchObject({
    kind: 'pending',
  })
  expect(provider.calls.acquire).toBe(1)
})

it('keeps an adoption failure when the original record contradicts the confirmed allocation', async () => {
  const provider = scriptedProvider({
    receiptBinding: { kind: 'session_sandbox', scope: scope1 },
    release: async () => ({ kind: 'pending', resources: [] }),
    inspect: async () => ({ kind: 'notAllocated' }),
  })
  const registry = registryWith([provider])
  const placement = await placed(registry, requirement([host]))
  expect((await registry.acquire(accessA, acquireInput(placement))).kind).toBe('allocationFailed')
  expect(await registry.inspectAcquisition(accessA, local('acq-1'))).toEqual({
    kind: 'queryUnknown',
    cause: 'provider',
  })
  expect(await registry.acquire(accessA, acquireInput(placement))).toMatchObject({
    kind: 'allocationFailed',
    reason: 'unavailable',
  })
})

it('answers an original query with the provider fact and never a lease', async () => {
  const provider = scriptedProvider()
  const registry = registryWith([provider])
  const placement = await placed(registry, requirement([host]))
  const acquired = await registry.acquire(accessA, acquireInput(placement))
  if (acquired.kind !== 'acquired') throw new Error('expected a lease')
  expect(
    await registry.inspectAcquisition(accessA, {
      kind: 'original',
      original: originalOf(placement),
    }),
  ).toEqual({
    kind: 'original',
    status: 'allocated',
    original: originalOf(placement),
    adoption: acquired.adoption,
  })
  const unrouted = { ...originalOf(placement), placement: { ...placement, quotaDomain: 'gone' } }
  expect(
    await registry.inspectAcquisition(accessA, { kind: 'original', original: unrouted }),
  ).toEqual({ kind: 'queryUnavailable', cause: 'provider' })
})

it('answers the recovery query with the recovery authority answer', async () => {
  const answers: ('notAuthorized' | 'unavailable' | Error)[] = [
    'notAuthorized',
    'unavailable',
    new Error('authority down'),
  ]
  const authority: RecoveryAuthority = {
    async authorizeRecovery() {
      const answer = answers.shift()
      if (answer instanceof Error) throw answer
      return answer ?? 'authorized'
    },
  }
  const provider = scriptedProvider()
  const registry = registryWith([provider], authority)
  const placement = await placed(registry, requirement([host]))
  const original = originalOf(placement)
  const access = createRecoveryAccess()
  expect(await registry.inspectRecoveryAcquisition(access, original)).toEqual({
    kind: 'refused',
    reason: 'notAuthorized',
  })
  expect(await registry.inspectRecoveryAcquisition(access, original)).toEqual({
    kind: 'queryUnavailable',
    cause: 'authority',
  })
  expect(await registry.inspectRecoveryAcquisition(access, original)).toEqual({
    kind: 'queryUnknown',
    cause: 'authority',
  })
  expect(await registry.inspectRecoveryAcquisition(access, original)).toEqual({
    kind: 'original',
    status: 'notAllocated',
    original,
  })
  expect(provider.calls.acquire).toBe(0)
})

it('refuses a known list with a description of another scope before asking the recovery authority', async () => {
  let asked = 0
  const authority: RecoveryAuthority = {
    async authorizeRecovery() {
      asked++
      return 'authorized'
    },
  }
  const registry = registryWith([scriptedProvider()], authority)
  const placement = await placed(registry, requirement([host]))
  const elsewhere = { ...originalOf(placement), scope: scope('scope-2') }
  expect(await registry.recoverOwned(scope1, createRecoveryAccess(), [elsewhere])).toEqual({
    kind: 'rejected',
    reason: 'invalidInput',
  })
  expect(asked).toBe(0)
})

it('sorts settlement answers into the acquisition groups and an unreadable listing into unavailable', async () => {
  const answers = new Map<string, AcquisitionSettlement>([
    ['settled', { kind: 'settled' }],
    ['never', { kind: 'notAllocated' }],
    ['waiting', { kind: 'pending', resources: [resource('w1')] }],
    ['odd', { kind: 'unsupported' }],
    ['mismatch', { kind: 'conflict' }],
    ['lost', { kind: 'unknown' }],
  ])
  const keys = [...answers.keys()]
  const provider = scriptedProvider({
    settle: async original => answers.get(original.acquisition) ?? { kind: 'unknown' },
  })
  const unlisted = scriptedProvider({
    name: 'unlisted',
    bindingKinds: ['session_sandbox'],
    listAcquisitions: async () => ({ kind: 'unavailable' }),
  })
  const registry = registryWith([provider, unlisted])
  const placement = await placed(registry, requirement([host]))
  const known = keys.map(key => originalOf(placement, key))
  const result = await registry.recoverOwned(scope1, createRecoveryAccess(), known)
  if (result.kind !== 'recovered') throw new Error('expected a recovery')
  expect(result.settledAcquisitions.map(item => [item.original.acquisition, item.outcome])).toEqual(
    [
      ['settled', 'settled'],
      ['never', 'notAllocated'],
    ],
  )
  expect(
    result.pendingAcquisitions.map(item => [
      item.original.acquisition,
      item.reason,
      item.resources,
    ]),
  ).toEqual([
    ['waiting', 'pending', [resource('w1')]],
    ['mismatch', 'unknown', []],
    ['lost', 'unknown', []],
  ])
  expect(result.unsupportedAcquisitions.map(item => item.acquisition)).toEqual(['odd'])
  expect(result.unavailable).toEqual([
    { name: 'unlisted', generation: '1', version: 'test-version' },
  ])
})

it('settles a listed acquisition once per quota domain and releases the local record', async () => {
  const provider = scriptedProvider()
  const twin = scriptedProvider({ generation: '2', quotaDomain: 'scripted' })
  const registry = registryWith([provider])
  const placement = await placed(registry, requirement([host], ['command']))
  // A second registration of the same quota domain arrives after the placement.
  registry.registerProvider(twin)
  const acquired = await registry.acquire(accessA, acquireInput(placement))
  if (acquired.kind !== 'acquired') throw new Error('expected a lease')
  const result = await registry.releaseScope(scope1, createRecoveryAccess())
  if (result.kind !== 'recovered') throw new Error('expected a recovery')
  expect(result.settledAcquisitions).toHaveLength(1)
  expect(provider.calls.listAcquisitions + twin.calls.listAcquisitions).toBe(1)
  expect(await stateOf(registry, accessA, 'acq-1')).toEqual({
    kind: 'released',
    adoption: acquired.adoption,
  })
})

it('refuses a local query whose access is revoked while the provider answers, and keeps the record', async () => {
  const authority = openAuthority()
  let answering: () => void = () => undefined
  let asked = 0
  const { provider } = lostResponse(async () => {
    asked += 1
    if (asked > 1) return { kind: 'unknown' }
    return new Promise<ProviderAcquisitionStatus>(resolve => {
      answering = () => resolve({ kind: 'notAllocated' })
    })
  })
  const registry = registryWith([provider], undefined, { authority })
  const placement = await placed(registry, requirement([host]))
  await registry.acquire(accessA, acquireInput(placement))
  const query = registry.inspectAcquisition(accessA, local('acq-1'))
  await new Promise(resolve => setTimeout(resolve, 0))
  authority.revokeAll()
  answering()
  expect(await query).toEqual({ kind: 'refused', reason: 'notAuthorized' })
  // The late notAllocated was not applied: the record still needs the original, so a fresh
  // authorized query asks again instead of reading a final refusal.
  expect(await registry.inspectAcquisition(accessA, local('acq-1'))).toEqual({
    kind: 'queryUnknown',
    cause: 'provider',
  })
  expect(provider.calls.acquire).toBe(1)
})

it('refuses an original query whose access is revoked while the provider answers', async () => {
  const authority = openAuthority()
  let answering: () => void = () => undefined
  const provider = scriptedProvider({
    inspect: () =>
      new Promise<ProviderAcquisitionStatus>(resolve => {
        answering = () => resolve({ kind: 'notAllocated' })
      }),
  })
  const registry = registryWith([provider], undefined, { authority })
  const placement = await placed(registry, requirement([host]))
  const query = registry.inspectAcquisition(accessA, {
    kind: 'original',
    original: originalOf(placement),
  })
  await new Promise(resolve => setTimeout(resolve, 0))
  authority.revokeAll()
  answering()
  expect(await query).toEqual({ kind: 'refused', reason: 'notAuthorized' })
})
