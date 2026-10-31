// Acquisition: provider answers, the recheck after resolving, verification of the receipt, the
// compensating release, idempotent repeats and tenant checks.
import { expect, it } from 'vitest'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  acquisitionRef,
  commandFacility,
  type Access,
  createRecoveryAccess,
  judgeRequirement,
  originRef,
  type EnvironmentBinding,
  type LeaseRelease,
  type Placement,
  type ProviderAcquisition,
  type RecoveryAuthority,
} from '@omne-harness/execution-environment-contract'
import {
  createEnvironmentRegistry,
  type EnvironmentRegistry,
} from '@omne-harness/execution-environment'
import {
  accessA,
  accessB,
  acquireInput,
  deferred,
  host,
  leased,
  local,
  openAuthority,
  placed,
  recovery,
  registryWith,
  requirement,
  resource,
  scope,
  scriptedProvider,
  session,
  tenantA,
  tenantB,
  tenantFrom,
  want,
  openPorts,
  stateOf,
} from './doubles.ts'

it('keeps the slot as an unknown allocation when the provider acquire throws, and never re-sends', async () => {
  const provider = scriptedProvider({
    acquire: async () => {
      throw new Error('provider crashed')
    },
    inspect: async () => ({ kind: 'unknown' }),
  })
  const registry = registryWith([provider])
  const placement = await placed(registry, requirement([host]))
  const unknown = { kind: 'unknown', acquisition: 'acq-1', phase: 'allocation' }
  expect(await registry.acquire(accessA, acquireInput(placement))).toEqual(unknown)
  expect(await registry.inspectAcquisition(accessA, local('acq-1'))).toEqual({
    kind: 'queryUnknown',
    cause: 'provider',
  })
  expect(await registry.acquire(accessA, acquireInput(placement))).toEqual(unknown)
  expect(provider.calls.acquire).toBe(1)
})

it('records a receipt for another key as an unknown allocation of the original key', async () => {
  const seen: string[] = []
  const provider = scriptedProvider({
    acquire: async () => ({ kind: 'unknown', acquisition: acquisitionRef('other-key') }),
  })
  const registry = createEnvironmentRegistry<string>({
    ...openPorts(),
    recovery,
    diagnose: diagnostic => seen.push(diagnostic.event),
  })
  registry.registerFacility(commandFacility)
  registry.registerProvider(provider)
  const placement = await placed(registry, requirement([host]))
  expect(await registry.acquire(accessA, acquireInput(placement))).toEqual({
    kind: 'unknown',
    acquisition: 'acq-1',
    phase: 'allocation',
  })
  expect(seen).toContain('receiptForOtherKey')
})

it('passes a provider refusal on with its own reason', async () => {
  const refusal: ProviderAcquisition = { kind: 'rejected', reason: 'unavailable' }
  const provider = scriptedProvider({ acquire: async () => refusal })
  const registry = registryWith([provider])
  const placement = await placed(registry, requirement([host]))
  expect(await registry.acquire(accessA, acquireInput(placement))).toEqual({
    kind: 'rejected',
    reason: 'unavailable',
  })
  expect(await stateOf(registry, accessA, 'acq-1')).toEqual({
    kind: 'rejected',
    reason: 'unavailable',
  })
})

it('issues the adoption record from the verified receipt', async () => {
  const provider = scriptedProvider({ name: 'issuer', generation: '7', version: '7.0.0' })
  const registry = registryWith([provider])
  const placement = await placed(registry, requirement([host]))
  const acquired = await leased(registry, placement)
  expect(acquired.adoption).toEqual({
    acquisition: 'acq-1',
    origin: 'call-1',
    placement,
    provider: { name: 'issuer', generation: '7', version: '7.0.0' },
    instance: { id: 'issuer-instance', generation: '7' },
    continuity: { kind: 'not_guaranteed' },
    evidence: { kind: 'string', value: 'issuer-evidence' },
  })
})

it('releases a receipt whose binding differs from the placement: the adoption fails with unavailable', async () => {
  const provider = scriptedProvider({ receiptBinding: session })
  const registry = registryWith([provider])
  const placement = await placed(registry, requirement([host]))
  expect(await registry.acquire(accessA, acquireInput(placement))).toEqual({
    kind: 'allocationFailed',
    acquisition: 'acq-1',
    reason: 'unavailable',
    cleanup: { kind: 'settled' },
  })
  expect(provider.calls.release).toBe(1)
  expect(await stateOf(registry, accessA, 'acq-1')).toEqual({
    kind: 'allocationFailed',
    reason: 'unavailable',
    cleanup: { kind: 'settled' },
  })
  expect(await registry.acquire(accessA, acquireInput(placement))).toMatchObject({
    kind: 'allocationFailed',
    reason: 'unavailable',
  })
  expect(provider.calls.acquire).toBe(1)
})

