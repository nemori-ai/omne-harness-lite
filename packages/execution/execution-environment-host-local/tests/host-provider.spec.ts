// The host files provider: declared facts, acquisition answers, the ledger check through the
// registry gate, retirement and its drain, invalidation on retirement and release.
import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { release, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, expect, it, vi } from 'vitest'
import { createDomainIndex, domainReference } from '../src/macos-execution/domain-index.ts'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  acquisitionRef,
  filesFacility,
  originRef,
  type EnvironmentBinding,
  type EnvironmentLease,
  type FileSystemFacility,
  type ManagedResource,
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
import { createHostFilesDomain as createSourceDomain, domainInternals } from '../src/host-domain.ts'
import { createHostFilesProvider as createSourceProvider } from '../src/host-provider.ts'
import { readBootId, scopeDigest, scopeReference } from '../src/host-scope.ts'

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

const realPath = process.env['PATH']
const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform')

afterEach(async () => {
  control.failUnlink = false
  if (realPath === undefined) delete process.env['PATH']
  else process.env['PATH'] = realPath
  if (realPlatform) Object.defineProperty(process, 'platform', realPlatform)
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

it('declares the host facilities, no isolation, and platform resource recovery availability', async () => {
  const provider = createHostFilesProvider({ domain: createHostFilesDomain() })
  expect(provider).toMatchObject({
    name: 'host-files',
    bindingKinds: ['host_machine'],
    continuity: { kind: 'not_guaranteed' },
    facilities: ['files', 'command', 'terminal'],
    isolation: [],
  })
  expect(provider.generation).toMatch(/^[0-9a-f-]{36}$/)
  expect(createHostFilesProvider({ domain: createHostFilesDomain() }).generation).not.toBe(
    provider.generation,
  )
  expect(provider.quotaDomain).toBe('host-files')
  // Windows has no complete cold index; Linux needs a reachable user manager; macOS keeps its
  // index in the state directory, and this provider has none.
  const complete =
    process.platform === 'linux'
      ? await userManagerReachable()
      : process.platform !== 'win32' && process.platform !== 'darwin'
  expect(await provider.listRecoveryResources?.(scope1)).toEqual(
    complete ? { kind: 'listed', resources: [] } : { kind: 'unavailable' },
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
    facilities: ['files', 'command', 'terminal'],
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
  expect(acquired.lease.facility('terminal')).toBeDefined()
  // Linux runs each command in its own systemd scope, macOS in a POSIX session that setsid can
  // leave; the Windows backend declares nothing, which is not `sealed`.
  const declared: Readonly<Record<string, string>> = { linux: 'sealed', darwin: 'none' }
  expect(acquired.lease.facility('command')?.containment).toBe(declared[process.platform])
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

// The processes one-shot commands left behind: the provider reads their markers from its state
// directory and lists and stops them when the platform is Linux. The supervisor is a scripted
// `systemctl` first on PATH (`fixtures/scripted-systemctl.mjs`), with no `systemd-run` beside it, so
// the platform probe stops at its first prerequisite and no scope is ever started.
const scriptedSystemctl = fileURLToPath(
  new URL('./fixtures/scripted-systemctl.mjs', import.meta.url),
)

type Reply = { contains: string; code?: number; stdout?: string }

async function retentionHost(replies: readonly Reply[]) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'omne-retained-')))
  roots.push(base)
  const bin = join(base, 'bin')
  const state = join(base, 'state')
  await mkdir(bin)
  await mkdir(join(state, 'retained-processes'), { recursive: true })
  await writeFile(join(base, 'replies.json'), JSON.stringify(replies))
  const path = join(bin, 'systemctl')
  await writeFile(
    path,
    `#!/bin/sh\nSCRIPT_DIR='${base}' exec '${process.execPath}' '${scriptedSystemctl}' "$@"\n`,
  )
  await chmod(path, 0o755)
  process.env['PATH'] = bin
  return {
    state,
    markers: () => readdir(join(state, 'retained-processes')),
    calls: async (): Promise<string[][]> =>
      (await readFile(join(base, 'calls.log'), 'utf8').catch(() => ''))
        .split('\n')
        .filter(Boolean)
        .map((line): string[] => JSON.parse(line)),
  }
}

const retainedKey = '5b1d2c3e-4f50-4a61-8b72-93c4d5e6f708'
const otherKey = '6c2e3d4f-5061-4b72-9c83-a4d5e6f70819'
const foreignKey = '7d3f4e50-6172-4c83-8d94-b5e6f708192a'
const unitOf = (key: string) => `omne-host-${key}.scope`
const memberShow = (key: string) =>
  `show -p LoadState -p ActiveState -p ControlGroup ${unitOf(key)}`
const stateShow = (key: string) => `show -p LoadState -p ActiveState ${unitOf(key)}`
const activeUnit = (key: string): Reply => ({
  contains: memberShow(key),
  stdout: 'LoadState=loaded\nActiveState=active\nControlGroup=\n',
})

async function writeMarker(
  state: string,
  key: string,
  scope: ScopeRef,
  bootId: string,
): Promise<void> {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('tenant fixture did not encode')
  await writeFile(
    join(state, 'retained-processes', `${key}.json`),
    JSON.stringify({
      version: 1,
      key,
      scope: scopeDigest(scope),
      tenant: encoded.value,
      unit: unitOf(key),
      bootId,
      origin: 'call-1',
      generation: 'earlier-generation',
      handedOverAtMs: 0,
      gatePid: null,
    }),
  )
}

async function currentBoot(): Promise<string> {
  const bootId = await readBootId()
  if (bootId === undefined) throw new Error('this host gives no boot identity')
  return bootId
}

function retainedProvider(
  state: string | undefined,
  diagnose?: (d: HostFilesDiagnostic) => void,
  stopBoundMs = 5_000,
) {
  return createSourceProvider({
    domain: createSourceDomain(),
    ...(state === undefined ? {} : { stateDirectory: state }),
    // The probe never retries into the real tools. Each supervisor call starts a process, so the bound is wide.
    command: { probeRetryMs: 3_600_000, stopBoundMs },
    ...(diagnose === undefined ? {} : { diagnose }),
  })
}

onLinux('lists the retained processes of its state directory for their scope only', async () => {
  const bootId = await currentBoot()
  const host = await retentionHost([activeUnit(retainedKey), activeUnit(otherKey)])
  await writeMarker(host.state, retainedKey, scope1, bootId)
  await writeMarker(host.state, otherKey, scopeOf('scope-2'), bootId)
  const provider = retainedProvider(host.state)
  try {
    expect(await provider.listRecoveryResources?.(scope1)).toEqual({
      kind: 'listed',
      resources: [
        {
          key: retainedKey,
          provider: 'host-files',
          reference: scopeReference({ unit: unitOf(retainedKey), bootId }),
        },
      ],
    })
    // The index read each unit through the provider's supervisor, with its control group path.
    expect(await host.calls()).toContainEqual([
      '--user',
      'show',
      '-p',
      'LoadState',
      '-p',
      'ActiveState',
      '-p',
      'ControlGroup',
      unitOf(retainedKey),
    ])
  } finally {
    await provider.retire?.()
  }
})

onLinux(
  'observes the retained processes of one scope and tenant, retired or not: the index stays with the state directory',
  async () => {
    const bootId = await currentBoot()
    const host = await retentionHost([activeUnit(retainedKey), activeUnit(otherKey)])
    await writeMarker(host.state, retainedKey, scope1, bootId)
    await writeMarker(host.state, otherKey, scopeOf('scope-2'), bootId)
    const provider = retainedProvider(host.state)
    const parsed = tenantCodec.parse(
      JSON.stringify({
        organization: 'org_0123456789abcdefghjkmnpqrs',
        account: 'acc_1123456789abcdefghjkmnpqrs',
      }),
    )
    if (!parsed.ok) throw new Error('tenant fixture did not parse')
    let observed: Awaited<ReturnType<NonNullable<typeof provider.retainedProcesses>>> | undefined
    try {
      observed = await provider.retainedProcesses?.(scope1, tenant)
      expect(observed).toMatchObject([
        {
          process: { id: retainedKey, generation: 'earlier-generation' },
          origin: 'call-1',
          state: 'running',
        },
      ])
      expect(observed).toHaveLength(1)
      expect(await provider.retainedProcesses?.(scope1, parsed.value)).toEqual([])
    } finally {
      await provider.retire?.()
    }
    // Retirement only stops this generation's polling: the retained processes stay with their
    // scopes, and a retired generation still answers the index's reading, never an empty list
    // while the index holds the process.
    expect(await provider.retainedProcesses?.(scope1, tenant)).toEqual(observed)
  },
)

onLinux('observes nothing when the index cannot read its markers, not an empty list', async () => {
  const host = await retentionHost([])
  await writeMarker(host.state, retainedKey, scope1, await currentBoot())
  process.env['PATH'] = join(host.state, 'no-tools-here')
  const provider = retainedProvider(host.state)
  try {
    expect(await provider.retainedProcesses?.(scope1, tenant)).toBe('unavailable')
  } finally {
    await provider.retire?.()
  }
})

onLinux('keeps no retained-process index without a state directory', async () => {
  const host = await retentionHost([activeUnit(retainedKey)])
  await writeMarker(host.state, retainedKey, scope1, await currentBoot())
  const domain = createSourceDomain()
  const internals = domainInternals(domain)
  if (internals === undefined) throw new Error('missing domain internals')
  const requested: string[] = []
  const original = internals.retainedProcesses
  vi.spyOn(internals, 'retainedProcesses').mockImplementation((stateDirectory, make) => {
    requested.push(stateDirectory)
    return original(stateDirectory, make)
  })
  const without = createSourceProvider({ domain, command: { probeRetryMs: 3_600_000 } })
  expect(requested).toEqual([])
  const withState = createSourceProvider({
    domain,
    stateDirectory: host.state,
    command: { probeRetryMs: 3_600_000 },
  })
  expect(requested).toEqual([host.state])
  try {
    // Nothing is retained without a state directory, so the marker on disk is not read for it.
    expect(await without.listRecoveryResources?.(scope1)).toEqual({ kind: 'listed', resources: [] })
    expect(await host.calls()).not.toContainEqual(expect.arrayContaining([unitOf(retainedKey)]))
  } finally {
    await without.retire?.()
    await withState.retire?.()
  }
})

it('keeps no retained-process index where the platform is not Linux', async () => {
  const host = await retentionHost([])
  const domain = createSourceDomain()
  const internals = domainInternals(domain)
  if (internals === undefined) throw new Error('missing domain internals')
  const requested: string[] = []
  const original = internals.retainedProcesses
  vi.spyOn(internals, 'retainedProcesses').mockImplementation((stateDirectory, make) => {
    requested.push(stateDirectory)
    return original(stateDirectory, make)
  })
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
  const provider = createSourceProvider({
    domain,
    stateDirectory: host.state,
    command: { probeRetryMs: 3_600_000 },
  })
  expect(requested).toEqual([])
  await provider.retire?.()
})

it('lists only the retained terminals where the platform is not Linux, without asking the supervisor', async () => {
  const host = await retentionHost([])
  const provider = createSourceProvider({
    domain: createSourceDomain(),
    stateDirectory: host.state,
    command: { probeRetryMs: 3_600_000 },
  })
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
  expect(await provider.listRecoveryResources?.(scope1)).toEqual({ kind: 'listed', resources: [] })
  expect(await host.calls()).toEqual([])
  Object.defineProperty(process, 'platform', realPlatform ?? { value: 'linux' })
  await provider.retire?.()
})

onLinux(
  'lists nothing when a retained-process marker cannot be read, not an empty list',
  async () => {
    const bootId = await currentBoot()
    const host = await retentionHost([{ contains: memberShow(retainedKey), code: 1 }])
    await writeMarker(host.state, retainedKey, scope1, bootId)
    const provider = retainedProvider(host.state)
    try {
      expect(await provider.listRecoveryResources?.(scope1)).toEqual({ kind: 'unavailable' })
      // The supervisor listing is not consulted once the markers are known to be incomplete.
      expect(await host.calls()).not.toContainEqual(expect.arrayContaining(['Description']))
    } finally {
      await provider.retire?.()
    }
  },
)

onLinux('reports a marker of an earlier boot as discarded and lists nothing for it', async () => {
  const host = await retentionHost([])
  await writeMarker(host.state, retainedKey, scope1, 'a-boot-that-is-over')
  const seen: HostFilesDiagnostic[] = []
  const provider = retainedProvider(host.state, diagnostic => seen.push(diagnostic))
  try {
    expect(await provider.listRecoveryResources?.(scope1)).toEqual({
      kind: 'listed',
      resources: [],
    })
    expect(seen).toEqual([
      {
        kind: 'retainedMarker',
        provider: 'host-files',
        generation: provider.generation,
        key: retainedKey,
        unit: unitOf(retainedKey),
        issue: 'discarded',
      },
    ])
    expect(await host.markers()).toEqual([])
  } finally {
    await provider.retire?.()
  }
})

onLinux(
  'stops a listed retained process on recovery and answers confirmedStopped once the supervisor confirms',
  async () => {
    const bootId = await currentBoot()
    const host = await retentionHost([
      activeUnit(retainedKey),
      { contains: stateShow(retainedKey), stdout: 'LoadState=loaded\nActiveState=inactive\n' },
    ])
    await writeMarker(host.state, retainedKey, scope1, bootId)
    const provider = retainedProvider(host.state)
    try {
      const listed = await provider.listRecoveryResources?.(scope1)
      if (listed?.kind !== 'listed')
        throw new Error(`expected a listing: ${JSON.stringify(listed)}`)
      const [resource] = listed.resources
      if (resource === undefined) throw new Error('expected the retained process')
      expect(await provider.recover?.(resource)).toEqual({
        status: 'confirmedStopped',
        evidence: null,
      })
      expect(await host.calls()).toContainEqual(
        expect.arrayContaining(['kill', unitOf(retainedKey)]),
      )
      // The stop is the index's: it removed the marker, so no later reading lists the process again.
      expect(await host.markers()).toEqual([])
      expect(await provider.listRecoveryResources?.(scope1)).toEqual({
        kind: 'listed',
        resources: [],
      })
    } finally {
      await provider.retire?.()
    }
  },
)

onLinux(
  'answers pending, and keeps the marker, when the supervisor does not confirm the stop',
  async () => {
    const bootId = await currentBoot()
    const host = await retentionHost([
      activeUnit(retainedKey),
      { contains: stateShow(retainedKey), stdout: 'LoadState=loaded\nActiveState=deactivating\n' },
    ])
    await writeMarker(host.state, retainedKey, scope1, bootId)
    const provider = retainedProvider(host.state, undefined, 1_000)
    try {
      const listed = await provider.listRecoveryResources?.(scope1)
      if (listed?.kind !== 'listed')
        throw new Error(`expected a listing: ${JSON.stringify(listed)}`)
      const [resource] = listed.resources
      if (resource === undefined) throw new Error('expected the retained process')
      expect(await provider.recover?.(resource)).toEqual({ status: 'pending', evidence: null })
      expect(await host.markers()).toEqual([`${retainedKey}.json`])
    } finally {
      await provider.retire?.()
    }
  },
)

onLinux('does not treat a resource the index never held as a retained process', async () => {
  const host = await retentionHost([activeUnit(retainedKey)])
  await writeMarker(host.state, retainedKey, scope1, await currentBoot())
  const provider = retainedProvider(host.state)
  try {
    expect(
      await provider.recover?.({ key: 'r', provider: 'host-files', reference: { kind: 'null' } }),
    ).toEqual({ status: 'unsupported', evidence: null })
  } finally {
    await provider.retire?.()
  }
})

const shellA: ManagedResource = {
  key: 'shell-a',
  provider: 'host-files',
  reference: { kind: 'null' },
}
const shellB: ManagedResource = {
  key: 'shell-b',
  provider: 'host-files',
  reference: { kind: 'null' },
}

/** Puts a retained-terminal index in the domain that lists what the test says and recovers as told. */
function withRetainedTerminals(
  domain: ReturnType<typeof createSourceDomain>,
  answers: {
    listings: readonly (readonly ManagedResource[])[]
    recovered?: 'confirmed' | 'unconfirmed'
  },
) {
  const internals = domainInternals(domain)
  if (internals === undefined) throw new Error('missing domain internals')
  let listing = 0
  const asked: ManagedResource[] = []
  // The index of the domain is a frozen object: the domain keeps a stand-in that lists and recovers as told.
  Reflect.set(internals, 'retainedTerminals', {
    ...internals.retainedTerminals,
    resources: (): readonly ManagedResource[] =>
      answers.listings[Math.min(listing++, answers.listings.length - 1)] ?? [],
    recover: async (resource: ManagedResource) => {
      asked.push(resource)
      return resource.key.startsWith('shell-') ? answers.recovered : undefined
    },
  })
  return asked
}

onLinux(
  'lists the retained terminals with the retained processes, one resource per key, also one that arrived during the listing',
  async () => {
    const bootId = await currentBoot()
    const host = await retentionHost([activeUnit(retainedKey)])
    await writeMarker(host.state, retainedKey, scope1, bootId)
    const domain = createSourceDomain()
    // The first reading names shell-a; the reading after the supervisor listing names shell-b only: both are listed.
    withRetainedTerminals(domain, { listings: [[shellA], [shellB]] })
    const provider = createSourceProvider({
      domain,
      stateDirectory: host.state,
      command: { probeRetryMs: 3_600_000 },
    })
    try {
      const listed = await provider.listRecoveryResources?.(scope1)
      if (listed?.kind !== 'listed')
        throw new Error(`expected a listing: ${JSON.stringify(listed)}`)
      expect(listed.resources.map(resource => resource.key).sort()).toEqual(
        [retainedKey, 'shell-a', 'shell-b'].sort(),
      )
    } finally {
      await provider.retire?.()
    }
  },
)

it('lists the retained terminals where the platform is neither Linux, macOS nor Windows', async () => {
  await retentionHost([])
  const domain = createSourceDomain()
  withRetainedTerminals(domain, { listings: [[shellA]] })
  Object.defineProperty(process, 'platform', { value: 'freebsd', configurable: true })
  const provider = createSourceProvider({ domain, command: { probeRetryMs: 3_600_000 } })
  expect(await provider.listRecoveryResources?.(scope1)).toEqual({
    kind: 'listed',
    resources: [shellA],
  })
  await provider.retire?.()
})

it('on macOS answers unavailable without a state directory: there is no cold index', async () => {
  await retentionHost([])
  const domain = createSourceDomain()
  withRetainedTerminals(domain, { listings: [[shellA]] })
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
  const provider = createSourceProvider({ domain, command: { probeRetryMs: 3_600_000 } })
  expect(await provider.listRecoveryResources?.(scope1)).toEqual({ kind: 'unavailable' })
  await provider.retire?.()
})

it('on macOS lists the marked domains of the scope with the retained terminals', async () => {
  const host = await retentionHost([])
  const domain = createSourceDomain()
  withRetainedTerminals(domain, { listings: [[shellA]] })
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
  const provider = createSourceProvider({
    domain,
    stateDirectory: host.state,
    command: { probeRetryMs: 3_600_000 },
  })
  const boot = 'B6C8C544-54F8-4C43-967D-A47FD7BEBA7D'
  const marked: ManagedResource = {
    key: retainedKey,
    provider: provider.name,
    reference: domainReference(retainedKey, boot, scope1),
  }
  const index = createDomainIndex(host.state)
  const coordinate = { bootId: boot, sessions: [{ sid: 400, start: '1.000001' }] }
  expect(await index.record(marked, scope1, coordinate)).toBe(true)
  const elsewhere = {
    ...marked,
    key: otherKey,
    reference: domainReference(otherKey, boot, scopeOf('scope-2')),
  }
  expect(await index.record(elsewhere, scopeOf('scope-2'), coordinate)).toBe(true)
  expect(await provider.listRecoveryResources?.(scope1)).toEqual({
    kind: 'listed',
    resources: [marked, shellA],
  })
  await writeFile(join(host.state, 'macos-domains', `${foreignKey}.json`), 'torn')
  expect(await provider.listRecoveryResources?.(scope1)).toEqual({ kind: 'unavailable' })
  expect(await host.calls()).toEqual([])
  await provider.retire?.()
})

onLinux('lists nothing when the supervisor cannot be found, not an empty list', async () => {
  const host = await retentionHost([])
  process.env['PATH'] = join(host.state, 'no-tools-here')
  const provider = retainedProvider(host.state)
  try {
    expect(await provider.listRecoveryResources?.(scope1)).toEqual({ kind: 'unavailable' })
  } finally {
    await provider.retire?.()
  }
})

onLinux('keeps a retained process pending while no supervisor can be found', async () => {
  const bootId = await currentBoot()
  const host = await retentionHost([activeUnit(retainedKey)])
  await writeMarker(host.state, retainedKey, scope1, bootId)
  process.env['PATH'] = join(host.state, 'no-tools-here')
  const provider = retainedProvider(host.state)
  try {
    const resource: ManagedResource = {
      key: retainedKey,
      provider: 'host-files',
      reference: scopeReference({ unit: unitOf(retainedKey), bootId }),
    }
    // The index cannot read its markers without the supervisor, so it does not hold the resource;
    // the generic stop cannot reach the supervisor either: nothing is confirmed.
    expect(await provider.recover?.(resource)).toEqual({ status: 'pending', evidence: null })
    expect(await host.markers()).toEqual([`${retainedKey}.json`])
  } finally {
    await provider.retire?.()
  }
})

it.each([
  ['confirmed', 'confirmedStopped'],
  ['unconfirmed', 'pending'],
] as const)('answers %s from a retained terminal as %s on recovery', async (stop, status) => {
  await retentionHost([])
  const domain = createSourceDomain()
  const asked = withRetainedTerminals(domain, { listings: [[shellA]], recovered: stop })
  const provider = createSourceProvider({ domain, command: { probeRetryMs: 3_600_000 } })
  try {
    expect(await provider.recover?.(shellA)).toEqual({ status, evidence: null })
    expect(asked).toEqual([shellA])
  } finally {
    await provider.retire?.()
  }
})

const listUnits = 'show -p Id -p Description omne-host-*.scope'

onLinux(
  'lists nothing when the supervisor listing of scopes fails, not an empty list',
  async () => {
    const host = await retentionHost([{ contains: listUnits, code: 1 }])
    const provider = retainedProvider(host.state)
    try {
      expect(await provider.listRecoveryResources?.(scope1)).toEqual({ kind: 'unavailable' })
    } finally {
      await provider.retire?.()
    }
  },
)

onLinux(
  'lists the scopes the supervisor knows for the scope next to the retained processes',
  async () => {
    const bootId = await currentBoot()
    const block = (key: string, owner: ScopeRef) =>
      `Id=${unitOf(key)}\nDescription=omne-host ${scopeDigest(owner)} ${key}\n`
    const host = await retentionHost([
      activeUnit(retainedKey),
      {
        contains: listUnits,
        stdout: `${block(otherKey, scope1)}\n${block(foreignKey, scopeOf('scope-2'))}`,
      },
    ])
    await writeMarker(host.state, retainedKey, scope1, bootId)
    const provider = retainedProvider(host.state)
    try {
      const listed = await provider.listRecoveryResources?.(scope1)
      if (listed?.kind !== 'listed')
        throw new Error(`expected a listing: ${JSON.stringify(listed)}`)
      expect(listed.resources.map(resource => resource.key).sort()).toEqual(
        [retainedKey, otherKey].sort(),
      )
    } finally {
      await provider.retire?.()
    }
  },
)
