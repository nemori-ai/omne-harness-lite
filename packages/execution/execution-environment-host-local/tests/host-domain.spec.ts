// The host files domain on the real file system and real descriptors: per-acquisition admission
// and drain, failed closes kept by their owner, quota shared across provider generations, queries
// and settlements after a reload, and the conservative answer for a generation the domain never
// issued. Two test controls replace parts of `node:fs/promises`: `open` on a marked path waits for
// the test, and `FileHandle.close` can fail while `closeFails` is set. File bytes, inodes and
// descriptors are real.
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, expect, it, vi } from 'vitest'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  acquisitionRef,
  createRecoveryAccess,
  filesFacility,
  originRef,
  type EnvironmentBinding,
  type EnvironmentProvider,
  type FileSystemFacility,
  type ObjectToken,
  type OriginalAcquisition,
  type ProviderAcquireInput,
  type ResourceLedger,
} from '@omne-harness/execution-environment-contract'
import { createEnvironmentRegistry } from '@omne-harness/execution-environment'
import {
  createHostFilesDomain,
  createHostFilesProvider,
  hostObjectToken,
  type HostFilesDiagnostic,
  type HostFilesDomain,
} from '@omne-harness/execution-environment-host-local'
import {
  createHostFilesDomain as createSourceDomain,
  domainInternals,
  type DomainRecord as SourceRecord,
  type HostFilesDomain as SourceDomain,
} from '../src/host-domain.ts'
import { createHostFilesProvider as createSourceProvider } from '../src/host-provider.ts'

const control = vi.hoisted(() => ({
  marker: 'held-by-test',
  closeFails: 0,
  entered: (): void => undefined,
  release: (): void => undefined,
  released: Promise.resolve(),
  entry: Promise.resolve(),
  closed: 0,
}))

function holdNextOpen(): void {
  control.entry = new Promise<void>(resolve => {
    control.entered = resolve
  })
  control.released = new Promise<void>(resolve => {
    control.release = resolve
  })
}

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    async open(...args: Parameters<typeof actual.open>) {
      if (String(args[0]).includes(control.marker)) {
        control.entered()
        await control.released
      }
      const handle = await actual.open(...args)
      const close = handle.close.bind(handle)
      handle.close = async () => {
        if (control.closeFails > 0) {
          control.closeFails--
          throw new Error('injected close failure on a live descriptor')
        }
        await close()
        control.closed++
      }
      return handle
    },
  }
})

const roots: string[] = []

