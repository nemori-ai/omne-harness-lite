import { expect, it } from 'vitest'
import {
  createRecoveryAccess,
  originRef,
  terminalFacility,
  type FacilityResult,
  type ProviderAcquireInput,
  type ResourceLedger,
} from '@omne-harness/execution-environment-contract'
import {
  accessA,
  acquireInput,
  bindingTable,
  commandOf,
  deferred,
  host,
  ledger,
  openAuthority,
  placed,
  registryWith,
  requirement,
  scope,
  scriptedProvider,
  startRequest,
  tenantB,
} from './doubles.ts'
import { retainedPeer } from './retained-provider.ts'

function value<T>(answer: FacilityResult<T>): T {
  if (answer.kind !== 'done') throw new Error(`expected done, got ${answer.kind}`)
  return answer.value
}

it('releases A and lets a new origin B attach and continue the retained peer through the real registry', async () => {
  const peer = retainedPeer()
  const registry = registryWith([peer.provider])
  registry.registerFacility(terminalFacility)
  const placement = await placed(registry, requirement([host], ['terminal']))
  const retention = { scope: scope('session'), ledger }
  const acquire = async (key: string, guard = { authorize: async () => 'authorized' as const }) => {
    const acquired = await registry.acquire(accessA, {
      ...acquireInput(placement, key, guard, scope(key)),
      origin: originRef(key),
      retention,
    })
    if (acquired.kind !== 'acquired') throw new Error('expected acquired')
    const terminal = acquired.lease.facility('terminal')
    if (terminal === undefined) throw new Error('expected terminal')
    if (terminal.retention === undefined) throw new Error('expected attach support')
    return {
      lease: acquired.lease,
      terminal,
      attach: terminal.retention.attach.bind(terminal.retention),
    }
  }
  const request = (origin: string) => ({
    access: accessA,
    origin: originRef(origin),
    binding: host,
    requestId: origin,
  })
  const a = await acquire('a')
  const terminal = value(
    await a.terminal.create({ ...request('a'), cwd: '/first', env: {}, retain: 'session' }),
  ).terminal
  await value(await a.terminal.execute({ ...request('a'), terminal, script: '/next' })).result
  expect(await a.lease.release()).toEqual({ kind: 'released' })
  expect(peer.inputs[0]?.retention?.released.aborted).toBe(false)
  const b = await acquire('b')
  expect(await b.attach({ ...request('a'), terminal })).toMatchObject({
    kind: 'rejected',
    reason: 'invalidInput',
  })
  expect(value(await b.attach({ ...request('b'), terminal }))).toEqual({ terminal })
  expect(value(await b.terminal.list(request('b')))).toEqual([
    { terminal, state: 'idle', observedCwd: '/next' },
  ])
  await value(await b.terminal.execute({ ...request('b'), terminal, script: '/last' })).result
  expect(await a.attach({ ...request('a'), terminal })).toMatchObject({
    kind: 'rejected',
    reason: 'closed',
  })
  expect(peer.calls).toEqual(['execute', 'attach', 'execute'])
  await b.lease.release()
})

it('passes an independently owned retention ledger and sealed scope signal to the provider', async () => {
  let received: ProviderAcquireInput | undefined
  const raw = scriptedProvider()
  const authority = openAuthority()
  const provider = scriptedProvider({
    acquire: async input => {
      received = input
      return raw.acquire(input)
    },
  })
  const registry = registryWith([provider], undefined, { authority })
  const placement = await placed(registry, requirement([host]))
  const retention = { scope: scope('session-retained'), ledger: { ...ledger } }
  const acquired = await registry.acquire(accessA, { ...acquireInput(placement), retention })
  expect(acquired.kind).toBe('acquired')
  expect(received).toBeDefined()
  const passed = received?.retention
  expect(passed?.ledger).toBe(retention.ledger)
  expect(passed?.released.aborted).toBe(false)
  expect(authority.calls.find(action => action.kind === 'acquire')).toMatchObject({
    original: { retentionScope: retention.scope },
  })
  await registry.releaseScope(retention.scope, createRecoveryAccess())
  expect(passed?.released.aborted).toBe(true)
})

