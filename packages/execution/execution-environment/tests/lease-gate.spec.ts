// The lease view: which keys resolve, the per-operation gate, invalidation and release.
import { expect, it } from 'vitest'
import {
  acquisitionRef,
  commandFacility,
  describeFacility,
  terminalFacility,
  type FacilityGuard,
  type LeaseRelease,
  type TerminalFacility,
} from '@omne-harness/execution-environment-contract'
import { createEnvironmentRegistry } from '@omne-harness/execution-environment'
import {
  accessA,
  accessB,
  acquireInput,
  allow,
  commandOf,
  commandStub,
  deferred,
  host,
  leased,
  ledger,
  placed,
  recovery,
  registryWith,
  requirement,
  resource,
  scope1,
  scriptedProvider,
  session,
  startRequest,
  tenantFrom,
  type Calls,
} from './doubles.ts'

function terminalStub(): TerminalFacility<unknown> {
  return {
    create: async request => ({ kind: 'unknown', requestId: request.requestId }),
    execute: async request => ({ kind: 'unknown', requestId: request.requestId }),
    close: async request => ({ kind: 'unknown', requestId: request.requestId }),
    list: async request => ({ kind: 'unknown', requestId: request.requestId }),
  }
}

async function hostLease(script: Parameters<typeof scriptedProvider>[0] = {}, guard = allow) {
  const provider = scriptedProvider(script)
  const registry = registryWith([provider])
  const placement = await placed(registry, requirement([host]))
  const acquired = await leased(registry, placement, 'acq-1', guard)
  return { provider, registry, placement, acquired, command: commandOf(acquired.lease) }
}

it('resolves only the keys of the requirement, even when the provider lease has more', async () => {
  const calls: Calls = { acquire: 0, release: 0, retire: 0, start: 0, list: 0, recover: 0 }
  const provider = scriptedProvider({
    keys: ['command', 'terminal'],
    facilities: { command: commandStub(calls), terminal: terminalStub() },
  })
  const registry = registryWith([provider])
  registry.registerFacility(terminalFacility)
  const placement = await placed(registry, requirement([host], ['command']))
  const acquired = await leased(registry, placement)
  expect(acquired.lease.facility('terminal')).toBeUndefined()
  expect(acquired.lease.facility('command')).toBeDefined()
})

it('refuses malformed requests as invalid input without calling the facility', async () => {
  const { provider, command } = await hostLease()
  const valid = startRequest('start-1')
  const malformed: [unknown, string][] = [
    [null, ''],
    ['start-1', ''],
    [{ ...valid, requestId: 7 }, ''],
    [{ ...valid, requestId: '' }, ''],
    [{ ...valid, origin: 9 }, 'start-1'],
    [{ ...valid, origin: '' }, 'start-1'],
    [{ ...valid, access: 'subject-a' }, 'start-1'],
    [{ ...valid, access: { principal: 'subject-a' } }, 'start-1'],
    [{ ...valid, access: { principal: 'subject-a', tenant: 'tenant-a' } }, 'start-1'],
    [{ ...valid, access: { principal: 'subject-a', tenant: null } }, 'start-1'],
    [{ ...valid, binding: 'host_machine' }, 'start-1'],
    [{ ...valid, binding: {} }, 'start-1'],
    [{ ...valid, binding: { kind: 3 } }, 'start-1'],
  ]
  // The gate is the boundary for untyped callers, so the requests go in without the static type.
  const start = (request: unknown): Promise<unknown> =>
    Reflect.apply(command.start, command, [request])
  for (const [request, requestId] of malformed)
    expect(await start(request), JSON.stringify(request)).toEqual({
      kind: 'rejected',
      requestId,
      reason: 'invalidInput',
    })
  expect(provider.calls.start).toBe(0)
})

it('refuses a request whose binding is not the lease binding, before the guard', async () => {
  const asked: string[] = []
  const guard: FacilityGuard<string> = {
    async authorize(_facility, _operation, request) {
      asked.push(request.requestId)
      return 'authorized'
    },
  }
  const { provider, command } = await hostLease({}, guard)
  expect(await command.start(startRequest('sandboxed', session))).toEqual({
    kind: 'rejected',
    requestId: 'sandboxed',
    reason: 'invalidInput',
  })
  expect(asked).toEqual([])
  expect(provider.calls.start).toBe(0)
  expect(await command.start(startRequest('on-host', host))).toEqual({
    kind: 'unknown',
    requestId: 'on-host',
  })
  expect(asked).toEqual(['on-host'])
})

it('checks the tenant with the owner equality, so a reparsed tenant passes and another fails', async () => {
  const { command, provider } = await hostLease()
  const reparsed = tenantFrom('org_0123456789abcdefghjkmnpqrs', 'acc_0123456789abcdefghjkmnpqrs')
  expect(await command.start(startRequest('same', host, { ...accessA, tenant: reparsed }))).toEqual(
    { kind: 'unknown', requestId: 'same' },
  )
  expect(await command.start(startRequest('other', host, accessB))).toEqual({
    kind: 'rejected',
    requestId: 'other',
    reason: 'notAuthorized',
  })
  expect(provider.calls.start).toBe(1)
})

