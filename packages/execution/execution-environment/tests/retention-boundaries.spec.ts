import { expect, it } from 'vitest'
import {
  createRecoveryAccess,
  filesFacility,
  terminalFacility,
  originRef,
  type FacilityGuard,
  type FileSystemFacility,
  type TerminalFacility,
  type ProviderAcquireInput,
} from '@omne-harness/execution-environment-contract'
import {
  createMemoryFileSystem,
  createScriptedTerminalFacility,
} from '@omne-harness/execution-environment-contract/testing'
import {
  accessA,
  acquireInput,
  bindingTable,
  host,
  ledger,
  placed,
  registryWith,
  requirement,
  scope,
  scriptedProvider,
  tenantB,
} from './doubles.ts'
import { retainedPeer } from './retained-provider.ts'

it('does not cache attach authorization and still lets the owner release after access is revoked', async () => {
  const peer = retainedPeer()
  const registry = registryWith([peer.provider])
  registry.registerFacility(terminalFacility)
  const placement = await placed(registry, requirement([host], ['terminal']))
  let authorized = true
  const operations: string[] = []
  const guard: FacilityGuard<string> = {
    authorize: async (_facility, operation) => {
      operations.push(operation)
      return authorized ? 'authorized' : 'notAuthorized'
    },
  }
  const acquired = await registry.acquire(accessA, {
    ...acquireInput(placement, 'a', guard),
    retention: { scope: scope('session'), ledger },
  })
  if (acquired.kind !== 'acquired') throw new Error('expected acquired')
  const terminal = acquired.lease.facility('terminal')
  if (!terminal) throw new Error('expected terminal')
  const request = { access: accessA, binding: host, origin: originRef('call-1'), requestId: 'a' }
  const created = await terminal.create({ ...request, cwd: '/', env: {}, retain: 'session' })
  if (created.kind !== 'done') throw new Error('expected terminal creation')
  if (terminal.attach === undefined) throw new Error('expected attach support')
  expect(await terminal.attach({ ...request, terminal: created.value.terminal })).toMatchObject({
    kind: 'done',
  })
  authorized = false
  expect(
    await terminal.execute({ ...request, terminal: created.value.terminal, script: '/changed' }),
  ).toMatchObject({ kind: 'rejected', reason: 'notAuthorized' })
  expect(operations).toEqual(['create', 'attach', 'execute'])
  expect(peer.calls).toEqual(['attach'])
  expect(await acquired.lease.release()).toEqual({ kind: 'released' })
  expect(peer.inputs[0]?.retention?.released.aborted).toBe(false)
})

it('rejects retained requests without a configured retention or without provider attachment methods', async () => {
  for (const configured of [false, true]) {
    const scripted = createScriptedTerminalFacility(() => ({ kind: 'started' }))
    const create = scripted.facility.create
    scripted.facility.create = request => {
      const { retain: _retain, ...ordinary } = request
      return create(ordinary)
    }
    const legacy: TerminalFacility<unknown> = {
      create: scripted.facility.create,
      execute: scripted.facility.execute,
      close: scripted.facility.close,
      list: scripted.facility.list,
    }
    const provider = scriptedProvider({
      keys: ['terminal'],
      facilities: { terminal: configured ? legacy : scripted.facility },
    })
    const registry = registryWith([provider])
    registry.registerFacility(terminalFacility)
    const placement = await placed(registry, requirement([host], ['terminal']))
    const acquired = await registry.acquire(accessA, {
      ...acquireInput(placement),
      ...(configured ? { retention: { scope: scope('session'), ledger } } : {}),
    })
    if (acquired.kind !== 'acquired') throw new Error('expected acquired')
    const terminal = acquired.lease.facility('terminal')
    if (!terminal) throw new Error('expected terminal')
    if (terminal.attach === undefined) throw new Error('expected guarded attach entry')
    const request = {
      access: accessA,
      binding: host,
      origin: originRef('call-1'),
      requestId: 'legacy',
    }
    expect(await terminal.create({ ...request, cwd: '/', env: {}, retain: 'session' })).toEqual({
      kind: 'rejected',
      requestId: request.requestId,
      reason: 'unsupported',
    })
    expect(
      await terminal.attach({ ...request, terminal: { id: 'unknown', generation: '1' } }),
    ).toMatchObject({ kind: 'rejected', reason: 'unsupported' })
    expect(await terminal.list(request)).toMatchObject({ kind: 'done', value: [] })
    expect(await terminal.create({ ...request, cwd: '/', env: {} })).toMatchObject({ kind: 'done' })
  }
})

