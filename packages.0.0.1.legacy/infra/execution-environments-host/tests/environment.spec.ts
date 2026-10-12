import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import type {
  AccessIdentity,
  SessionAccess,
  SessionAccessOperations,
} from '@omne-harness-lite/session-tenancy'
import type {
  EnvironmentProvider,
  EnvironmentPlacementSource,
  ResourceLifecycle,
  ResourceRecoveryAuthority,
} from '@omne-harness-lite/execution-environments'
import { createEnvironmentRegistry, createHostEnvironment } from '../src/index.ts'
import { hostStorageFixture } from './host-storage-fixture.ts'
let database: Awaited<ReturnType<typeof hostStorageFixture>>
beforeEach(async () => {
  database = await hostStorageFixture()
})
afterEach(async () => {
  await database.close()
})
const tenant = parseTenantId({ organization: 'org', account: 'alice' }),
  session = parseOpaqueIdentifier('session', 'SessionRef'),
  execution = parseOpaqueIdentifier('call-1', 'CallId')
if (!('ok' in tenant) || !('ok' in session) || !('ok' in execution))
  throw new Error('fixture invalid')
const scope = { tenant: tenant.ok, session: session.ok },
  executionId = execution.ok,
  token = Object.freeze({}) as SessionAccess
const identity: AccessIdentity = {
  binding: 'fixture',
  principal: 'alice',
  principalKind: 'human',
  scope,
  consumer: 'tool',
  contextKeys: [],
}
const access: SessionAccessOperations = {
  authorize: async candidate =>
    candidate === token
      ? { kind: 'authorized', identity }
      : { kind: 'rejected', reason: 'notAuthorized' },
}
const recovery: ResourceRecoveryAuthority = { authorizeRecovery: async () => 'notAuthorized' }
function request() {
  const signal = new AbortController()
  const resources: ResourceLifecycle = {
    closed: signal.signal,
    plan: async () => 'recorded',
    permit: async () => 'confirmed',
    adopt: async () => 'confirmed',
    stopped: async () => 'recorded',
  }
  return {
    scope,
    call: { tool: { name: 'fixture', definition: 'v1' }, execution: executionId },
    authorization: token,
    requirement: { bindingLayer: 'host_machine' as const, facilities: [] as string[] },
    resources,
  }
}

function registerPlacement(registry: ReturnType<typeof createEnvironmentRegistry>) {
  const source: EnvironmentPlacementSource = {
    name: 'fixture',
    generation: 'one',
    read: async (scope, _authorization, call) => ({
      kind: 'placement',
      placement: {
        scope,
        ...call,
        requirement:
          call.tool.definition === 'command-v1'
            ? { bindingLayer: 'host_machine', facilities: ['command'] }
            : request().requirement,
        permission: 'always-allow',
        revision: 'one',
        evidence: null,
      },
    }),
    authorizeOperation: async () => ({ kind: 'authorized' }),
    select: async () => ({ kind: 'rejected', reason: 'ambiguousEnvironment' }),
  }
  // A controlled source with a known legal per-call requirement; no caller-supplied permission.
  registry.placements.registerPlacementSource(source)
}

test('host lease is independent of callers, no undeclared facilities, and release does not destroy the shared environment', async () => {
  const host = createHostEnvironment({ name: 'host', access, storage: database.storage }),
    registry = createEnvironmentRegistry({ access, recovery })
  registerPlacement(registry)
  const remove = registry.registrations.registerProvider(host)
  expect(
    await registry.operations.acquire({ ...request(), authorization: {} as SessionAccess }),
  ).toMatchObject({ reason: 'notAuthorized' })
  const commandLease = await registry.operations.acquire({
    ...request(),
    call: { tool: { name: 'fixture', definition: 'command-v1' }, execution: execution.ok },
    requirement: { bindingLayer: 'host_machine', facilities: ['command'] },
  })
  expect(commandLease.kind).toBe('acquired')
  if (commandLease.kind === 'acquired') await commandLease.lease.release()
  const first = await registry.operations.acquire(request())
  if (first.kind !== 'acquired') throw new Error('lease missing')
  expect(first.lease.facilities.description.facilities).toEqual(['command', 'files'])
  expect(await first.lease.facilities.files?.read({ path: '/unrequested' })).toEqual({
    kind: 'rejected',
    reason: 'notAuthorized',
  })
  await first.lease.release()
  const second = await registry.operations.acquire(request())
  if (second.kind !== 'acquired') throw new Error('shared host destroyed')
  await remove()
  expect(await second.lease.invalidated).toEqual({ reason: 'ownerStopped' })
  expect(await registry.operations.acquire(request())).toMatchObject({
    reason: 'noMatchingEnvironment',
  })
  await registry.close()
})

test('reference expiry and multiple owners never fall back to another environment', async () => {
  const registry = createEnvironmentRegistry({ access, recovery })
  registerPlacement(registry)
  const host = createHostEnvironment({ name: 'one', access, storage: database.storage })
  registry.registrations.registerProvider(host)
  registry.registrations.registerProvider(
    createHostEnvironment({ name: 'two', access, storage: database.storage }),
  )
  expect(await registry.operations.acquire(request())).toMatchObject({
    reason: 'ambiguousEnvironment',
  })
  expect(
    await registry.operations.acquire({
      ...request(),
      reference: { provider: 'one', reference: { generation: 'old' } },
    }),
  ).toMatchObject({ reason: 'referenceExpired' })
  const visible = await host.describe(scope, token)
  if (visible.kind !== 'descriptions' || !visible.values[0]) throw new Error('host absent')
  const exact = await registry.operations.acquire({
    ...request(),
    reference: visible.values[0].reference,
  })
  expect(exact.kind).toBe('acquired')
  if (exact.kind === 'acquired') await exact.lease.release()
  await registry.close()
})

test('withdrawal owns a pending acquire and retires the original provider; input mutation cannot change the adopted request', async () => {
  const registry = createEnvironmentRegistry({ access, recovery }),
    host = createHostEnvironment({ name: 'host', access, storage: database.storage })
  registerPlacement(registry)
  const entered = Promise.withResolvers<void>(),
    finish = Promise.withResolvers<void>()
  const acquire = vi.fn<EnvironmentProvider['acquire']>(async input => {
    expect(Object.isFrozen(input.requirement.facilities)).toBe(true)
    entered.resolve()
    await finish.promise
    expect(input.requirement.facilities).toEqual([])
    return host.acquire(input)
  })
  const retire = vi.fn(host.retire)
  const remove = registry.registrations.registerProvider({ ...host, acquire, retire })
  const input = request(),
    work = registry.operations.acquire(input)
  await entered.promise
  input.requirement.facilities.push('command')
  let removed = false
  const removal = remove().then(() => {
    removed = true
  })
  await Promise.resolve()
  expect(removed).toBe(false)
  finish.resolve()
  expect(await work).toMatchObject({ reason: 'providerUnavailable' })
  await removal
  expect(retire).toHaveBeenCalledOnce()
  await registry.close()
})
