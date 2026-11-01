// The host files provider: declared facts, acquisition answers, the ledger check through the
// registry gate, retirement and its drain, invalidation on retirement and release.
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { release, tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, expect, it, vi } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  acquisitionRef,
  filesFacility,
  originRef,
  type EnvironmentBinding,
  type EnvironmentLease,
  type FileSystemFacility,
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
  type HostFilesDiagnostic,
} from '@omne-harness/execution-environment-host-local'
import manifest from '../package.json' with { type: 'json' }

const packageVersion = manifest.version

// One test control under `node:fs/promises`: while `failUnlink` is set, removing a staged batch file
// fails with `EIO`. Every other call, and all bytes, links and descriptors, are real.
const control = vi.hoisted(() => ({ failUnlink: false }))

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    async unlink(...args: Parameters<typeof actual.unlink>) {
      if (control.failUnlink && String(args[0]).includes('.omne-batch-'))
        throw Object.assign(new Error('injected EIO'), { code: 'EIO' })
      return actual.unlink(...args)
    },
  }
})

const roots: string[] = []

afterEach(async () => {
  control.failUnlink = false
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

const execFileAsync = promisify(execFile)

/** Whether a systemd user manager answers on this host, read the way the platform probe reads it. */
async function userManagerReachable(): Promise<boolean> {
  if (process.platform !== 'linux') return false
  const answer = await execFileAsync('systemctl', ['--user', 'is-system-running']).then(
    ({ stdout }) => stdout,
    (error: { stdout?: unknown }) => (typeof error.stdout === 'string' ? error.stdout : ''),
  )
  return ['running', 'degraded'].includes(answer.trim())
}

/** Resolves to `pending` when the promise has not settled after the queued callbacks ran. */
async function settledOrPending<T>(promise: Promise<T>): Promise<T | 'pending'> {
  return Promise.race([
    promise,
    new Promise<'pending'>(resolve => setTimeout(resolve, 20, 'pending')),
  ])
}

it('declares the host layer, the files and command keys, no isolation, and an empty resource recovery', async () => {
  const provider = createHostFilesProvider({ domain: createHostFilesDomain() })
  expect(provider).toMatchObject({
    name: 'host-files',
    bindingKinds: ['host_machine'],
    continuity: { kind: 'not_guaranteed' },
    facilities: ['files', 'command'],
    isolation: [],
  })
  expect(provider.generation).toMatch(/^[0-9a-f-]{36}$/)
  expect(createHostFilesProvider({ domain: createHostFilesDomain() }).generation).not.toBe(
    provider.generation,
  )
  expect(provider.quotaDomain).toBe('host-files')
  // The command scopes are listed through the user manager; a Linux host without one cannot list.
  expect(await provider.listRecoveryResources?.(scope1)).toEqual(
    (await userManagerReachable()) || process.platform !== 'linux'
      ? { kind: 'listed', resources: [] }
      : { kind: 'unavailable' },
  )
  expect(
    await provider.recover?.({ key: 'r', provider: 'host-files', reference: { kind: 'null' } }),
  ).toEqual({ status: 'unsupported', evidence: null })
  expect(provider.version).toBe(packageVersion)
  const facts = await provider.describe()
  expect(facts).toEqual({
    provider: 'host-files',
    generation: provider.generation,
    version: packageVersion,
    platform: { os: process.platform, release: release() },
    facilities: ['files', 'command'],
    isolation: [],
    prerequisites: facts.prerequisites,
  })
  // The probe of the command prerequisites decides this value; host-probe.spec.ts reads it.
  expect(['satisfied', 'unsatisfied', 'unknown']).toContain(facts.prerequisites)
})

it('hands out a host lease with its own identity and evidence, and the files and command facilities', async () => {
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
  expect(acquired.lease.facility('command')).toBeDefined()
  expect(acquired.lease.facility('terminal')).toBeUndefined()
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

function recordingLedger(plans: unknown[]): ResourceLedger {
  return {
    closed: new AbortController().signal,
    plan: async resource => {
      plans.push(resource)
      return 'recorded'
    },
    permit: async () => 'confirmed',
    adopt: async () => 'confirmed',
    stopped: async () => 'recorded',
  }
}

function startRequest(requestId: string, overrides: Record<string, unknown> = {}) {
  return {
    requestId,
    access: { principal: 'subject-a', tenant },
    origin: originRef('call-1'),
    binding: host,
    executable: '/bin/sh',
    args: ['-c', 'exit 0'],
    cwd: '/',
    env: { PATH: '/usr/bin:/bin' },
    outputMode: 'separate' as const,
    ...overrides,
  }
}

it('refuses the terminal mode and a geometry as unsupported, before any resource is planned', async () => {
  const plans: unknown[] = []
  const provider = createHostFilesProvider({ domain: createHostFilesDomain() })
  const input = { ...inputFor(provider), ledger: recordingLedger(plans) }
  const command = (await leaseOf(provider, input)).facility('command')
  if (command === undefined) throw new Error('expected the command facility')
  expect(await command.start(startRequest('t1', { outputMode: 'terminal' }))).toEqual({
    kind: 'rejected',
    requestId: 't1',
    reason: 'unsupported',
  })
  expect(await command.start(startRequest('t2', { geometry: { columns: 80, rows: 24 } }))).toEqual({
    kind: 'rejected',
    requestId: 't2',
    reason: 'unsupported',
  })
  expect(
    await command.start(startRequest('t3', { binding: { kind: 'tenant_sandbox', tenant } })),
  ).toEqual({ kind: 'rejected', requestId: 't3', reason: 'unsupported' })
  expect(plans).toEqual([])
})

it('refuses a relative executable or working directory and a NUL in the environment as invalid input', async () => {
  const plans: unknown[] = []
  const provider = createHostFilesProvider({ domain: createHostFilesDomain() })
  const input = { ...inputFor(provider), ledger: recordingLedger(plans) }
  const command = (await leaseOf(provider, input)).facility('command')
  if (command === undefined) throw new Error('expected the command facility')
  const invalid = [
    startRequest('i1', { executable: 'sh' }),
    startRequest('i2', { cwd: 'relative/dir' }),
    startRequest('i3', { env: { 'A\u0000B': '1' } }),
    startRequest('i4', { env: { A: 'x\u0000y' } }),
    startRequest('i5', { args: ['-c', 'echo a\u0000b'] }),
  ]
  for (const request of invalid)
    expect(await command.start(request)).toEqual({
      kind: 'rejected',
      requestId: request.requestId,
      reason: 'invalidInput',
    })
  expect(plans).toEqual([])
})

it('refuses a command option that is not a bound of its kind', () => {
  const domain = createHostFilesDomain()
  for (const command of [
    { maxBufferedBytes: 0 },
    { maxChunkBytes: 1.5 },
    { maxChunkBytes: 2048, maxBufferedBytes: 1024 },
    { graceMs: -1 },
    { stopBoundMs: Number.POSITIVE_INFINITY },
    { startBoundMs: Number.NaN },
    { probeRetryMs: -5 },
  ])
    expect(() => createHostFilesProvider({ domain, command }), JSON.stringify(command)).toThrow(
      RangeError,
    )
})

// The files side of the provider. The host files root, the state directory, the bounds of listing
// and the batch diagnostic given to the provider reach the engine that serves its acquisitions.
// They need `/proc/self/fd` and a POSIX file system, so those cases are skipped elsewhere.
const onLinux = it.skipIf(process.platform !== 'linux')

async function rootedTree() {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'omne-exec-root-')))
  roots.push(base)
  const root = join(base, 'root')
  const outside = join(base, 'outside')
  const state = join(base, 'state')
  for (const directory of [root, outside, state]) await mkdir(directory)
  const inside = join(root, 'inside.txt')
  const secret = join(outside, 'secret.txt')
  await writeFile(inside, 'inside')
  await writeFile(secret, 'secret')
  return {
    root,
    state,
    inside,
    secret,
    insideToken: await hostObjectToken(inside),
    secretToken: await hostObjectToken(secret),
    rootToken: await hostObjectToken(root),
  }
}

type RootedTree = Awaited<ReturnType<typeof rootedTree>>

function readRequest(path: string, named: ObjectToken, requestId: string) {
  return {
    requestId,
    access: { principal: 'subject-a', tenant },
    origin: originRef('call-1'),
    binding: host,
    path,
    named,
  }
}

async function filesOf(provider: ReturnType<typeof createHostFilesProvider>, key = 'acq-1') {
  const files = (await leaseOf(provider, inputFor(provider, undefined, host, key))).facility(
    'files',
  )
  if (files === undefined) throw new Error('expected files')
  return files
}

onLinux('refuses a path outside the configured files root and serves one inside', async () => {
  const tree = await rootedTree()
  const provider = createHostFilesProvider({
    domain: createHostFilesDomain(),
    filesRoot: tree.root,
  })
  const files = await filesOf(provider)
  expect(await files.read(readRequest(tree.inside, tree.insideToken, 'in'))).toMatchObject({
    kind: 'done',
    requestId: 'in',
  })
  expect(await files.read(readRequest(tree.secret, tree.secretToken, 'out'))).toEqual({
    kind: 'rejected',
    requestId: 'out',
    reason: 'notAuthorized',
  })
})

it('serves a path anywhere when no files root is configured', async () => {
  const tree = await rootedTree()
  const files = await filesOf(createHostFilesProvider({ domain: createHostFilesDomain() }))
  expect(await files.read(readRequest(tree.secret, tree.secretToken, 'any'))).toMatchObject({
    kind: 'done',
    requestId: 'any',
  })
})

it('writes whether a files root is configured into the evidence of its acquisitions', async () => {
  const tree = await rootedTree()
  const entries = async (options: { filesRoot?: string }) => {
    const provider = createHostFilesProvider({ domain: createHostFilesDomain(), ...options })
    const acquired = await provider.acquire(inputFor(provider))
    if (acquired.kind !== 'acquired' || acquired.evidence.kind !== 'object')
      throw new Error('expected object evidence')
    return acquired.evidence.entries.map(entry => entry.key)
  }
  expect(await entries({})).toEqual(['provider', 'generation', 'version'])
  expect(await entries({ filesRoot: tree.root })).toEqual([
    'provider',
    'generation',
    'version',
    'filesRoot',
  ])
})

onLinux('takes the listing bounds from the provider options', async () => {
  const tree = await rootedTree()
  const provider = createHostFilesProvider({
    domain: createHostFilesDomain(),
    limits: { listPageLimit: 2 },
  })
  const files = await filesOf(provider)
  const list = (limit: number) =>
    files.list({ ...readRequest(tree.root, tree.rootToken, `l${limit}`), limit })
  expect(await list(3)).toMatchObject({ kind: 'rejected', reason: 'invalidInput' })
  expect(await list(2)).toMatchObject({ kind: 'done' })
})

it('refuses a files option that is not an absolute path or a positive bound', () => {
  const domain = createHostFilesDomain()
  expect(() => createHostFilesProvider({ domain, filesRoot: 'relative/root' })).toThrow(TypeError)
  expect(() => createHostFilesProvider({ domain, stateDirectory: 'relative/state' })).toThrow(
    TypeError,
  )
  expect(() => createHostFilesProvider({ domain, limits: { searchByteBudget: 0 } })).toThrow(
    RangeError,
  )
})

function batchRequest(tree: RootedTree, name: string) {
  return {
    ...readRequest(tree.root, tree.rootToken, `batch-${name}`),
    entries: [
      {
        path: join(tree.root, name),
        named: tree.rootToken,
        bytes: new TextEncoder().encode(name),
        expectedVersion: null,
      },
    ],
  }
}

function committedBatch(result: Awaited<ReturnType<FileSystemFacility<unknown>['commitBatch']>>) {
  if (result.kind !== 'done' || result.value.kind !== 'committed')
    throw new Error(`expected a committed batch: ${JSON.stringify(result)}`)
  return result.value
}

onLinux('reports the staged file a published batch leaves to the provider diagnostic', async () => {
  const tree = await rootedTree()
  const seen: HostFilesDiagnostic[] = []
  const provider = createHostFilesProvider({
    domain: createHostFilesDomain(),
    stateDirectory: tree.state,
    diagnose: diagnostic => seen.push(diagnostic),
  })
  const files = await filesOf(provider)
  control.failUnlink = true
  const outcome = committedBatch(await files.commitBatch(batchRequest(tree, 'one.txt')))
  expect(seen).toEqual([
    {
      kind: 'temporaryFileRemains',
      provider: 'host-files',
      generation: provider.generation,
      batch: outcome.batch.id,
      path: join(tree.root, 'one.txt'),
      temporary: `.omne-batch-${outcome.batch.id}-0`,
      code: 'EIO',
    },
  ])
})

onLinux('does not let a failing provider diagnostic change a published batch', async () => {
  const tree = await rootedTree()
  const provider = createHostFilesProvider({
    domain: createHostFilesDomain(),
    stateDirectory: tree.state,
    diagnose: () => {
      throw new Error('sink failed')
    },
  })
  const files = await filesOf(provider)
  control.failUnlink = true
  committedBatch(await files.commitBatch(batchRequest(tree, 'one.txt')))
})

onLinux(
  'gives a batch diagnostic to every live provider of one configuration, not to a retired one',
  async () => {
    const tree = await rootedTree()
    const domain = createHostFilesDomain()
    const first: HostFilesDiagnostic[] = []
    const second: HostFilesDiagnostic[] = []
    const options = { domain, stateDirectory: tree.state }
    const older = createHostFilesProvider({ ...options, diagnose: d => first.push(d) })
    const newer = createHostFilesProvider({ ...options, diagnose: d => second.push(d) })
    const files = await filesOf(newer)
    control.failUnlink = true
    committedBatch(await files.commitBatch(batchRequest(tree, 'one.txt')))
    expect([first.length, second.length]).toEqual([1, 1])
    expect(await older.retire()).toEqual({ kind: 'drained' })
    committedBatch(await files.commitBatch(batchRequest(tree, 'two.txt')))
    expect([first.length, second.length]).toEqual([1, 2])
  },
)

it('merges the files prerequisite into the prerequisites it describes', async ({ skip }) => {
  const tree = await rootedTree()
  const settled = async (provider: ReturnType<typeof createHostFilesProvider>) => {
    for (let attempt = 0; attempt < 200; attempt++) {
      const { prerequisites } = await provider.describe()
      if (prerequisites !== 'unknown') return prerequisites
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    return 'unknown'
  }
  const sound = createHostFilesProvider({
    domain: createHostFilesDomain(),
    stateDirectory: tree.state,
  })
  // Only a host where the command prerequisites are satisfied shows what the files side adds.
  skip((await settled(sound)) !== 'satisfied')
  const broken = createHostFilesProvider({
    domain: createHostFilesDomain(),
    stateDirectory: join(tree.state, 'missing', 'below'),
  })
  // Listing the recovery resources waits for this provider's own command probe to answer.
  await broken.listRecoveryResources?.(scope1)
  expect((await broken.describe()).prerequisites).toBe('unknown')
})