it('checks both scopes with the binding source and never grants a foreign retention scope', async () => {
  const bindings = bindingTable()
  const retained = scope('foreign-session')
  bindings.bind(retained, tenantB)
  const provider = scriptedProvider()
  const registry = registryWith([provider], undefined, { bindings })
  const placement = await placed(registry, requirement([host]))
  const input = { ...acquireInput(placement), retention: { scope: retained, ledger } }
  expect(await registry.acquire(accessA, input)).toEqual({
    kind: 'rejected',
    reason: 'notAuthorized',
  })
  expect(provider.calls.acquire).toBe(0)
  bindings.answer(retained, { kind: 'unavailable' })
  expect(await registry.acquire(accessA, input)).toEqual({
    kind: 'rejected',
    reason: 'unavailable',
  })
  expect(provider.calls.acquire).toBe(0)
})

it('fixes retention scope, its chain and the ledger object in the original acquisition', async () => {
  const provider = scriptedProvider()
  const registry = registryWith([provider])
  const placement = await placed(registry, requirement([host]))
  const input = { ...acquireInput(placement), retention: { scope: scope('session'), ledger } }
  const first = await registry.acquire(accessA, input)
  expect(first.kind).toBe('acquired')
  expect(await registry.acquire(accessA, input)).toEqual(first)
  const { retention: _retention, ...ordinary } = input
  for (const changed of [
    ordinary,
    { ...input, retention: { ...input.retention, ledger: { ...ledger } } },
    { ...input, retention: { scope: scope('another-session'), ledger } },
    {
      ...input,
      retention: { scope: { ...input.retention.scope, parent: scope('different-parent') }, ledger },
    },
    { ...input, origin: originRef('another-origin') },
  ])
    expect(await registry.acquire(accessA, changed)).toEqual({
      kind: 'rejected',
      reason: 'acquisitionConflict',
    })
  expect(provider.calls.acquire).toBe(1)
})

it('seals retained admission before a resource enumeration can await or fail', async () => {
  const enumeration = deferred<void>()
  const enumerating = deferred<void>()
  let retention: ProviderAcquireInput['retention']
  const raw = scriptedProvider()
  const provider = scriptedProvider({
    acquire: async input => {
      retention = input.retention
      return raw.acquire(input)
    },
    recoverable: {
      list: async () => {
        enumerating.resolve()
        await enumeration.promise
        return { kind: 'unavailable' }
      },
      recover: async () => ({ status: 'pending', evidence: null }),
    },
  })
  const registry = registryWith([provider])
  const placement = await placed(registry, requirement([host]))
  const input = { ...acquireInput(placement), retention: { scope: scope('session'), ledger } }
  const acquired = await registry.acquire(accessA, input)
  if (acquired.kind !== 'acquired') throw new Error('expected acquired')
  const recovery = registry.releaseScope(input.retention.scope, createRecoveryAccess())
  await enumerating.promise
  expect(retention?.released.aborted).toBe(true)
  expect(await commandOf(acquired.lease).start(startRequest('late'))).toMatchObject({
    kind: 'rejected',
    reason: 'closed',
  })
  enumeration.resolve()
  expect(await recovery).toMatchObject({ kind: 'recovered', unavailable: [placement.provider] })
})

it('does not allocate after retained scope release overtakes quota preflight', async () => {
  const waiting = deferred<void>()
  const quota = deferred<void>()
  const provider = scriptedProvider({
    quota: async () => {
      waiting.resolve()
      await quota.promise
      return {
        kind: 'declared',
        quota: { unit: 'unsettled-acquisition', perTenant: 2, global: null },
      }
    },
  })
  const registry = registryWith([provider])
  const placement = await placed(registry, requirement([host]))
  const input = { ...acquireInput(placement), retention: { scope: scope('session'), ledger } }
  const acquiring = registry.acquire(accessA, input)
  await waiting.promise
  await registry.releaseScope(input.retention.scope, createRecoveryAccess())
  quota.resolve()
  expect(await acquiring).toEqual({ kind: 'rejected', reason: 'referenceExpired' })
  expect(provider.calls.acquire).toBe(0)
})

