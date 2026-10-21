// The host files provider on its own: declared facts, acquisition answers, the per-acquisition
// ledger check, invalidation on retirement and release.
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  acquisitionRef,
  originRef,
  type EnvironmentBinding,
  type EnvironmentLease,
  type Placement,
  type ProviderAcquireInput,
  type ResourceLedger,
} from '@omne-harness/execution-environment-contract'
import {
  createHostFilesProvider,
  hostObjectToken,
} from '@omne-harness/execution-environment-host-local'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

const tenant = (() => {
  const parsed = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_0123456789abcdefghjkmnpqrs',
      account: 'acc_0123456789abcdefghjkmnpqrs',
    }),
  )
  if (!parsed.ok) throw new Error('tenant fixture did not parse')
  return parsed.value
})()

const host: EnvironmentBinding = { kind: 'host_machine' }

function ledgerWith(closed: AbortSignal): ResourceLedger {
  return {
    closed,
    plan: async () => 'recorded',
    permit: async () => 'confirmed',
    adopt: async () => 'confirmed',
    stopped: async () => 'recorded',
  }
}

function placementOn(binding: EnvironmentBinding, provider: { name: string; generation: string }) {
  const placement: Placement = {
    kind: 'placement',
    requirement: { allowedBindings: [binding], facilities: ['files'], isolation: [] },
    binding,
    provider,
    continuity: { kind: 'not_guaranteed' },
  }
  return placement
}

function inputFor(
  provider: { name: string; generation: string },
  closed = new AbortController().signal,
  binding: EnvironmentBinding = host,
): ProviderAcquireInput {
  return {
    acquisition: acquisitionRef('acq-1'),
    origin: originRef('call-1'),
    placement: placementOn(binding, provider),
    tenant,
    ledger: ledgerWith(closed),
  }
}

async function leaseOf(
  provider: ReturnType<typeof createHostFilesProvider>,
  input: ProviderAcquireInput,
): Promise<EnvironmentLease> {
  const acquired = await provider.acquire(input)
  if (acquired.kind !== 'acquired') throw new Error(`expected a lease: ${acquired.reason}`)
  return acquired.lease
}

/** Resolves to `pending` when the promise has not settled after the queued callbacks ran. */
async function settledOrPending<T>(promise: Promise<T>): Promise<T | 'pending'> {
  return Promise.race([
    promise,
    new Promise<'pending'>(resolve => setTimeout(resolve, 20, 'pending')),
  ])
}

it('declares the host layer, the files key, no isolation and no recovery', async () => {
  const provider = createHostFilesProvider()
  expect(provider).toMatchObject({
    name: 'host-files',
    bindingKinds: ['host_machine'],
    continuity: { kind: 'not_guaranteed' },
    facilities: ['files'],
    isolation: [],
  })
  expect(provider.generation).toMatch(/^[0-9a-f-]{36}$/)
  expect(createHostFilesProvider().generation).not.toBe(provider.generation)
  expect(provider.listRecoveryResources).toBeUndefined()
  expect(provider.recover).toBeUndefined()
  expect(await provider.describe()).toEqual({
    provider: 'host-files',
    generation: provider.generation,
    platform: process.platform,
    facilities: ['files'],
    isolation: [],
    prerequisites: 'satisfied',
  })
})

it('hands out a host lease with its own identity and evidence, and only the files facility', async () => {
  const provider = createHostFilesProvider()
  const input = inputFor(provider)
  const acquired = await provider.acquire(input)
  expect(acquired).toMatchObject({
    kind: 'acquired',
    evidence: {
      kind: 'object',
      entries: [
        { key: 'provider', value: { kind: 'string', value: 'host-files' } },
        { key: 'generation', value: { kind: 'string', value: provider.generation } },
      ],
    },
  })
  if (acquired.kind !== 'acquired') return
  expect(acquired.lease.placement).toBe(input.placement)
  expect(acquired.lease.instance).toEqual({ id: 'host', generation: provider.generation })
  expect(acquired.lease.continuity).toEqual({ kind: 'not_guaranteed' })
  expect(acquired.lease.facility('files')).toBeDefined()
  expect(acquired.lease.facility('command')).toBeUndefined()
  expect(await acquired.lease.release()).toEqual({ kind: 'released' })
})

