import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, type Message } from '@deepseek-ai/cordis'
import { afterEach, expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  acquisitionRef,
  createRecoveryAccess,
  filesFacility,
  originRef,
  type Access,
  type EnvironmentBinding,
  type EnvironmentProvider,
  type EnvironmentRequirement,
  type FacilityGuard,
  type ManagedResource,
  type RecoveryAuthority,
  type ResourceLedger,
} from '@omne-harness/execution-environment-contract'
import {
  ExecutionRecoveryAuthorityService,
  executionEnvironmentKey,
} from '@omne-harness/execution-environment-cordis-contract/cordis'
import {
  createHostFilesDomain,
  hostObjectToken,
} from '@omne-harness/execution-environment-host-local'
import {
  ExecutionEnvironmentRegistry,
  commandFacilityPlugin,
  createHostFilesPlugin,
  filesFacilityPlugin,
} from '@omne-harness/execution-environment-host-local/cordis'
import { testPorts } from './ports.ts'

/** A host files plugin over a fresh domain, as an assembly root would create once. */
function hostPlugin() {
  return createHostFilesPlugin(createHostFilesDomain())
}

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

const access: Access<unknown> = { principal: 'subject-a', tenant }
const host: EnvironmentBinding = { kind: 'host_machine' }
const ledger: ResourceLedger = {
  closed: new AbortController().signal,
  plan: async () => 'recorded',
  permit: async () => 'confirmed',
  adopt: async () => 'confirmed',
  stopped: async () => 'recorded',
}
const allow: FacilityGuard<unknown> = { authorize: async () => 'authorized' }

type ScopeRef = Extract<EnvironmentBinding, { kind: 'session_sandbox' }>['scope']

function isScopeText(text: string): text is ScopeRef['ref'] {
  return text.length > 0
}

function scope(text: string): ScopeRef {
  if (!isScopeText(text)) throw new TypeError('empty scope')
  return { ref: text }
}

function serviceOf(ctx: Context) {
  const service = ctx.get(executionEnvironmentKey)
  if (service === undefined) throw new Error('executionEnvironment is not provided')
  return service
}

const filesRequirement: EnvironmentRequirement = {
  allowedBindings: [host],
  facilities: ['files'],
  isolation: [],
}

const filesPlacement = { scope: scope('scope-1'), requirement: filesRequirement }

async function namedFile(contents: string) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-exec-env-')))
  roots.push(root)
  const path = join(root, 'notes.txt')
  await writeFile(path, contents)
  return { path, named: await hostObjectToken(path) }
}

async function hostLease(ctx: Context, key = 'acq-1') {
  const service = serviceOf(ctx)
  const placement = await service.resolvePlacement(access, filesPlacement)
  if (placement.kind !== 'placement') throw new Error(`no placement: ${JSON.stringify(placement)}`)
  const acquired = await service.acquire(access, {
    acquisition: acquisitionRef(key),
    origin: originRef('call-1'),
    scope: scope('scope-1'),
    placement,
    ledger,
    guard: allow,
  })
  if (acquired.kind !== 'acquired') throw new Error('expected a lease')
  const files = acquired.lease.facility('files')
  if (files === undefined) throw new Error('expected the files facility')
  return { acquired, files }
}

function recordErrors(ctx: Context): unknown[] {
  const errors: unknown[] = []
  ctx.logger.exporter({
    export(message: Message) {
      if (message.type === 'error') errors.push(...message.args)
    },
  })
  return errors
}

function pendingProvider(retired: { count: number }): EnvironmentProvider {
  const left: ManagedResource = { key: 'r1', provider: 'pending', reference: { kind: 'null' } }
  return {
    name: 'pending',
    generation: '1',
    version: 'test-version',
    quotaDomain: 'pending',
    async quota() {
      return { kind: 'unknown' }
    },
    async inspectAcquisition() {
      return { kind: 'unknown' }
    },
    async listAcquisitions() {
      return { kind: 'unknown' }
    },
    async settleAcquisition() {
      return { kind: 'unknown' }
    },
    bindingKinds: ['session_sandbox'],
    continuity: { kind: 'not_guaranteed' },
    facilities: [],
    isolation: [],
    async describe() {
      return {
        provider: 'pending',
        generation: '1',
        version: 'test-version',
        platform: { os: 'test', release: 'test' },
        facilities: [],
        isolation: [],
        prerequisites: 'unknown',
      }
    },
    async acquire() {
      return { kind: 'rejected', reason: 'unavailable' }
    },
    async retire() {
      retired.count += 1
      return { kind: 'pending', resources: [left] }
    },
  }
}