afterEach(async () => {
  control.release()
  control.closeFails = 0
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function tenantOf(account: string): TenantId {
  const parsed = tenantCodec.parse(
    JSON.stringify({ organization: 'org_0123456789abcdefghjkmnpqrs', account }),
  )
  if (!parsed.ok) throw new Error('tenant fixture did not parse')
  return parsed.value
}

const tenantA = tenantOf('acc_0123456789abcdefghjkmnpqrs')
const tenantB = tenantOf('acc_0123456789abcdefghjkmnpqrt')
const host: EnvironmentBinding = { kind: 'host_machine' }
const ledger: ResourceLedger = {
  closed: new AbortController().signal,
  plan: async () => 'recorded',
  permit: async () => 'confirmed',
  adopt: async () => 'confirmed',
  stopped: async () => 'recorded',
}

type ScopeRef = ProviderAcquireInput['scope']
function isScopeText(text: string): text is ScopeRef['ref'] {
  return text.length > 0
}
function scopeOf(text: string): ScopeRef {
  if (!isScopeText(text)) throw new TypeError('empty scope')
  return { ref: text }
}
const scope1 = scopeOf('scope-1')

function inputFor(
  provider: EnvironmentProvider,
  key: string,
  tenant: TenantId = tenantA,
): ProviderAcquireInput {
  return {
    acquisition: acquisitionRef(key),
    origin: originRef('call-1'),
    scope: scope1,
    tenant,
    ledger,
    placement: {
      kind: 'placement',
      requirement: { allowedBindings: [host], facilities: ['files'], isolation: [] },
      binding: host,
      provider: { name: provider.name, generation: provider.generation, version: provider.version },
      continuity: { kind: 'not_guaranteed' },
      quotaDomain: provider.quotaDomain,
    },
  }
}

function originalOf(input: ProviderAcquireInput): OriginalAcquisition {
  return {
    tenant: input.tenant,
    acquisition: input.acquisition,
    origin: input.origin,
    scope: input.scope,
    placement: input.placement,
  }
}

async function leaseOf(provider: EnvironmentProvider, input: ProviderAcquireInput) {
  const acquired = await provider.acquire(input)
  if (acquired.kind !== 'acquired') throw new Error(`expected a lease: ${JSON.stringify(acquired)}`)
  const files = acquired.lease.facility('files')
  if (files === undefined) throw new Error('expected files')
  return { lease: acquired.lease, files }
}

async function notes(name = 'notes.txt', contents = 'before') {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-host-domain-')))
  roots.push(root)
  const path = join(root, name)
  await writeFile(path, contents)
  return { path, named: await hostObjectToken(path) }
}

function base(path: string, named: ObjectToken, requestId: string, tenant: TenantId = tenantA) {
  return {
    requestId,
    access: { principal: 'subject', tenant },
    origin: originRef('call-1'),
    binding: host,
    path,
    named,
  }
}

function write(files: FileSystemFacility<unknown>, path: string, named: ObjectToken, id: string) {
  return files.write({
    ...base(path, named, id),
    bytes: new TextEncoder().encode(`written-by-${id}`),
    mode: 'replace',
  })
}

function quotaOf(perTenant: number, global: number | null = null) {
  return () => ({ perTenant, global })
}

async function settledOrPending<T>(promise: Promise<T>): Promise<T | 'pending'> {
  return Promise.race([promise, new Promise<'pending'>(r => setTimeout(r, 20, 'pending'))])
}

it('drains one acquisition on release: pending with no resources while an operation runs, and the slot stays taken', async () => {
  const domain = createHostFilesDomain({ quota: quotaOf(2) })
  const diagnostics: HostFilesDiagnostic[] = []
  const provider = createHostFilesProvider({
    domain,
    drainBoundMs: 20,
    diagnose: d => diagnostics.push(d),
  })
  const held = await notes(`${'held-by-test'}.txt`)
  const other = await notes('other.txt')
  holdNextOpen()
  const first = await leaseOf(provider, inputFor(provider, 'first'))
  const second = await leaseOf(provider, inputFor(provider, 'second'))
  const running = write(first.files, held.path, held.named, 'in-flight')
  await control.entry
  expect(await first.lease.release()).toEqual({ kind: 'pending', resources: [] })
  expect(diagnostics).toMatchObject([
    { kind: 'drainBoundExceeded', inFlight: 1, openDescriptors: 0, acquisition: 'first' },
  ])
  // The slot is still taken, so a third acquisition of the tenant is refused at quota 2.
  expect(await provider.acquire(inputFor(provider, 'third'))).toEqual({
    kind: 'rejected',
    reason: 'quotaExceeded',
  })
  // The other acquisition keeps working, and the released one admits nothing new.
  expect(await write(second.files, other.path, other.named, 'second-ok')).toMatchObject({
    kind: 'done',
  })
  expect(await write(first.files, other.path, other.named, 'late')).toEqual({
    kind: 'rejected',
    requestId: 'late',
    reason: 'closed',
  })
  control.release()
  // The result goes back to the original request.
  expect(await running).toMatchObject({ kind: 'done', requestId: 'in-flight' })
  expect(await readFile(held.path, 'utf8')).toBe('written-by-in-flight')
  expect(await first.lease.release()).toEqual({ kind: 'released' })
  expect((await leaseOf(provider, inputFor(provider, 'third'))).lease).toBeDefined()
  // A second release does not return the slot again.
  expect(await first.lease.release()).toEqual({ kind: 'released' })
  expect(await provider.acquire(inputFor(provider, 'fourth'))).toEqual({
    kind: 'rejected',
    reason: 'quotaExceeded',
  })
})

it('keeps a live descriptor whose close failed with its acquisition, until a maintenance retry closes it', async () => {
  const domain = createHostFilesDomain()
  const provider = createHostFilesProvider({ domain, drainBoundMs: 20 })
  const file = await notes()
  const { lease, files } = await leaseOf(provider, inputFor(provider, 'owner'))
  // The read's close and the retirement's retry both fail; the maintenance retry succeeds.
  control.closeFails = 2
  const read = await files.read(base(file.path, file.named, 'read'))
  expect(read).toMatchObject({ kind: 'done', value: { bytes: new TextEncoder().encode('before') } })
  // The read result stands; the descriptor is still open and belongs to this acquisition.
  expect(await provider.retire()).toEqual({ kind: 'pending', resources: [] })
  await expect(lease.invalidated).resolves.toEqual({
    source: 'provider',
    reason: 'providerRetired',
  })
  expect(await provider.inspectAcquisition(originalOf(inputFor(provider, 'owner')))).toEqual({
    kind: 'pending',
    phase: 'releasing',
    resources: [],
  })
  const closedBefore = control.closed
  expect(await domain.maintain()).toEqual({ pending: 0 })
  expect(control.closed).toBe(closedBefore + 1)
  expect(await provider.inspectAcquisition(originalOf(inputFor(provider, 'owner')))).toEqual({
    kind: 'settled',
  })
  expect(await provider.retire()).toEqual({ kind: 'drained' })
})

it('keeps an error-path descriptor with its acquisition and settles only after it is closed', async () => {
  const domain = createHostFilesDomain()
  const provider = createHostFilesProvider({ domain, drainBoundMs: 20 })
  const file = await notes()
  const input = inputFor(provider, 'error-path')
  const { files } = await leaseOf(provider, input)
  // A named object that does not match makes the facility close the opened descriptor on an error path.
  control.closeFails = 2
  const refused = await files.read(base(file.path, { token: 'other:object' }, 'mismatch'))
  expect(refused).toEqual({ kind: 'rejected', requestId: 'mismatch', reason: 'conflict' })
  expect(await provider.settleAcquisition(originalOf(input))).toEqual({
    kind: 'pending',
    resources: [],
  })
  expect(await provider.settleAcquisition(originalOf(input))).toEqual({ kind: 'settled' })
  expect(await provider.settleAcquisition(originalOf(input))).toEqual({ kind: 'settled' })
})

it('never lets one acquisition close a handle another acquisition holds on the same file', async () => {
  const domain = createHostFilesDomain()
  const provider = createHostFilesProvider({ domain })
  const file = await notes()
  const a = await leaseOf(provider, inputFor(provider, 'a'))
  const b = await leaseOf(provider, inputFor(provider, 'b'))
  control.closeFails = 1
  const readA = await a.files.read(base(file.path, file.named, 'read-a'))
  const readB = await b.files.read(base(file.path, file.named, 'read-b'))
  if (readA.kind !== 'done' || readB.kind !== 'done') throw new Error('expected reads')
  // Generations are unique in the domain, so the two handles never collide.
  expect(readA.value.handle.generation).not.toBe(readB.value.handle.generation)
  expect(
    await b.files.close({
      ...base(file.path, file.named, 'b-closes-a'),
      handle: readA.value.handle,
    }),
  ).toEqual({ kind: 'unknown', requestId: 'b-closes-a' })
  // A's descriptor is still open and A can still close it.
  expect(
    await a.files.close({ ...base(file.path, file.named, 'a-closes'), handle: readA.value.handle }),
  ).toEqual({ kind: 'done', requestId: 'a-closes', value: { handle: readA.value.handle } })
})

it('shares quota and original records across a provider reload in one domain, and settles through the new generation', async () => {
  const domain = createHostFilesDomain({ quota: quotaOf(1) })
  const old = createHostFilesProvider({ domain, drainBoundMs: 20 })
  const file = await notes()
  const input = inputFor(old, 'before-reload')
  const { lease, files } = await leaseOf(old, input)
  // The read's close and the old generation's retry fail; the new generation's settlement closes it.
  control.closeFails = 2
  expect((await files.read(base(file.path, file.named, 'read'))).kind).toBe('done')
  expect(await old.retire()).toEqual({ kind: 'pending', resources: [] })

  const fresh = createHostFilesProvider({ domain, drainBoundMs: 20 })
  expect(fresh.quotaDomain).toBe(old.quotaDomain)
  // The new generation sees the original slot: the tenant's quota of one is still taken.
  expect(await fresh.acquire(inputFor(fresh, 'after-reload'))).toEqual({
    kind: 'rejected',
    reason: 'quotaExceeded',
  })
  expect(await fresh.listAcquisitions(scope1)).toEqual({
    kind: 'listed',
    acquisitions: [originalOf(input)],
  })
  expect(await fresh.inspectAcquisition(originalOf(input))).toEqual({
    kind: 'pending',
    phase: 'releasing',
    resources: [],
  })
  expect(await fresh.settleAcquisition(originalOf(input))).toEqual({ kind: 'settled' })
  // The old lease is never revived by the query or the settlement.
  expect(await write(files, file.path, file.named, 'revived')).toEqual({
    kind: 'rejected',
    requestId: 'revived',
    reason: 'closed',
  })
  expect(await settledOrPending(lease.invalidated)).toEqual({
    source: 'provider',
    reason: 'providerRetired',
  })
  expect((await leaseOf(fresh, inputFor(fresh, 'after-reload'))).lease).toBeDefined()
})

it('lets a rebuilt registry settle the original acquisition through the recovery path, without a new acquisition', async () => {
  const domain = createHostFilesDomain()
  const recovery = { authorizeRecovery: async () => 'authorized' as const }
  const ports = {
    authority: {
      async authorize(access: { principal: unknown }) {
        return { kind: 'authorized', principal: access.principal, current: () => true } as const
      },
    },
    bindings: { lookup: async () => ({ kind: 'bound', tenant: tenantA }) as const },
  }
  const first = createEnvironmentRegistry<unknown>({ recovery, ...ports })
  first.registerFacility(filesFacility)
  const old = createHostFilesProvider({ domain, drainBoundMs: 20 })
  first.registerProvider(old)
  const placement = await first.resolvePlacement(
    { principal: 'subject', tenant: tenantA },
    {
      scope: scope1,
      requirement: { allowedBindings: [host], facilities: ['files'], isolation: [] },
    },
  )
  if (placement.kind !== 'placement') throw new Error('expected a placement')
  const acquired = await first.acquire(
    { principal: 'subject', tenant: tenantA },
    {
      acquisition: acquisitionRef('kept'),
      origin: originRef('call-1'),
      scope: scope1,
      placement,
      ledger,
      guard: { authorize: async () => 'authorized' },
    },
  )
  expect(acquired.kind).toBe('acquired')
  const original: OriginalAcquisition = {
    tenant: tenantA,
    acquisition: acquisitionRef('kept'),
    origin: originRef('call-1'),
    scope: scope1,
    placement,
  }
  // The registry is lost; a new registry and a new generation join the same domain.
  const second = createEnvironmentRegistry<unknown>({ recovery, ...ports })
  second.registerFacility(filesFacility)
  second.registerProvider(createHostFilesProvider({ domain, drainBoundMs: 20 }))
  const access = createRecoveryAccess()
  expect(await second.inspectRecoveryAcquisition(access, original)).toEqual({
    kind: 'original',
    status: 'allocated',
    original,
    adoption: null,
  })
  const result = await second.recoverOwned(scope1, access, [original])
  if (result.kind !== 'recovered') throw new Error('expected a recovery')
  expect(result.settledAcquisitions).toEqual([{ original, outcome: 'settled' }])
  expect(result.unsupported).toEqual([])
  expect(result.unavailable).toEqual([])
  expect(await second.inspectRecoveryAcquisition(access, original)).toMatchObject({
    status: 'settled',
  })
})

it('keeps old use when the quota is lowered, and lets only one of two racing acquisitions take the last slot', async () => {
  let perTenant = 2
  const domain = createHostFilesDomain({ quota: () => ({ perTenant, global: 3 }) })
  const provider = createHostFilesProvider({ domain })
  await leaseOf(provider, inputFor(provider, 'a1'))
  await leaseOf(provider, inputFor(provider, 'a2'))
  perTenant = 1
  expect(await provider.acquire(inputFor(provider, 'a3'))).toEqual({
    kind: 'rejected',
    reason: 'quotaExceeded',
  })
  expect(await provider.quota(tenantA)).toEqual({
    kind: 'declared',
    quota: { unit: 'unsettled-acquisition', perTenant: 1, global: 3 },
  })
  const [b1, b2] = await Promise.all([
    provider.acquire(inputFor(provider, 'b1', tenantB)),
    provider.acquire(inputFor(provider, 'b2', tenantB)),
  ])
  expect([b1.kind, b2.kind].sort()).toEqual(['acquired', 'rejected'])
  // The global bound of three is now full: a third tenant waits on global capacity.
  const tenantC = tenantOf('acc_0123456789abcdefghjkmnpqrv')
  perTenant = 5
  expect(await provider.acquire(inputFor(provider, 'c1', tenantC))).toEqual({
    kind: 'rejected',
    reason: 'globalCapacityExceeded',
  })
})

it('answers unknown, never notAllocated, for a generation the domain never issued, and conflict for another description', async () => {
  const before = createHostFilesProvider({ domain: createHostFilesDomain() })
  const input = inputFor(before, 'from-another-process')
  await leaseOf(before, input)
  // A new process makes a new domain; it has no evidence that the old capacity was settled.
  const domain: HostFilesDomain = createHostFilesDomain()
  const after = createHostFilesProvider({ domain })
  expect(await after.inspectAcquisition(originalOf(input))).toEqual({ kind: 'unknown' })
  expect(await after.settleAcquisition(originalOf(input))).toEqual({ kind: 'unknown' })
  const own = inputFor(after, 'own')
  expect(await after.inspectAcquisition(originalOf(own))).toEqual({ kind: 'notAllocated' })
  await leaseOf(after, own)
  expect(
    await after.inspectAcquisition({ ...originalOf(own), origin: originRef('call-2') }),
  ).toEqual({ kind: 'conflict' })
  expect(await after.acquire({ ...own, origin: originRef('call-2') })).toEqual({
    kind: 'rejected',
    reason: 'acquisitionConflict',
  })
})

it('settles capacity after an unknown file result without rewriting the bytes', async () => {
  const domain = createHostFilesDomain()
  const provider = createHostFilesProvider({ domain })
  const file = await notes()
  const input = inputFor(provider, 'unknown-effect')
  const { files } = await leaseOf(provider, input)
  // The object behind the path is not the named one: the write is refused and nothing is written.
  const answer = await files.write({
    ...base(file.path, { token: 'stale:object' }, 'stale'),
    bytes: new TextEncoder().encode('never'),
    mode: 'replace',
  })
  expect(answer.kind).toBe('rejected')
  expect(await provider.settleAcquisition(originalOf(input))).toEqual({ kind: 'settled' })
  expect(await readFile(file.path, 'utf8')).toBe('before')
})

it('refuses to create a provider without a domain from this package', () => {
  expect(() => createHostFilesProvider(JSON.parse('{"domain":{"quotaDomain":"forged"}}'))).toThrow(
    TypeError,
  )
  expect(() => createHostFilesDomain({ quotaDomain: '' })).toThrow(RangeError)
})

// Real processes in systemd user scopes: only on Linux with OMNE_HOST_COMMAND_LINUX=1.
const withScopes = process.platform === 'linux' && process.env['OMNE_HOST_COMMAND_LINUX'] === '1'

async function activeState(unit: string): Promise<string> {
  const { stdout } = await promisify(execFile)('systemctl', [
    '--user',
    'show',
    '-p',
    'ActiveState',
    '--value',
    unit,
  ])
  return stdout.trim()
}

it(
  'stops the processes of the drained acquisition only, and settles it once their stop is confirmed',
  // Slow: starts real processes in systemd user scopes and waits for their stop.
  { tags: ['slow'], skip: !withScopes },
  async () => {
    const domain = createHostFilesDomain()
    const provider = createHostFilesProvider({ domain })
    // A scope of its own: recovery elsewhere on this host reaches every unit of a scope.
    const scope = scopeOf(`scope-domain-${String(Date.now())}-${String(process.pid)}`)
    const firstInput = { ...inputFor(provider, 'first'), scope }
    const first = await leaseOf(provider, firstInput)
    const second = await leaseOf(provider, { ...inputFor(provider, 'second'), scope })
    const start = async (lease: typeof first.lease, requestId: string) => {
      const command = lease.facility('command')
      if (command === undefined) throw new Error('expected the command facility')
      const answer = await command.start({
        requestId,
        access: { principal: 'subject', tenant: tenantA },
        origin: originRef('call-1'),
        binding: host,
        executable: '/bin/sleep',
        args: ['300'],
        cwd: '/',
        env: {},
        outputMode: 'separate',
      })
      if (answer.kind !== 'done') throw new Error(`expected a start: ${JSON.stringify(answer)}`)
      return answer.value
    }
    const stopped = await start(first.lease, 'first-sleep')
    const kept = await start(second.lease, 'second-sleep')
    try {
      expect(await first.lease.release()).toEqual({ kind: 'released' })
      expect(await stopped.result).toMatchObject({ kind: 'failed', reason: 'effectUnknown' })
      expect(await activeState(stopped.process.id)).toBe('inactive')
      expect(await activeState(kept.process.id)).toBe('active')
      expect(await provider.inspectAcquisition(originalOf(firstInput))).toEqual({
        kind: 'settled',
      })
    } finally {
      await kept.stop('forced')
      await provider.retire()
    }
  },
)

// The engine of an acquisition is reached through the domain internals, which the package entry
// does not export; these cases use the source modules, all of them one module instance.
const engineSealed = (record: SourceRecord) => {
  const files = record.engine.facilityFor(record.owner)
  return files.commitBatch({
    requestId: 'after-drain',
    access: { principal: 'subject', tenant: tenantA },
    origin: originRef('call-1'),
    binding: host,
    entries: [],
  })
}

function recordOf(domain: SourceDomain, input: ProviderAcquireInput): SourceRecord {
  const record = domainInternals(domain)?.find(originalOf(input))
  if (record === undefined) throw new Error('expected the record of the acquisition')
  return record
}

it('seals the engine of an acquisition when its drain begins, as it seals the facade', async () => {
  const domain = createSourceDomain()
  const provider = createSourceProvider({ domain })
  const input = inputFor(provider, 'sealed')
  const { lease } = await leaseOf(provider, input)
  const record = recordOf(domain, input)
  // Before the drain the engine admits batches: this one is refused for its content, not as closed.
  expect(await engineSealed(record)).not.toMatchObject({ reason: 'closed' })
  expect(await lease.release()).toEqual({ kind: 'released' })
  expect(await engineSealed(record)).toEqual({
    kind: 'rejected',
    requestId: 'after-drain',
    reason: 'closed',
  })
})

it('seals the engine of an acquisition when its provider retires', async () => {
  const domain = createSourceDomain()
  const provider = createSourceProvider({ domain })
  const input = inputFor(provider, 'retired')
  await leaseOf(provider, input)
  const record = recordOf(domain, input)
  expect(await provider.retire()).toEqual({ kind: 'drained' })
  expect(await engineSealed(record)).toMatchObject({ kind: 'rejected', reason: 'closed' })
})

it('gives providers of one files configuration one engine, and another configuration its own', async () => {
  const domain = createSourceDomain()
  const state = await realpath(await mkdtemp(join(tmpdir(), 'omne-host-engine-')))
  roots.push(state)
  const engineOf = async (options: Record<string, unknown>, key: string) => {
    const provider = createSourceProvider({ domain, ...options })
    const input = inputFor(provider, key)
    await leaseOf(provider, input)
    return recordOf(domain, input).engine
  }
  const plain = await engineOf({}, 'plain-1')
  expect(await engineOf({}, 'plain-2')).toBe(plain)
  const rooted = await engineOf({ filesRoot: state }, 'rooted-1')
  expect(rooted).not.toBe(plain)
  expect(await engineOf({ filesRoot: state }, 'rooted-2')).toBe(rooted)
  expect(rooted.hasRoot).toBe(true)
  expect(plain.hasRoot).toBe(false)
  expect(await engineOf({ filesRoot: state, limits: { listPageLimit: 5 } }, 'rooted-3')).not.toBe(
    rooted,
  )
})