it('releases a receipt that lacks a required facility: the adoption fails with unsupportedFacility', async () => {
  const provider = scriptedProvider({ facilities: {} })
  const registry = registryWith([provider])
  const placement = await placed(registry, requirement([host]))
  expect(await registry.acquire(accessA, acquireInput(placement))).toEqual({
    kind: 'allocationFailed',
    acquisition: 'acq-1',
    reason: 'unsupportedFacility',
    cleanup: { kind: 'settled' },
  })
  expect(provider.calls.release).toBe(1)
})

it('fails the adoption with notAuthorized when the access is revoked before the receipt is checked', async () => {
  const authority = openAuthority()
  const provider = scriptedProvider({
    acquire: async input => {
      authority.revokeAll()
      return scriptedProvider().acquire(input)
    },
  })
  const registry = registryWith([provider], recovery, { authority })
  const placement = await placed(registry, requirement([host]))
  expect(await registry.acquire(accessA, acquireInput(placement))).toMatchObject({
    kind: 'allocationFailed',
    reason: 'notAuthorized',
  })
})

it('reports cleanup unknown past the wait bound, and keeps the reason when the late cleanup settles', async () => {
  const release = deferred<LeaseRelease>()
  const provider = scriptedProvider({ receiptBinding: session, release: () => release.promise })
  const registry = createEnvironmentRegistry<string>({ ...openPorts(), recovery, cleanupWaitMs: 0 })
  registry.registerFacility(commandFacility)
  registry.registerProvider(provider)
  const placement = await placed(registry, requirement([host]))
  expect(await registry.acquire(accessA, acquireInput(placement))).toEqual({
    kind: 'allocationFailed',
    acquisition: 'acq-1',
    reason: 'unavailable',
    cleanup: { kind: 'unknown' },
  })
  release.resolve({ kind: 'released' })
  await new Promise(resolve => setImmediate(resolve))
  expect(await stateOf(registry, accessA, 'acq-1')).toEqual({
    kind: 'allocationFailed',
    reason: 'unavailable',
    cleanup: { kind: 'settled' },
  })
})

it('refuses a negative cleanup wait bound', () => {
  expect(() =>
    createEnvironmentRegistry<string>({ ...openPorts(), recovery, cleanupWaitMs: -1 }),
  ).toThrow(RangeError)
})

it('keeps a failed adoption with cleanup pending when the receipt release is pending', async () => {
  const provider = scriptedProvider({
    bindingKinds: ['session_sandbox'],
    receiptBinding: host,
    release: async () => ({ kind: 'pending', resources: [resource('r1')] }),
  })
  const offered: unknown[] = []
  const authority: RecoveryAuthority = {
    async authorizeRecovery(_access, _scope, resources) {
      offered.push(resources)
      return 'notAuthorized'
    },
  }
  const registry = registryWith([provider], authority)
  const placement = await placed(registry, requirement([session]))
  const state = { kind: 'allocationFailed', reason: 'unavailable', cleanup: { kind: 'pending' } }
  expect(await registry.acquire(accessA, acquireInput(placement))).toEqual({
    acquisition: 'acq-1',
    ...state,
  })
  // The cleanup is not settled, so a local query asks the original record again.
  expect(await stateOf(registry, accessA, 'acq-1')).toEqual(state)
  expect(await registry.describe(accessA, scope('scope-1'))).toEqual([])
  expect(await registry.recoverOwned(scope('scope-1'), createRecoveryAccess())).toEqual({
    kind: 'rejected',
    reason: 'notAuthorized',
  })
  expect(await registry.recoverOwned(scope('scope-2'), createRecoveryAccess())).toMatchObject({
    reason: 'notAuthorized',
  })
  expect(offered).toEqual([[], []])
})

it('keeps a failed adoption with cleanup unknown when the receipt release throws', async () => {
  const provider = scriptedProvider({
    receiptBinding: session,
    release: async () => {
      throw new Error('release lost')
    },
  })
  const registry = registryWith([provider])
  const placement = await placed(registry, requirement([host]))
  expect(await registry.acquire(accessA, acquireInput(placement))).toEqual({
    kind: 'allocationFailed',
    acquisition: 'acq-1',
    reason: 'unavailable',
    cleanup: { kind: 'unknown' },
  })
})

/**
 * Starts an acquisition whose provider waits inside `acquire`, runs `onHold` while it waits, then
 * lets the provider hand back a healthy receipt.
 */