it('reads through a lease once the declaration and the host provider are loaded, and drops the provider on unload', async () => {
  const { path, named } = await namedFile('leased-bytes')
  const ctx = new Context()
  await testPorts(tenant).load(ctx)
  await ctx.plugin(ExecutionEnvironmentRegistry)
  await ctx.plugin(filesFacilityPlugin)
  const hostFiles = await ctx.plugin(hostPlugin())
  const service = serviceOf(ctx)
  const { acquired, files } = await hostLease(ctx)
  expect(acquired.lease.placement.binding).toEqual({ kind: 'host_machine' })
  const read = await files.read({
    requestId: 'leased',
    access,
    origin: originRef('call-1'),
    binding: host,
    path,
    named,
  })
  expect(read).toMatchObject({
    kind: 'done',
    requestId: 'leased',
    value: { bytes: new TextEncoder().encode('leased-bytes') },
  })

  const sandbox = await service.resolvePlacement(access, {
    scope: scope('scope-1'),
    requirement: {
      allowedBindings: [
        { kind: 'stateless_sandbox', scope: scope('scope-1'), origin: originRef('call-1') },
      ],
      facilities: ['files'],
      isolation: [],
    },
  })
  expect(sandbox).toEqual({ kind: 'rejected', reason: 'noMatchingEnvironment' })

  await hostFiles.dispose()
  await expect(acquired.lease.invalidated).resolves.toEqual({
    source: 'registry',
    reason: 'providerRetired',
  })
  expect(await service.resolvePlacement(access, filesPlacement)).toEqual({
    kind: 'rejected',
    reason: 'noMatchingEnvironment',
  })
})

it('keeps the files declaration apart from the provider: without it there is no placement, and removing it refuses operations', async () => {
  const { path, named } = await namedFile('kept-bytes')
  const ctx = new Context()
  await testPorts(tenant).load(ctx)
  await ctx.plugin(ExecutionEnvironmentRegistry)
  await ctx.plugin(hostPlugin())
  const service = serviceOf(ctx)
  expect(await service.resolvePlacement(access, filesPlacement)).toEqual({
    kind: 'rejected',
    reason: 'missingFacility',
  })
  const declaration = await ctx.plugin(filesFacilityPlugin)
  const { acquired, files } = await hostLease(ctx)
  await declaration.dispose()
  expect(
    await files.write({
      requestId: 'after-removal',
      access,
      origin: originRef('call-1'),
      binding: host,
      path,
      named,
      bytes: new TextEncoder().encode('overwritten'),
      mode: 'replace',
    }),
  ).toEqual({ kind: 'rejected', requestId: 'after-removal', reason: 'unsupported' })
  expect(await readFile(path, 'utf8')).toBe('kept-bytes')
  expect(
    await service.inspectAcquisition(access, {
      kind: 'local',
      acquisition: acquisitionRef('acq-1'),
    }),
  ).toEqual({ kind: 'known', state: { kind: 'acquired', adoption: acquired.adoption } })
})

it('refuses new acquisitions and invalidates leases once the Service unloads', async () => {
  const ctx = new Context()
  await testPorts(tenant).load(ctx)
  const registry = await ctx.plugin(ExecutionEnvironmentRegistry)
  await ctx.plugin(filesFacilityPlugin)
  await ctx.plugin(hostPlugin())
  const service = serviceOf(ctx)
  const { acquired } = await hostLease(ctx)

  await registry.dispose()
  expect(ctx.get(executionEnvironmentKey)).toBeUndefined()
  await expect(acquired.lease.invalidated).resolves.toEqual({
    source: 'registry',
    reason: 'registryClosed',
  })
  expect(await hostLease(ctx).catch((error: unknown) => error)).toBeInstanceOf(Error)
  expect(
    await service.acquire(access, {
      acquisition: acquisitionRef('acq-2'),
      origin: originRef('call-1'),
      scope: scope('scope-1'),
      placement: acquired.adoption.placement,
      ledger,
      guard: allow,
    }),
  ).toEqual({ kind: 'rejected', reason: 'ownerStopped' })
})