it('lets an open operation through without asking the guard', async () => {
  const provider = scriptedProvider()
  const registry = createEnvironmentRegistry<string>({ recovery })
  registry.registerFacility(describeFacility('command', { start: 'open' }))
  registry.registerProvider(provider)
  const refusing: FacilityGuard<string> = {
    async authorize() {
      throw new Error('the guard must not be asked')
    },
  }
  const acquired = await leased(
    registry,
    await placed(registry, requirement([host])),
    'acq-1',
    refusing,
  )
  expect(await commandOf(acquired.lease).start(startRequest('open-1'))).toEqual({
    kind: 'unknown',
    requestId: 'open-1',
  })
  expect(provider.calls.start).toBe(1)
})

it('answers unavailable when the guard throws, and does not call the facility', async () => {
  const throwing: FacilityGuard<string> = {
    async authorize() {
      throw new Error('policy store down')
    },
  }
  const { provider, command } = await hostLease({}, throwing)
  expect(await command.start(startRequest('start-1'))).toEqual({
    kind: 'rejected',
    requestId: 'start-1',
    reason: 'unavailable',
  })
  expect(provider.calls.start).toBe(0)
})

it('refuses as closed when the lease is invalidated while the guard is answering', async () => {
  const answer = deferred<'authorized'>()
  const asked = deferred<undefined>()
  const slow: FacilityGuard<string> = {
    async authorize() {
      asked.resolve(undefined)
      return answer.promise
    },
  }
  const { provider, registry, command } = await hostLease({}, slow)
  const pending = command.start(startRequest('raced'))
  await asked.promise
  await registry.close()
  answer.resolve('authorized')
  expect(await pending).toEqual({ kind: 'rejected', requestId: 'raced', reason: 'closed' })
  expect(provider.calls.start).toBe(0)
})

async function leaseOnLedger(
  registry: ReturnType<typeof registryWith>,
  key: string,
  closed: AbortSignal,
  guard: FacilityGuard<string> = allow,
) {
  const placement = await placed(registry, requirement([host]))
  const acquired = await registry.acquire(
    accessA,
    acquireInput(placement, key, guard, scope1, { ...ledger, closed }),
  )
  if (acquired.kind !== 'acquired') throw new Error('expected a lease')
  return commandOf(acquired.lease)
}

it('answers closed without calling the facility once the acquisition ledger is closed', async () => {
  const provider = scriptedProvider()
  const registry = createEnvironmentRegistry<string>({ recovery })
  const removeDeclaration = registry.registerFacility(commandFacility)
  registry.registerProvider(provider)
  let asked = 0
  const counting: FacilityGuard<string> = {
    async authorize() {
      asked += 1
      return 'authorized'
    },
  }
  const closing = new AbortController()
  const command = await leaseOnLedger(registry, 'closing', closing.signal, counting)
  const other = await leaseOnLedger(registry, 'open', new AbortController().signal, counting)
  closing.abort()
  expect(await command.start(startRequest('ledger-closed'))).toEqual({
    kind: 'rejected',
    requestId: 'ledger-closed',
    reason: 'closed',
  })
  expect(asked).toBe(0)
  expect(provider.calls.start).toBe(0)
  expect(await other.start(startRequest('other-ledger'))).toMatchObject({ kind: 'unknown' })
  expect(provider.calls.start).toBe(1)
  await removeDeclaration()
  expect(await command.start(startRequest('closed-and-removed'))).toMatchObject({
    reason: 'closed',
  })
})

it('refuses as closed when the acquisition ledger closes while the guard is answering', async () => {
  const answer = deferred<'authorized'>()
  const asked = deferred<undefined>()
  const slow: FacilityGuard<string> = {
    async authorize() {
      asked.resolve(undefined)
      return answer.promise
    },
  }
  const provider = scriptedProvider()
  const registry = registryWith([provider])
  const closing = new AbortController()
  const command = await leaseOnLedger(registry, 'raced', closing.signal, slow)
  const pending = command.start(startRequest('raced'))
  await asked.promise
  closing.abort()
  answer.resolve('authorized')
  expect(await pending).toEqual({ kind: 'rejected', requestId: 'raced', reason: 'closed' })
  expect(provider.calls.start).toBe(0)
})

it('refuses operations on a facility object after its declaration is removed', async () => {
  const provider = scriptedProvider()
  const registry = createEnvironmentRegistry<string>({ recovery })
  const removeDeclaration = registry.registerFacility(commandFacility)
  registry.registerProvider(provider)
  const acquired = await leased(registry, await placed(registry, requirement([host])))
  const command = commandOf(acquired.lease)
  await removeDeclaration()
  expect(await command.start(startRequest('after-removal'))).toEqual({
    kind: 'rejected',
    requestId: 'after-removal',
    reason: 'unsupported',
  })
  expect(acquired.lease.facility('command')).toBeUndefined()
  expect(provider.calls.start).toBe(0)
})