async function heldAcquire(
  binding: EnvironmentBinding,
  onHold: (registry: EnvironmentRegistry<string>, remove: () => Promise<void>) => Promise<unknown>,
) {
  const gate = deferred<undefined>()
  const entered = deferred<undefined>()
  const healthy = scriptedProvider({ bindingKinds: [binding.kind] })
  const provider = scriptedProvider({
    bindingKinds: [binding.kind],
    acquire: async input => {
      entered.resolve(undefined)
      await gate.promise
      return healthy.acquire(input)
    },
  })
  const registry = registryWith([])
  const remove = registry.registerProvider(provider)
  const placement = await placed(registry, requirement([binding]))
  const result = registry.acquire(accessA, acquireInput(placement))
  await entered.promise
  await onHold(registry, remove)
  gate.resolve(undefined)
  return { registry, result: await result, released: healthy.calls.release }
}

it('rejects an acquisition whose registry closed while the provider was working', async () => {
  const { result, released } = await heldAcquire(host, registry => registry.close())
  expect(result).toMatchObject({ kind: 'allocationFailed', reason: 'ownerStopped' })
  expect(released).toBe(1)
})

it('rejects an acquisition whose provider was removed while it was working', async () => {
  const { result, released } = await heldAcquire(host, (_registry, remove) => remove())
  expect(result).toMatchObject({ kind: 'allocationFailed', reason: 'providerUnavailable' })
  expect(released).toBe(1)
})

it('rejects an acquisition whose provider began a retirement that is still pending', async () => {
  const gate = deferred<undefined>()
  const entered = deferred<undefined>()
  const healthy = scriptedProvider()
  const provider = scriptedProvider({
    retire: async () => ({ kind: 'pending', resources: [resource('r1')] }),
    acquire: async input => {
      entered.resolve(undefined)
      await gate.promise
      return healthy.acquire(input)
    },
  })
  const registry = registryWith([])
  const remove = registry.registerProvider(provider)
  const placement = await placed(registry, requirement([host]))
  const result = registry.acquire(accessA, acquireInput(placement))
  await entered.promise
  await expect(remove()).rejects.toMatchObject({ name: 'RetirementPending' })
  gate.resolve(undefined)
  expect(await result).toMatchObject({ kind: 'allocationFailed', reason: 'providerUnavailable' })
  expect(healthy.calls.release).toBe(1)
})

it('rejects an acquisition whose scope was released while the provider was working', async () => {
  const { registry, result, released } = await heldAcquire(session, held =>
    held.releaseScope(scope('scope-1'), createRecoveryAccess()),
  )
  expect(result).toMatchObject({ kind: 'allocationFailed', reason: 'referenceExpired' })
  expect(released).toBe(1)
  expect(await registry.resolvePlacement(accessA, want(requirement([session])))).toEqual({
    kind: 'rejected',
    reason: 'referenceExpired',
  })
})

it('rechecks the placement: the layer must still be listed and declared, and isolation confirmed', async () => {
  const provider = scriptedProvider({ bindingKinds: ['host_machine', 'session_sandbox'] })
  const registry = registryWith([provider])
  const onHost = await placed(registry, requirement([host]))
  const unlisted: Placement = { ...onHost, requirement: requirement([session]) }
  expect(await registry.acquire(accessA, acquireInput(unlisted, 'acq-unlisted'))).toEqual({
    kind: 'rejected',
    reason: 'noMatchingEnvironment',
  })
  const tenantLayer: EnvironmentBinding = { kind: 'tenant_sandbox', tenant: tenantA }
  const undeclared: Placement = {
    ...onHost,
    binding: tenantLayer,
    requirement: requirement([tenantLayer]),
  }
  expect(await registry.acquire(accessA, acquireInput(undeclared, 'acq-undeclared'))).toEqual({
    kind: 'rejected',
    reason: 'noMatchingEnvironment',
  })
  const isolated: Placement = {
    ...onHost,
    requirement: requirement([host], ['command'], ['process']),
  }
  expect(await registry.acquire(accessA, acquireInput(isolated, 'acq-isolated'))).toEqual({
    kind: 'rejected',
    reason: 'isolationUnconfirmed',
  })
  const otherGeneration: Placement = {
    ...onHost,
    provider: { name: 'scripted', generation: '2', version: 'test-version' },
  }
  expect(await registry.acquire(accessA, acquireInput(otherGeneration, 'acq-generation'))).toEqual({
    kind: 'rejected',
    reason: 'providerUnavailable',
  })
  const otherVersion: Placement = {
    ...onHost,
    provider: { ...onHost.provider, version: 'other-version' },
  }
  expect(await registry.acquire(accessA, acquireInput(otherVersion, 'acq-version'))).toEqual({
    kind: 'rejected',
    reason: 'providerUnavailable',
  })
  expect(provider.calls.acquire).toBe(0)
})