it('reads the recovery authority service on each recovery, and answers unavailable when it is absent', async () => {
  const asked: unknown[] = []
  class Authority extends ExecutionRecoveryAuthorityService {
    async authorizeRecovery(
      ...args: Parameters<RecoveryAuthority['authorizeRecovery']>
    ): Promise<'authorized'> {
      asked.push(args[0])
      return 'authorized'
    }
  }
  const ctx = new Context()
  await testPorts(tenant).load(ctx)
  await ctx.plugin(ExecutionEnvironmentRegistry)
  await ctx.plugin(hostPlugin())
  const service = serviceOf(ctx)
  const recoveryAccess = createRecoveryAccess()
  const unavailable = { kind: 'rejected', reason: 'unavailable' }
  expect(await service.recoverOwned(scope('scope-1'), recoveryAccess)).toEqual(unavailable)
  expect(await service.releaseScope(scope('scope-1'), recoveryAccess)).toEqual(unavailable)

  const authority = await ctx.plugin(Authority)
  // The files profile lists a complete empty resource set; nothing is unsupported or unavailable.
  expect(await service.recoverOwned(scope('scope-1'), recoveryAccess)).toMatchObject({
    kind: 'recovered',
    stopped: [],
    pending: [],
    unsupported: [],
    unavailable: [],
    settledAcquisitions: [],
    pendingAcquisitions: [],
    unsupportedAcquisitions: [],
  })
  expect(asked).toEqual([recoveryAccess])

  await authority.dispose()
  expect(await service.recoverOwned(scope('scope-1'), recoveryAccess)).toEqual(unavailable)
  expect(asked).toHaveLength(1)
})

it('invalidates the host lease of a released scope and refuses that scope afterwards', async () => {
  class Authority extends ExecutionRecoveryAuthorityService {
    async authorizeRecovery(): Promise<'authorized'> {
      return 'authorized'
    }
  }
  const ctx = new Context()
  await testPorts(tenant).load(ctx)
  await ctx.plugin(ExecutionEnvironmentRegistry)
  await ctx.plugin(Authority)
  await ctx.plugin(filesFacilityPlugin)
  await ctx.plugin(hostPlugin())
  const service = serviceOf(ctx)
  const { acquired } = await hostLease(ctx)
  expect(await service.releaseScope(scope('scope-1'), createRecoveryAccess())).toMatchObject({
    kind: 'recovered',
  })
  await expect(acquired.lease.invalidated).resolves.toEqual({
    source: 'registry',
    reason: 'scopeReleased',
  })
  expect(
    await service.acquire(access, {
      acquisition: acquisitionRef('acq-2'),
      origin: originRef('call-1'),
      scope: scope('scope-1'),
      placement: acquired.adoption.placement,
      ledger,
      guard: allow,
    }),
  ).toEqual({ kind: 'rejected', reason: 'referenceExpired' })
  expect(await service.resolvePlacement(access, filesPlacement)).toEqual({
    kind: 'rejected',
    reason: 'referenceExpired',
  })
})

it('retries a pending retirement each time the returned removal is called through the Service', async () => {
  const retired = { count: 0 }
  const ctx = new Context()
  await testPorts(tenant).load(ctx)
  await ctx.plugin(ExecutionEnvironmentRegistry)
  let remove: () => Promise<void> = async () => undefined
  await ctx.plugin({
    name: 'pendingProvider',
    inject: { [executionEnvironmentKey]: { caller: 'provider' } },
    apply(caller: Context) {
      remove = caller.executionEnvironment.registerProvider(pendingProvider(retired))
    },
  })
  await expect(remove()).rejects.toMatchObject({ name: 'RetirementPending' })
  await expect(remove()).rejects.toMatchObject({
    name: 'RetirementPending',
    resources: [{ key: 'r1' }],
  })
  expect(retired.count).toBe(2)
})

it('completes the unload when a retirement or the close is pending, and logs RetirementPending', async () => {
  const retired = { count: 0 }
  const ctx = new Context()
  const errors = recordErrors(ctx)
  await testPorts(tenant).load(ctx)
  const registry = await ctx.plugin(ExecutionEnvironmentRegistry)
  const provider = await ctx.plugin({
    name: 'pendingProvider',
    inject: { [executionEnvironmentKey]: { caller: 'provider' } },
    apply(caller: Context) {
      caller.executionEnvironment.registerProvider(pendingProvider(retired))
    },
  })
  await expect(provider.dispose()).resolves.toBeUndefined()
  expect(retired.count).toBe(1)
  expect(errors).toMatchObject([{ name: 'RetirementPending', subject: 'Provider pending@1' }])

  await expect(registry.dispose()).resolves.toBeUndefined()
  expect(ctx.get(executionEnvironmentKey)).toBeUndefined()
  expect(retired.count).toBe(2)
  expect(errors).toMatchObject([
    { name: 'RetirementPending', subject: 'Provider pending@1' },
    { name: 'RetirementPending', subject: 'The environment registry', resources: [{ key: 'r1' }] },
  ])
})