it('answers closed, not unsupported, when the lease is released and its declaration removed', async () => {
  const provider = scriptedProvider()
  const registry = createEnvironmentRegistry<string>({ recovery })
  const removeDeclaration = registry.registerFacility(commandFacility)
  registry.registerProvider(provider)
  const acquired = await leased(registry, await placed(registry, requirement([host])))
  const command = commandOf(acquired.lease)
  await acquired.lease.release()
  await removeDeclaration()
  expect(await command.start(startRequest('released-and-removed'))).toEqual({
    kind: 'rejected',
    requestId: 'released-and-removed',
    reason: 'closed',
  })
  expect(provider.calls.start).toBe(0)
})

it('records a provider-reported invalidation once, as the provider reason', async () => {
  const { provider, registry, acquired, command } = await hostLease()
  provider.invalidateLeases({ source: 'registry', reason: 'scopeReleased' })
  await expect(acquired.lease.invalidated).resolves.toEqual({
    source: 'provider',
    reason: 'scopeReleased',
  })
  await registry.close()
  expect(await registry.inspectAcquisition(accessA, acquisitionRef('acq-1'))).toEqual({
    kind: 'invalidated',
    adoption: acquired.adoption,
    invalidation: { source: 'provider', reason: 'scopeReleased' },
  })
  expect(await command.start(startRequest('late'))).toEqual({
    kind: 'rejected',
    requestId: 'late',
    reason: 'closed',
  })
  expect(provider.calls.start).toBe(0)
})

it('invalidates with providerInvalidated when the provider notice ends in a rejection', async () => {
  const { provider, registry, acquired, command } = await hostLease()
  provider.breakLeases()
  await expect(acquired.lease.invalidated).resolves.toEqual({
    source: 'registry',
    reason: 'providerInvalidated',
  })
  expect(await registry.inspectAcquisition(accessA, acquisitionRef('acq-1'))).toMatchObject({
    kind: 'invalidated',
    invalidation: { source: 'registry', reason: 'providerInvalidated' },
  })
  expect(await command.start(startRequest('late'))).toMatchObject({ reason: 'closed' })
})

it('closes the lease to new operations as soon as a release starts, and keeps it closed when pending', async () => {
  const answer = deferred<LeaseRelease>()
  const { provider, registry, acquired, command } = await hostLease({
    release: () => answer.promise,
  })
  const releasing = acquired.lease.release()
  expect(await registry.inspectAcquisition(accessA, acquisitionRef('acq-1'))).toEqual({
    kind: 'releasing',
    adoption: acquired.adoption,
  })
  expect(await command.start(startRequest('while-releasing'))).toMatchObject({ reason: 'closed' })
  answer.resolve({ kind: 'pending', resources: [resource('r1')] })
  expect(await releasing).toEqual({ kind: 'pending', resources: [resource('r1')] })
  expect(await registry.inspectAcquisition(accessA, acquisitionRef('acq-1'))).toEqual({
    kind: 'pendingRelease',
    adoption: acquired.adoption,
    resources: [resource('r1')],
  })
  expect(await command.start(startRequest('after-pending'))).toMatchObject({ reason: 'closed' })
  expect(provider.calls.start).toBe(0)
})

it('retries a pending release, shares a concurrent one, and answers released without asking again', async () => {
  const answers: LeaseRelease[] = [
    { kind: 'pending', resources: [resource('r1')] },
    { kind: 'released' },
  ]
  const { provider, registry, acquired } = await hostLease({
    release: async () => answers.shift() ?? { kind: 'pending', resources: [] },
  })
  expect(await acquired.lease.release()).toEqual({ kind: 'pending', resources: [resource('r1')] })
  const [first, second] = await Promise.all([acquired.lease.release(), acquired.lease.release()])
  expect(first).toEqual({ kind: 'released' })
  expect(second).toBe(first)
  expect(provider.calls.release).toBe(2)
  await expect(acquired.lease.invalidated).resolves.toEqual({
    source: 'registry',
    reason: 'released',
  })
  expect(await registry.inspectAcquisition(accessA, acquisitionRef('acq-1'))).toEqual({
    kind: 'released',
    adoption: acquired.adoption,
  })
  expect(await acquired.lease.release()).toEqual({ kind: 'released' })
  expect(provider.calls.release).toBe(2)
})

it('treats a throwing release as pending with no known resources', async () => {
  const { registry, acquired } = await hostLease({
    release: async () => {
      throw new Error('lost the release answer')
    },
  })
  expect(await acquired.lease.release()).toEqual({ kind: 'pending', resources: [] })
  expect(await registry.inspectAcquisition(accessA, acquisitionRef('acq-1'))).toEqual({
    kind: 'pendingRelease',
    adoption: acquired.adoption,
    resources: [],
  })
})
