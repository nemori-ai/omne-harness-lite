// The host files provider: declared facts, acquisition answers, the ledger check through the
// registry gate, retirement and its drain, invalidation on retirement and release.
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { release, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  acquisitionRef,
  filesFacility,
  originRef,
  type EnvironmentBinding,
  type EnvironmentLease,
  type ObjectToken,
  type Placement,
  type ProviderAcquireInput,
  type ResourceLedger,
} from '@omne-harness/execution-environment-contract'
import { createEnvironmentRegistry } from '@omne-harness/execution-environment'
import {
  createHostFilesDomain,
  createHostFilesProvider,
  hostObjectToken,
} from '@omne-harness/execution-environment-host-local'
import manifest from '../package.json' with { type: 'json' }

const packageVersion = manifest.version

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

type ScopeRef = ProviderAcquireInput['scope']

function isScopeText(text: string): text is ScopeRef['ref'] {
  return text.length > 0
}

function scopeOf(text: string): ScopeRef {
  if (!isScopeText(text)) throw new TypeError('empty scope')
  return { ref: text }
}

const scope1 = scopeOf('scope-1')

function ledgerWith(closed: AbortSignal): ResourceLedger {
  return {
    closed,
    plan: async () => 'recorded',
    permit: async () => 'confirmed',
    adopt: async () => 'confirmed',
    stopped: async () => 'recorded',
  }
}

function placementOn(
  binding: EnvironmentBinding,
  provider: { name: string; generation: string; version: string },
) {
  const placement: Placement = {
    kind: 'placement',
    requirement: { allowedBindings: [binding], facilities: ['files'], isolation: [] },
    binding,
    provider: { name: provider.name, generation: provider.generation, version: provider.version },
    continuity: { kind: 'not_guaranteed' },
    quotaDomain: 'host-files',
  }
  return placement
}