it('compares a repeated key by its fingerprint: binding, provider and requirement sets', async () => {
  const provider = scriptedProvider({ bindingKinds: ['host_machine', 'session_sandbox'] })
  const registry = registryWith([provider])
  const onHost = await placed(registry, requirement([host]))
  const first = await leased(registry, onHost)
  const conflict = { kind: 'rejected', reason: 'acquisitionConflict' }

  const repeated: Placement = {
    ...onHost,
    requirement: requirement([host], ['command', 'command']),
  }
  expect(await registry.acquire(accessA, acquireInput(repeated))).toMatchObject({
    kind: 'acquired',
    lease: first.lease,
  })
  const renamed: Placement = {
    ...onHost,
    provider: { name: 'other', generation: '1', version: 'test-version' },
  }
  expect(await registry.acquire(accessA, acquireInput(renamed))).toEqual(conflict)
  const regenerated: Placement = {
    ...onHost,
    provider: { name: 'scripted', generation: '2', version: 'test-version' },
  }
  expect(await registry.acquire(accessA, acquireInput(regenerated))).toEqual(conflict)
  const reversioned: Placement = {
    ...onHost,
    provider: { ...onHost.provider, version: 'other-version' },
  }
  expect(await registry.acquire(accessA, acquireInput(reversioned))).toEqual(conflict)
  const widened: Placement = { ...onHost, requirement: requirement([host], ['command', 'files']) }
  expect(await registry.acquire(accessA, acquireInput(widened))).toEqual(conflict)
  const isolated: Placement = {
    ...onHost,
    requirement: requirement([host], ['command'], ['process']),
  }
  expect(await registry.acquire(accessA, acquireInput(isolated))).toEqual(conflict)
  expect(provider.calls.acquire).toBe(1)
})

it('compares isolation claims as a set, whatever the order', async () => {
  const provider = scriptedProvider({ isolation: ['process', 'network-none'] })
  const registry = registryWith([provider])
  const placement = await placed(
    registry,
    requirement([host], ['command'], ['process', 'network-none']),
  )
  const first = await leased(registry, placement)
  const reordered: Placement = {
    ...placement,
    requirement: requirement([host], ['command'], ['network-none', 'process', 'process']),
  }
  expect(await registry.acquire(accessA, acquireInput(reordered))).toMatchObject({
    kind: 'acquired',
    lease: first.lease,
  })
  expect(provider.calls.acquire).toBe(1)
})

it('treats sandbox bindings of another scope or origin as a different placement under the same key', async () => {
  const provider = scriptedProvider({ bindingKinds: ['session_sandbox', 'stateless_sandbox'] })
  const registry = registryWith([provider])
  const conflict = { kind: 'rejected', reason: 'acquisitionConflict' }
  const inScope1 = await placed(registry, requirement([session]))
  await leased(registry, inScope1, 'session-key')
  const scope2: EnvironmentBinding = { kind: 'session_sandbox', scope: scope('scope-2') }
  const inScope2 = await placed(registry, requirement([scope2]), accessA, scope('scope-2'))
  expect(await registry.acquire(accessA, acquireInput(inScope2, 'session-key'))).toEqual(conflict)

  const call1: EnvironmentBinding = {
    kind: 'stateless_sandbox',
    scope: scope('scope-1'),
    origin: originRef('call-1'),
  }
  const call2: EnvironmentBinding = { ...call1, origin: originRef('call-2') }
  const forCall1 = await placed(registry, requirement([call1]))
  const first = await leased(registry, forCall1, 'stateless-key')
  expect(await registry.acquire(accessA, acquireInput(forCall1, 'stateless-key'))).toMatchObject({
    lease: first.lease,
  })
  const forCall2 = await placed(registry, requirement([call2]))
  expect(await registry.acquire(accessA, acquireInput(forCall2, 'stateless-key'))).toEqual(conflict)
  const elsewhere: EnvironmentBinding = { ...call1, scope: scope('scope-2') }
  const forElsewhere = await placed(registry, requirement([elsewhere]), accessA, scope('scope-2'))
  expect(await registry.acquire(accessA, acquireInput(forElsewhere, 'stateless-key'))).toEqual(
    conflict,
  )
})