it('accepts only drainBoundMs, a finite number zero or more, on the host files plugin', async () => {
  const validate = hostPlugin().Config['~standard'].validate
  for (const accepted of [undefined, null, {}]) expect(validate(accepted)).toEqual({ value: {} })
  expect(validate({ drainBoundMs: 0 })).toEqual({ value: { drainBoundMs: 0 } })
  expect(validate({ drainBoundMs: 250 })).toEqual({ value: { drainBoundMs: 250 } })
  for (const refused of [
    [],
    'x',
    0,
    { retries: 3 },
    { drainBoundMs: -1 },
    { drainBoundMs: Number.POSITIVE_INFINITY },
    { drainBoundMs: '5' },
  ])
    expect(validate(refused)).toMatchObject({ issues: [{ message: expect.any(String) }] })
  const ctx = new Context()
  await testPorts(tenant).load(ctx)
  await ctx.plugin(ExecutionEnvironmentRegistry)
  const loading: unknown = Reflect.apply(ctx.plugin, ctx, [hostPlugin(), { drainBoundMs: -1 }])
  await expect(Promise.resolve(loading)).rejects.toBeDefined()
})

it('accepts only an absent, null or empty configuration on the Service and the declaration plugin', async () => {
  for (const unit of [ExecutionEnvironmentRegistry, filesFacilityPlugin]) {
    const validate = unit.Config['~standard'].validate
    for (const accepted of [undefined, null, {}]) expect(validate(accepted)).toEqual({ value: {} })
    for (const refused of [{ retries: 3 }, [], 'x', 0])
      expect(validate(refused)).toEqual({
        issues: [{ message: 'configuration accepts no fields' }],
      })
  }
  const ctx = new Context()
  await testPorts(tenant).load(ctx)
  await ctx.plugin(ExecutionEnvironmentRegistry)
  // The typed overload forbids the bad configuration; an assembly reading a plugin tree does not.
  const loading: unknown = Reflect.apply(ctx.plugin, ctx, [filesFacilityPlugin, { extra: true }])
  await expect(Promise.resolve(loading)).rejects.toBeDefined()
  expect(await serviceOf(ctx).resolvePlacement(access, filesPlacement)).toMatchObject({
    kind: 'rejected',
  })
})

it('forwards state and description to the registry, and removes a declaration through the returned removal', async () => {
  const ctx = new Context()
  await testPorts(tenant).load(ctx)
  await ctx.plugin(ExecutionEnvironmentRegistry)
  await ctx.plugin(hostPlugin())
  let removeDeclaration: () => Promise<void> = async () => undefined
  await ctx.plugin({
    name: 'declaration',
    inject: { [executionEnvironmentKey]: { caller: 'provider' } },
    apply(caller: Context) {
      removeDeclaration = caller.executionEnvironment.registerFacility(filesFacility)
    },
  })
  const service = serviceOf(ctx)
  const { acquired } = await hostLease(ctx)
  expect(
    await service.inspectAcquisition(access, {
      kind: 'local',
      acquisition: acquisitionRef('acq-1'),
    }),
  ).toEqual({ kind: 'known', state: { kind: 'acquired', adoption: acquired.adoption } })
  expect(await service.describe(access, scope('scope-1'))).toMatchObject([
    { acquisition: 'acq-1', binding: host, provider: { name: 'host-files' }, state: 'acquired' },
  ])
  expect(await service.describe(access, scope('scope-2'))).toEqual([])
  await removeDeclaration()
  expect(await service.resolvePlacement(access, filesPlacement)).toEqual({
    kind: 'rejected',
    reason: 'missingFacility',
  })
})

it('logs nothing when the unload drains', async () => {
  const ctx = new Context()
  const errors = recordErrors(ctx)
  await testPorts(tenant).load(ctx)
  const registry = await ctx.plugin(ExecutionEnvironmentRegistry)
  const hostFiles = await ctx.plugin(hostPlugin())
  await hostFiles.dispose()
  await registry.dispose()
  expect(errors).toEqual([])
})