it('keeps retention open on denied recovery and refuses future acquisitions after approved release', async () => {
  let allowed = false
  let input: ProviderAcquireInput | undefined
  const raw = scriptedProvider()
  const provider = scriptedProvider({
    acquire: async received => {
      input = received
      return raw.acquire(received)
    },
  })
  const registry = registryWith([provider], {
    authorizeRecovery: async () => (allowed ? 'authorized' : 'notAuthorized'),
  })
  const placement = await placed(registry, requirement([host]))
  const retention = { scope: scope('session'), ledger }
  await registry.acquire(accessA, { ...acquireInput(placement), retention })
  expect(await registry.releaseScope(retention.scope, createRecoveryAccess())).toEqual({
    kind: 'rejected',
    reason: 'notAuthorized',
  })
  expect(input?.retention?.released.aborted).toBe(false)
  allowed = true
  await registry.releaseScope(retention.scope, createRecoveryAccess())
  expect(input?.retention?.released.aborted).toBe(true)
  expect(await registry.acquire(accessA, { ...acquireInput(placement, 'new'), retention })).toEqual(
    { kind: 'rejected', reason: 'referenceExpired' },
  )
  expect(provider.calls.acquire).toBe(1)
})

it('preserves and checks the retained scope on original queries and maintenance handoff', async () => {
  const bindings = bindingTable()
  const provider = scriptedProvider()
  const registry = registryWith([provider], undefined, { bindings })
  const placement = await placed(registry, requirement([host]))
  const retention = { scope: scope('session'), ledger }
  const input = { ...acquireInput(placement), retention }
  await registry.acquire(accessA, input)
  const original = {
    tenant: accessA.tenant,
    acquisition: input.acquisition,
    origin: input.origin,
    scope: input.scope,
    placement,
    retentionScope: retention.scope,
  }
  bindings.bind(retention.scope, tenantB)
  expect(await registry.inspectAcquisition(accessA, { kind: 'original', original })).toEqual({
    kind: 'refused',
    reason: 'notAuthorized',
  })
  expect(provider.calls.inspect).toBe(0)
  const recovered = await registry.releaseScope(retention.scope, createRecoveryAccess(), [original])
  expect(recovered.kind).toBe('recovered')
  if (recovered.kind !== 'recovered') throw new Error('expected recovery')
  expect(recovered.settledAcquisitions).toEqual([{ original, outcome: 'settled' }])
})

it('passes the optional write effect through the facility gate without adding it to stat', async () => {
  const memory = createMemoryFileSystem()
  const files: FileSystemFacility<unknown> = {
    ...memory.facility,
    async write(request) {
      const written = await memory.facility.write(request)
      return written.kind === 'done'
        ? { ...written, value: { ...written.value, writeEffect: 'created' } }
        : written
    },
  }
  const provider = scriptedProvider({ keys: ['files'], facilities: { files } })
  const registry = registryWith([provider])
  registry.registerFacility(filesFacility)
  const placement = await placed(registry, requirement([host], ['files']))
  const acquired = await registry.acquire(accessA, acquireInput(placement))
  if (acquired.kind !== 'acquired') throw new Error('expected acquired')
  const guarded = acquired.lease.facility('files')
  if (!guarded) throw new Error('expected files')
  const request = {
    access: accessA,
    binding: host,
    origin: originRef('call-1'),
    requestId: 'write',
    path: 'file',
    named: memory.objectToken('') ?? null,
  }
  const written = await guarded.write({ ...request, bytes: new Uint8Array([1]), mode: 'create' })
  expect(written).toMatchObject({ kind: 'done', value: { writeEffect: 'created' } })
  const stat = await guarded.stat({ ...request, named: memory.objectToken('file') ?? null })
  expect(stat.kind).toBe('done')
  if (stat.kind === 'done') expect(stat.value).not.toHaveProperty('writeEffect')
})