it('places a tenant sandbox requirement that crossed JSON as tenant text, and refuses another tenant', async () => {
  const provider = scriptedProvider({ bindingKinds: ['tenant_sandbox'] })
  const registry = registryWith([provider])
  const encoded = tenantCodec.encode(tenantA)
  if (!encoded.ok) throw new Error('tenant fixture did not encode')
  const wire = JSON.parse(
    JSON.stringify({
      allowedBindings: [{ kind: 'tenant_sandbox', tenant: encoded.value }],
      facilities: ['command'],
      isolation: [],
    }),
  )
  const judged = judgeRequirement(wire)
  if (!('ok' in judged)) throw new Error('the wire requirement did not decode')
  const placement = await placed(registry, judged.ok)
  const first = await leased(registry, placement)
  const reparsed = tenantFrom('org_0123456789abcdefghjkmnpqrs', 'acc_0123456789abcdefghjkmnpqrs')
  expect(
    await registry.acquire({ ...accessA, tenant: reparsed }, acquireInput(placement)),
  ).toMatchObject({ kind: 'acquired', lease: first.lease })

  expect(await registry.resolvePlacement(accessB, want(judged.ok))).toEqual({
    kind: 'rejected',
    reason: 'notAuthorized',
  })
  expect(await registry.acquire(accessB, acquireInput(placement, 'acq-b'))).toEqual({
    kind: 'rejected',
    reason: 'notAuthorized',
  })
  expect(await stateOf(registry, accessB, 'acq-b')).toEqual({
    kind: 'unrecorded',
  })
  const other: Placement = {
    ...placement,
    binding: { kind: 'tenant_sandbox', tenant: tenantB },
    requirement: requirement([{ kind: 'tenant_sandbox', tenant: tenantB }]),
  }
  expect(await registry.acquire(accessA, acquireInput(other))).toEqual({
    kind: 'rejected',
    reason: 'acquisitionConflict',
  })
  expect(provider.calls.acquire).toBe(1)
})

it('keeps an inactive provider out of placement while its retirement is pending', async () => {
  const provider = scriptedProvider({
    retire: async () => ({ kind: 'pending', resources: [resource('r1')] }),
  })
  const registry = registryWith([])
  const remove = registry.registerProvider(provider)
  await expect(remove()).rejects.toMatchObject({ name: 'RetirementPending' })
  expect(await registry.resolvePlacement(accessA, want(requirement([host])))).toEqual({
    kind: 'rejected',
    reason: 'noMatchingEnvironment',
  })
})

// Shaped like a tenant but not minted by legal-identity: no tenant equality holds for it.
const handBuilt: TenantId = {
  name: 'TenantId',
  organization: { name: 'OrganizationId', text: 'org_0123456789abcdefghjkmnpqrs' },
  account: { name: 'AccountId', text: 'acc_0123456789abcdefghjkmnpqrs' },
}
const unminted: Access<string> = { principal: 'subject-a', tenant: handBuilt }
const invalidInput = { kind: 'rejected', reason: 'invalidInput' }

it('refuses placement for an access tenant that legal-identity did not mint', async () => {
  const registry = registryWith([scriptedProvider()])
  expect(await registry.resolvePlacement(unminted, want(requirement([host])))).toEqual(invalidInput)
})

it('refuses an acquisition for an unminted access tenant, every time, without a record or a provider call', async () => {
  const provider = scriptedProvider()
  const registry = registryWith([provider])
  const placement = await placed(registry, requirement([host]))
  expect(await registry.acquire(unminted, acquireInput(placement))).toEqual(invalidInput)
  expect(await registry.acquire(unminted, acquireInput(placement))).toEqual(invalidInput)
  expect(provider.calls.acquire).toBe(0)
  expect(await stateOf(registry, accessA, 'acq-1')).toEqual({
    kind: 'unrecorded',
  })
  await leased(registry, placement)
  expect(await stateOf(registry, accessA, 'acq-1')).toMatchObject({
    kind: 'acquired',
  })
})

it('answers invalidInput to an unminted access tenant even for a key with a record', async () => {
  const registry = registryWith([scriptedProvider()])
  await leased(registry, await placed(registry, requirement([host])))
  expect(await stateOf(registry, unminted, 'acq-1')).toEqual({
    kind: 'invalidInput',
  })
})

it('refuses a description for an unminted access tenant, before and after close', async () => {
  const registry = registryWith([scriptedProvider({ bindingKinds: ['session_sandbox'] })])
  await leased(registry, await placed(registry, requirement([session])))
  expect(await registry.describe(unminted, scope('scope-1'))).toEqual(invalidInput)
  await registry.close()
  expect(await registry.describe(unminted, scope('scope-1'))).toEqual(invalidInput)
  expect(await registry.resolvePlacement(unminted, want(requirement([host])))).toEqual(invalidInput)
})