it('answers unavailable for ordinary access while the two access port services are absent', async () => {
  const ctx = new Context()
  await ctx.plugin(ExecutionEnvironmentRegistry)
  await ctx.plugin(filesFacilityPlugin)
  await ctx.plugin(hostPlugin())
  const service = serviceOf(ctx)
  const unavailable = { kind: 'rejected', reason: 'unavailable' }
  expect(await service.resolvePlacement(access, filesPlacement)).toEqual(unavailable)
  expect(await service.describe(access, scope('scope-1'))).toEqual(unavailable)
  const ports = testPorts(tenant)
  const authority = await ctx.plugin(ports.Authority)
  // The authority alone is not enough: the trusted binding source is still absent.
  expect(await service.resolvePlacement(access, filesPlacement)).toEqual(unavailable)
  await ctx.plugin(ports.Bindings)
  expect(await service.resolvePlacement(access, filesPlacement)).toMatchObject({
    kind: 'placement',
    quotaDomain: 'host-files',
  })
  await authority.dispose()
  expect(await service.resolvePlacement(access, filesPlacement)).toEqual(unavailable)
})

it('refuses a scope the trusted binding source binds to another tenant, before any provider call', async () => {
  const other = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_0123456789abcdefghjkmnpqrt',
      account: 'acc_0123456789abcdefghjkmnpqrt',
    }),
  )
  if (!other.ok) throw new Error('tenant fixture did not parse')
  const ctx = new Context()
  const ports = testPorts(tenant)
  ports.bind(scope('scope-1'), other.value)
  await ports.load(ctx)
  await ctx.plugin(ExecutionEnvironmentRegistry)
  await ctx.plugin(filesFacilityPlugin)
  await ctx.plugin(hostPlugin())
  expect(await serviceOf(ctx).resolvePlacement(access, filesPlacement)).toEqual({
    kind: 'rejected',
    reason: 'notAuthorized',
  })
})

it('resolves files and command on the one host provider once both declarations load, and terminal stays missing', async () => {
  const ctx = new Context()
  await testPorts(tenant).load(ctx)
  await ctx.plugin(ExecutionEnvironmentRegistry)
  await ctx.plugin(filesFacilityPlugin)
  await ctx.plugin(hostPlugin())
  const service = serviceOf(ctx)
  const placementOf = (facilities: EnvironmentRequirement['facilities']) =>
    service.resolvePlacement(access, {
      scope: scope('scope-1'),
      requirement: { allowedBindings: [host], facilities, isolation: [] },
    })
  expect(await placementOf(['files', 'command'])).toEqual({
    kind: 'rejected',
    reason: 'missingFacility',
  })
  const declaration = await ctx.plugin(commandFacilityPlugin)
  expect(await placementOf(['files', 'command'])).toMatchObject({
    kind: 'placement',
    binding: host,
    provider: { name: 'host-files' },
  })
  expect(await placementOf(['files', 'command', 'terminal'])).toEqual({
    kind: 'rejected',
    reason: 'missingFacility',
  })
  await declaration.dispose()
  expect(await placementOf(['command'])).toEqual({ kind: 'rejected', reason: 'missingFacility' })
})

it('accepts the command bounds, the files root and the state directory on the host files plugin', () => {
  const validate = hostPlugin().Config['~standard'].validate
  const full = {
    drainBoundMs: 10,
    filesRoot: '/srv/files',
    stateDirectory: '/srv/state',
    maxBufferedBytes: 1024,
    maxChunkBytes: 512,
    startBoundMs: 100,
    graceMs: 0,
    stopBoundMs: 100,
    probeRetryMs: 0,
  }
  expect(validate(full)).toEqual({ value: full })
  for (const refused of [
    { filesRoot: 'relative/files' },
    { stateDirectory: '' },
    { filesRoot: 7 },
    { maxBufferedBytes: 0 },
    { maxChunkBytes: 1.5 },
    { maxChunkBytes: 2048, maxBufferedBytes: 1024 },
    { startBoundMs: -1 },
    { graceMs: Number.NaN },
    { stopBoundMs: '5' },
    { probeRetryMs: Number.POSITIVE_INFINITY },
  ])
    expect(validate(refused), JSON.stringify(refused)).toMatchObject({
      issues: [{ message: expect.any(String) }],
    })
})

it('accepts only an empty configuration on the command declaration plugin', () => {
  const validate = commandFacilityPlugin.Config['~standard'].validate
  for (const accepted of [undefined, null, {}]) expect(validate(accepted)).toEqual({ value: {} })
  expect(validate({ extra: true })).toEqual({
    issues: [{ message: 'configuration accepts no fields' }],
  })
})
