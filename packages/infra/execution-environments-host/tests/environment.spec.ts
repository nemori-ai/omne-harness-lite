import { expect, test, vi } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import type { AccessIdentity, SessionAccess, SessionAccessOperations } from '@omne-harness-lite/session-tenancy'
import type { EnvironmentProvider, ResourceLifecycle, ResourceRecoveryAuthority } from '@omne-harness-lite/execution-environments'
import { createEnvironmentRegistry, createHostEnvironment } from '../src/index.ts'
const tenant = parseTenantId({ organization: 'org', account: 'alice' }), session = parseOpaqueIdentifier('session', 'SessionRef')
if (!('ok' in tenant) || !('ok' in session)) throw new Error('fixture invalid')
const scope = { tenant: tenant.ok, session: session.ok }, token = Object.freeze({}) as SessionAccess
const identity: AccessIdentity = { binding: 'fixture', principal: 'alice', principalKind: 'human', scope, consumer: 'tool', contextKeys: [] }
const access: SessionAccessOperations = { authorize: async candidate => candidate === token ? { kind: 'authorized', identity } : { kind: 'rejected', reason: 'notAuthorized' } }
const recovery: ResourceRecoveryAuthority = { authorizeRecovery: async () => 'notAuthorized' }
function request() {
  const signal = new AbortController()
  const resources: ResourceLifecycle = { closed: signal.signal, plan: async () => 'recorded', permit: async () => 'confirmed', stopped: async () => 'recorded' }
  return { scope, authorization: token, requirement: { bindingLayer: 'host_machine' as const, facilities: [] as string[] }, resources }
}

test('host lease is independent of callers, no undeclared facilities, and release does not destroy the shared environment', async () => {
  const host = createHostEnvironment({ name: 'host', access }), registry = createEnvironmentRegistry({ access, recovery })
  const remove = registry.registrations.registerProvider(host)
  expect(await registry.operations.acquire({ ...request(), authorization: {} as SessionAccess })).toMatchObject({ reason: 'notAuthorized' })
  expect(await registry.operations.acquire({ ...request(), requirement: { bindingLayer: 'host_machine', facilities: ['command'] } })).toMatchObject({ reason: 'missingFacility' })
  const first = await registry.operations.acquire(request())
  if (first.kind !== 'acquired') throw new Error('lease missing')
  expect(first.lease.facilities).not.toHaveProperty('command')
  expect(first.lease.facilities).not.toHaveProperty('files')
  await first.lease.release()
  const second = await registry.operations.acquire(request())
  if (second.kind !== 'acquired') throw new Error('shared host destroyed')
  await remove()
  expect(await second.lease.invalidated).toEqual({ reason: 'ownerStopped' })
  expect(await registry.operations.acquire(request())).toMatchObject({ reason: 'noMatchingEnvironment' })
  await registry.close()
})

test('reference expiry and multiple owners never fall back to another environment', async () => {
  const registry = createEnvironmentRegistry({ access, recovery })
  const host = createHostEnvironment({ name: 'one', access })
  registry.registrations.registerProvider(host)
  registry.registrations.registerProvider(createHostEnvironment({ name: 'two', access }))
  expect(await registry.operations.acquire(request())).toMatchObject({ reason: 'noMatchingEnvironment' })
  expect(await registry.operations.acquire({ ...request(), reference: { provider: 'one', reference: { generation: 'old' } } })).toMatchObject({ reason: 'referenceExpired' })
  const visible = await host.describe(scope, token)
  if (visible.kind !== 'descriptions' || !visible.values[0]) throw new Error('host absent')
  const exact = await registry.operations.acquire({ ...request(), reference: visible.values[0].reference })
  expect(exact.kind).toBe('acquired')
  if (exact.kind === 'acquired') await exact.lease.release()
  await registry.close()
})

test('withdrawal owns a pending acquire and retires the original provider; input mutation cannot change the adopted request', async () => {
  const registry = createEnvironmentRegistry({ access, recovery }), host = createHostEnvironment({ name: 'host', access })
  const entered = Promise.withResolvers<void>(), finish = Promise.withResolvers<void>()
  const acquire = vi.fn<EnvironmentProvider['acquire']>(async input => {
    expect(Object.isFrozen(input.requirement.facilities)).toBe(true)
    entered.resolve(); await finish.promise
    expect(input.requirement.facilities).toEqual([])
    return host.acquire(input)
  })
  const retire = vi.fn(host.retire)
  const remove = registry.registrations.registerProvider({ ...host, acquire, retire })
  const input = request(), work = registry.operations.acquire(input)
  await entered.promise
  input.requirement.facilities.push('command')
  let removed = false
  const removal = remove().then(() => { removed = true })
  await Promise.resolve()
  expect(removed).toBe(false)
  finish.resolve()
  expect(await work).toMatchObject({ reason: 'providerUnavailable' })
  await removal
  expect(retire).toHaveBeenCalledOnce()
  await registry.close()
})
