// Acquisition: provider answers, the recheck after resolving, verification of the receipt, the
// compensating release, idempotent repeats and tenant checks.
import { expect, it } from 'vitest'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  acquisitionRef,
  type Access,
  createRecoveryAccess,
  judgeRequirement,
  originRef,
  type EnvironmentBinding,
  type Placement,
  type ProviderAcquisition,
  type RecoveryAuthority,
} from '@omne-harness/execution-environment-contract'
import type { EnvironmentRegistry } from '@omne-harness/execution-environment'
import {
  accessA,
  accessB,
  acquireInput,
  deferred,
  host,
  leased,
  placed,
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
} from './doubles.ts'

it('rejects with providerUnavailable when the provider acquire throws, and repeats that answer', async () => {
  const provider = scriptedProvider({
    acquire: async () => {
      throw new Error('provider crashed')
    },
  })
  const registry = registryWith([provider])
  const placement = await placed(registry, requirement([host]))
  const refused = { kind: 'rejected', reason: 'providerUnavailable' }
  expect(await registry.acquire(accessA, acquireInput(placement))).toEqual(refused)
  expect(await registry.inspectAcquisition(accessA, acquisitionRef('acq-1'))).toEqual({
    kind: 'rejected',
    reason: 'providerUnavailable',
  })
  expect(await registry.acquire(accessA, acquireInput(placement))).toEqual(refused)
  expect(provider.calls.acquire).toBe(1)
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
  expect(await registry.inspectAcquisition(accessA, acquisitionRef('acq-1'))).toEqual({
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

it('releases a receipt whose binding differs from the placement and rejects with unavailable', async () => {
  const provider = scriptedProvider({ receiptBinding: session })
  const registry = registryWith([provider])
  const placement = await placed(registry, requirement([host]))
  expect(await registry.acquire(accessA, acquireInput(placement))).toEqual({
    kind: 'rejected',
    reason: 'unavailable',
  })
  expect(provider.calls.release).toBe(1)
  expect(await registry.inspectAcquisition(accessA, acquisitionRef('acq-1'))).toEqual({
    kind: 'rejected',
    reason: 'unavailable',
  })
})

it('releases a receipt that lacks a required facility and rejects with unsupportedFacility', async () => {
  const provider = scriptedProvider({ facilities: {} })
  const registry = registryWith([provider])
  const placement = await placed(registry, requirement([host]))
  expect(await registry.acquire(accessA, acquireInput(placement))).toEqual({
    kind: 'rejected',
    reason: 'unsupportedFacility',
  })
  expect(provider.calls.release).toBe(1)
})

it('keeps a failed receipt as pending release when its release is pending, and offers it to recovery', async () => {
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
  const state = { kind: 'pendingRelease', adoption: null, resources: [resource('r1')] }
  expect(await registry.acquire(accessA, acquireInput(placement))).toEqual({
    kind: 'pending',
    state,
  })
  expect(await registry.inspectAcquisition(accessA, acquisitionRef('acq-1'))).toEqual(state)
  expect(await registry.describe(accessA, scope('scope-1'))).toEqual([])
  expect(await registry.recoverOwned(scope('scope-1'), createRecoveryAccess())).toEqual({
    kind: 'rejected',
    reason: 'notAuthorized',
  })
  expect(await registry.recoverOwned(scope('scope-2'), createRecoveryAccess())).toMatchObject({
    reason: 'notAuthorized',
  })
  expect(offered).toEqual([[resource('r1')], []])
})

it('keeps a failed receipt as pending release with no resources when its release throws', async () => {
  const provider = scriptedProvider({
    receiptBinding: session,
    release: async () => {
      throw new Error('release lost')
    },
  })
  const registry = registryWith([provider])
  const placement = await placed(registry, requirement([host]))
  expect(await registry.acquire(accessA, acquireInput(placement))).toEqual({
    kind: 'pending',
    state: { kind: 'pendingRelease', adoption: null, resources: [] },
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
  expect(result).toEqual({ kind: 'rejected', reason: 'ownerStopped' })
  expect(released).toBe(1)
})

it('rejects an acquisition whose provider was removed while it was working', async () => {
  const { result, released } = await heldAcquire(host, (_registry, remove) => remove())
  expect(result).toEqual({ kind: 'rejected', reason: 'providerUnavailable' })
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
  expect(await result).toEqual({ kind: 'rejected', reason: 'providerUnavailable' })
  expect(healthy.calls.release).toBe(1)
})

it('rejects an acquisition whose scope was released while the provider was working', async () => {
  const { registry, result, released } = await heldAcquire(session, held =>
    held.releaseScope(scope('scope-1'), createRecoveryAccess()),
  )
  expect(result).toEqual({ kind: 'rejected', reason: 'referenceExpired' })
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

it('compares a repeated key by binding, provider and requirement sets', async () => {
  const provider = scriptedProvider({ bindingKinds: ['host_machine', 'session_sandbox'] })
  const registry = registryWith([provider])
  const onHost = await placed(registry, requirement([host]))
  const first = await leased(registry, onHost)
  const conflict = { kind: 'rejected', reason: 'invalidInput' }

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
  const conflict = { kind: 'rejected', reason: 'invalidInput' }
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
  expect(await registry.inspectAcquisition(accessB, acquisitionRef('acq-b'))).toEqual({
    kind: 'unrecorded',
  })
  const other: Placement = {
    ...placement,
    binding: { kind: 'tenant_sandbox', tenant: tenantB },
    requirement: requirement([{ kind: 'tenant_sandbox', tenant: tenantB }]),
  }
  expect(await registry.acquire(accessA, acquireInput(other))).toEqual({
    kind: 'rejected',
    reason: 'invalidInput',
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
  expect(await registry.inspectAcquisition(accessA, acquisitionRef('acq-1'))).toEqual({
    kind: 'unrecorded',
  })
  await leased(registry, placement)
  expect(await registry.inspectAcquisition(accessA, acquisitionRef('acq-1'))).toMatchObject({
    kind: 'acquired',
  })
})

it('answers unrecorded to an unminted access tenant even for a key with a record', async () => {
  const registry = registryWith([scriptedProvider()])
  await leased(registry, await placed(registry, requirement([host])))
  expect(await registry.inspectAcquisition(unminted, acquisitionRef('acq-1'))).toEqual({
    kind: 'unrecorded',
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