it('cleans a late provider receipt instead of reviving a released retention scope', async () => {
  const waiting = deferred<void>()
  const receipt = deferred<void>()
  const raw = scriptedProvider()
  const provider = scriptedProvider({
    acquire: async input => {
      waiting.resolve()
      await receipt.promise
      return raw.acquire(input)
    },
  })
  const registry = registryWith([provider])
  const placement = await placed(registry, requirement([host]))
  const input = { ...acquireInput(placement), retention: { scope: scope('session'), ledger } }
  const acquiring = registry.acquire(accessA, input)
  await waiting.promise
  await registry.releaseScope(input.retention.scope, createRecoveryAccess())
  receipt.resolve()
  expect(await acquiring).toMatchObject({
    kind: 'allocationFailed',
    reason: 'referenceExpired',
    cleanup: { kind: 'settled' },
  })
  expect(raw.calls.release).toBe(1)
})

it('keeps acquisition release separate from retained scope and closes an awaited guard on scope release', async () => {
  const waiting = deferred<void>()
  const authorized = deferred<void>()
  let retention: ProviderAcquireInput['retention']
  const raw = scriptedProvider()
  const provider = scriptedProvider({
    acquire: async input => {
      retention = input.retention
      return raw.acquire(input)
    },
  })
  const registry = registryWith([provider])
  const placement = await placed(registry, requirement([host]))
  const retained = { scope: scope('session'), ledger }
  const first = await registry.acquire(accessA, { ...acquireInput(placement), retention: retained })
  if (first.kind !== 'acquired') throw new Error('expected acquired')
  await first.lease.release()
  expect(retention?.released.aborted).toBe(false)
  const second = await registry.acquire(accessA, {
    ...acquireInput(placement, 'b', {
      authorize: async () => {
        waiting.resolve()
        await authorized.promise
        return 'authorized'
      },
    }),
    origin: originRef('b'),
    retention: retained,
  })
  if (second.kind !== 'acquired') throw new Error('expected acquired')
  const request = { ...startRequest('b'), origin: originRef('b') }
  const starting = commandOf(second.lease).start(request)
  await waiting.promise
  await registry.releaseScope(retained.scope, createRecoveryAccess())
  authorized.resolve()
  expect(await starting).toEqual({ kind: 'rejected', requestId: 'b', reason: 'closed' })
  expect(raw.calls.start).toBe(0)
})

it('takes a snapshot of the retention scope before an asynchronous authority check', async () => {
  const authority = openAuthority()
  const waiting = deferred<void>()
  const release = deferred<void>()
  let received: ProviderAcquireInput | undefined
  const provider = scriptedProvider({
    acquire: async input => {
      received = input
      return { kind: 'unknown', acquisition: input.acquisition }
    },
  })
  const registry = registryWith([provider], undefined, {
    authority: {
      authorize: async (access, action) => {
        if (action.kind === 'acquire') {
          waiting.resolve()
          await release.promise
        }
        return authority.authorize(access, action)
      },
    },
  })
  const placement = await placed(registry, requirement([host]))
  const retention: { scope: ReturnType<typeof scope>; ledger: ResourceLedger } = {
    scope: scope('original'),
    ledger,
  }
  const acquiring = registry.acquire(accessA, { ...acquireInput(placement), retention })
  await waiting.promise
  retention.scope = scope('changed')
  retention.ledger = { ...ledger }
  release.resolve()
  expect(await acquiring).toMatchObject({ kind: 'unknown', phase: 'allocation' })
  expect(received?.retention?.scope).toEqual(scope('original'))
  expect(received?.retention?.ledger).toBe(ledger)
})