it('refuses a sandbox placement and, once retired, any placement', async () => {
  const provider = createHostFilesProvider()
  const sandbox: EnvironmentBinding = { kind: 'tenant_sandbox', tenant }
  expect(await provider.acquire(inputFor(provider, undefined, sandbox))).toEqual({
    kind: 'rejected',
    reason: 'noMatchingEnvironment',
  })
  expect(await provider.retire()).toEqual({ kind: 'drained' })
  expect(await provider.acquire(inputFor(provider))).toEqual({
    kind: 'rejected',
    reason: 'providerUnavailable',
  })
})

it('answers closed without touching the file once the acquisition ledger is closed', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-exec-env-')))
  roots.push(root)
  const path = join(root, 'notes.txt')
  await writeFile(path, 'before')
  const named = await hostObjectToken(path)
  const provider = createHostFilesProvider()
  const closing = new AbortController()
  const open = await leaseOf(provider, inputFor(provider))
  const lease = await leaseOf(provider, inputFor(provider, closing.signal))
  const files = lease.facility('files')
  const others = open.facility('files')
  if (files === undefined || others === undefined) throw new Error('expected files')
  const request = {
    requestId: 'w1',
    access: { principal: 'subject-a', tenant },
    origin: originRef('call-1'),
    binding: host,
    path,
    named,
  }
  expect(await files.stat(request)).toMatchObject({ kind: 'done' })
  closing.abort()
  const bytes = new TextEncoder().encode('after-ledger-closed')
  const closed = (requestId: string) => ({ kind: 'rejected', requestId, reason: 'closed' })
  expect(await files.write({ ...request, bytes, mode: 'replace' })).toEqual(closed('w1'))
  expect(await files.write({ ...request, requestId: 'c1', bytes, mode: 'create' })).toEqual(
    closed('c1'),
  )
  expect(await files.read({ ...request, requestId: 'r1' })).toEqual(closed('r1'))
  expect(await files.stat({ ...request, requestId: 's1' })).toEqual(closed('s1'))
  const handle = { object: named, generation: '1' }
  expect(await files.close({ ...request, requestId: 'x1', handle })).toEqual(closed('x1'))
  expect(await files.list({ ...request, requestId: 'l1' })).toEqual(closed('l1'))
  expect(
    await files.search({
      ...request,
      requestId: 'q1',
      pattern: bytes,
      match: 'name',
      recursive: false,
    }),
  ).toEqual(closed('q1'))
  expect(await files.mkdir({ ...request, requestId: 'm1', parents: false })).toEqual(closed('m1'))
  expect(await files.remove({ ...request, requestId: 'd1', recursive: false })).toEqual(
    closed('d1'),
  )
  const target = { path: join(root, 'target.txt'), named: null }
  expect(await files.move({ ...request, requestId: 'v1', target, replace: false })).toEqual(
    closed('v1'),
  )
  expect(await files.copy({ ...request, requestId: 'y1', target, replace: false })).toEqual(
    closed('y1'),
  )
  expect(
    await files.commitBatch({
      requestId: 'b1',
      access: request.access,
      origin: request.origin,
      binding: host,
      entries: [],
    }),
  ).toEqual(closed('b1'))
  expect(
    await files.recoverBatch({
      requestId: 'b2',
      access: request.access,
      origin: request.origin,
      binding: host,
      batch: { id: 'batch', generation: '1' },
    }),
  ).toEqual(closed('b2'))
  expect(await readFile(path, 'utf8')).toBe('before')
  expect(await others.read({ ...request, requestId: 'other' })).toMatchObject({ kind: 'done' })
})

it('invalidates live leases on retirement but not a lease it already released', async () => {
  const provider = createHostFilesProvider()
  const released = await leaseOf(provider, inputFor(provider))
  const live = await leaseOf(provider, inputFor(provider))
  await released.release()
  await provider.retire()
  await expect(live.invalidated).resolves.toEqual({ source: 'provider', reason: 'providerRetired' })
  expect(await settledOrPending(released.invalidated)).toBe('pending')
})