function inputFor(
  provider: { name: string; generation: string; version: string },
  closed = new AbortController().signal,
  binding: EnvironmentBinding = host,
  key = 'acq-1',
): ProviderAcquireInput {
  return {
    acquisition: acquisitionRef(key),
    origin: originRef('call-1'),
    scope: scope1,
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
  if (acquired.kind !== 'acquired') throw new Error(`expected a lease: ${JSON.stringify(acquired)}`)
  return acquired.lease
}

/** Resolves to `pending` when the promise has not settled after the queued callbacks ran. */
async function settledOrPending<T>(promise: Promise<T>): Promise<T | 'pending'> {
  return Promise.race([
    promise,
    new Promise<'pending'>(resolve => setTimeout(resolve, 20, 'pending')),
  ])
}

it('declares the host layer, the files key, no isolation, and an empty resource recovery', async () => {
  const provider = createHostFilesProvider({ domain: createHostFilesDomain() })
  expect(provider).toMatchObject({
    name: 'host-files',
    bindingKinds: ['host_machine'],
    continuity: { kind: 'not_guaranteed' },
    facilities: ['files'],
    isolation: [],
  })
  expect(provider.generation).toMatch(/^[0-9a-f-]{36}$/)
  expect(createHostFilesProvider({ domain: createHostFilesDomain() }).generation).not.toBe(
    provider.generation,
  )
  expect(provider.quotaDomain).toBe('host-files')
  expect(await provider.listRecoveryResources?.(scope1)).toEqual({ kind: 'listed', resources: [] })
  expect(
    await provider.recover?.({ key: 'r', provider: 'host-files', reference: { kind: 'null' } }),
  ).toEqual({ status: 'unsupported', evidence: null })
  expect(provider.version).toBe(packageVersion)
  expect(await provider.describe()).toEqual({
    provider: 'host-files',
    generation: provider.generation,
    version: packageVersion,
    platform: { os: process.platform, release: release() },
    facilities: ['files'],
    isolation: [],
    prerequisites: 'unknown',
  })
})

it('hands out a host lease with its own identity and evidence, and only the files facility', async () => {
  const provider = createHostFilesProvider({ domain: createHostFilesDomain() })
  const input = inputFor(provider)
  const acquired = await provider.acquire(input)
  expect(acquired).toMatchObject({
    kind: 'acquired',
    evidence: {
      kind: 'object',
      entries: [
        { key: 'provider', value: { kind: 'string', value: 'host-files' } },
        { key: 'generation', value: { kind: 'string', value: provider.generation } },
        { key: 'version', value: { kind: 'string', value: packageVersion } },
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
  const provider = createHostFilesProvider({ domain: createHostFilesDomain() })
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

async function namedNotes(contents: string) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-exec-env-')))
  roots.push(root)
  const path = join(root, 'notes.txt')
  await writeFile(path, contents)
  return { root, path, named: await hostObjectToken(path) }
}

function writeRequest(path: string, named: ObjectToken, requestId: string, text: string) {
  return {
    requestId,
    access: { principal: 'subject-a', tenant },
    origin: originRef('call-1'),
    binding: host,
    path,
    named,
    bytes: new TextEncoder().encode(text),
    mode: 'replace' as const,
  }
}

it('answers closed through the registry gate once the acquisition ledger is closed', async () => {
  const { path, named } = await namedNotes('before')
  const registry = createEnvironmentRegistry<unknown>({
    recovery: { authorizeRecovery: async () => 'authorized' },
    authority: {
      async authorize(caller) {
        return { kind: 'authorized', principal: caller.principal, current: () => true }
      },
    },
    bindings: { lookup: async () => ({ kind: 'bound', tenant }) },
  })
  registry.registerFacility(filesFacility)
  const provider = createHostFilesProvider({ domain: createHostFilesDomain() })
  registry.registerProvider(provider)
  const requester = scope1
  const access = { principal: 'subject-a', tenant }
  const placement = await registry.resolvePlacement(access, {
    scope: requester,
    requirement: { allowedBindings: [host], facilities: ['files'], isolation: [] },
  })
  if (placement.kind !== 'placement') throw new Error('expected a placement')
  const filesOf = async (key: string, closed: AbortSignal) => {
    const acquired = await registry.acquire(access, {
      acquisition: acquisitionRef(key),
      origin: originRef('call-1'),
      scope: requester,
      placement,
      ledger: ledgerWith(closed),
      guard: { authorize: async () => 'authorized' },
    })
    if (acquired.kind !== 'acquired') throw new Error('expected a lease')
    const files = acquired.lease.facility('files')
    if (files === undefined) throw new Error('expected files')
    return files
  }
  const closing = new AbortController()
  const files = await filesOf('closing', closing.signal)
  const others = await filesOf('open', new AbortController().signal)
  closing.abort()
  expect(await files.write(writeRequest(path, named, 'w1', 'after-ledger-closed'))).toEqual({
    kind: 'rejected',
    requestId: 'w1',
    reason: 'closed',
  })
  expect(await readFile(path, 'utf8')).toBe('before')
  expect(await others.write(writeRequest(path, named, 'w2', 'other-ledger'))).toMatchObject({
    kind: 'done',
  })
  expect(await readFile(path, 'utf8')).toBe('other-ledger')
})

it('drains at once when no file operation is in flight, and admits no new operation after', async () => {
  const { path, named } = await namedNotes('kept')
  const provider = createHostFilesProvider({ domain: createHostFilesDomain() })
  const files = (await leaseOf(provider, inputFor(provider))).facility('files')
  if (files === undefined) throw new Error('expected files')
  expect(await provider.retire()).toEqual({ kind: 'drained' })
  expect(await files.write(writeRequest(path, named, 'late', 'after-retire'))).toEqual({
    kind: 'rejected',
    requestId: 'late',
    reason: 'closed',
  })
  expect(await readFile(path, 'utf8')).toBe('kept')
})

it('refuses a drain bound that is not a finite number zero or more', () => {
  expect(() =>
    createHostFilesProvider({ domain: createHostFilesDomain(), drainBoundMs: -1 }),
  ).toThrow(RangeError)
  expect(() =>
    createHostFilesProvider({ domain: createHostFilesDomain(), drainBoundMs: Number.NaN }),
  ).toThrow(RangeError)
  expect(createHostFilesProvider({ domain: createHostFilesDomain(), drainBoundMs: 0 }).name).toBe(
    'host-files',
  )
})

it('invalidates live leases on retirement but not a lease it already released', async () => {
  const provider = createHostFilesProvider({ domain: createHostFilesDomain() })
  const released = await leaseOf(provider, inputFor(provider, undefined, host, 'released'))
  const live = await leaseOf(provider, inputFor(provider, undefined, host, 'live'))
  await released.release()
  await provider.retire()
  await expect(live.invalidated).resolves.toEqual({ source: 'provider', reason: 'providerRetired' })
  expect(await settledOrPending(released.invalidated)).toBe('pending')
})
