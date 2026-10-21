import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  acquisitionRef,
  createRecoveryAccess,
  originRef,
  type Access,
  type EnvironmentBinding,
  type EnvironmentRequirement,
  type FacilityGuard,
  type ResourceLedger,
} from '@omne-harness/execution-environment-contract'
import { executionEnvironmentKey } from '@omne-harness/execution-environment-cordis-contract/cordis'
import { hostObjectToken } from '@omne-harness/execution-environment-host-local'
import {
  ExecutionEnvironmentRegistry,
  executionEnvironmentRegistryWith,
  hostFilesPlugin,
} from '@omne-harness/execution-environment-host-local/cordis'

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

it('registers host files, reads through the lease, drops them on unload, and refuses a sandbox with no provider', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-exec-env-')))
  roots.push(root)
  const path = join(root, 'notes.txt')
  await writeFile(path, 'leased-bytes')
  const ctx = new Context()
  await ctx.plugin(ExecutionEnvironmentRegistry)
  const hostFiles = await ctx.plugin(hostFilesPlugin)
  const service = serviceOf(ctx)

  const placement = await service.resolvePlacement(access, filesRequirement)
  if (placement.kind !== 'placement') throw new Error(`no placement: ${placement.reason}`)
  const acquired = await service.acquire(access, {
    acquisition: acquisitionRef('acq-1'),
    origin: originRef('call-1'),
    placement,
    ledger,
    guard: allow,
  })
  expect(acquired.kind).toBe('acquired')
  if (acquired.kind !== 'acquired') return
  expect(acquired.lease.placement.binding).toEqual({ kind: 'host_machine' })
  const files = acquired.lease.facility('files')
  if (files === undefined) throw new Error('expected the files facility')
  const named = await hostObjectToken(path)
  const read = await files.read({
    requestId: 'leased',
    access,
    origin: originRef('call-1'),
    binding: acquired.lease.placement.binding,
    path,
    named,
  })
  expect(read).toMatchObject({
    kind: 'done',
    requestId: 'leased',
    value: { bytes: new TextEncoder().encode('leased-bytes') },
  })

  const sandbox = await service.resolvePlacement(access, {
    allowedBindings: [
      { kind: 'stateless_sandbox', scope: scope('scope-1'), origin: originRef('call-1') },
    ],
    facilities: ['files'],
    isolation: [],
  })
  expect(sandbox).toEqual({ kind: 'rejected', reason: 'noMatchingEnvironment' })

  await hostFiles.dispose()
  await expect(acquired.lease.invalidated).resolves.toEqual({ reason: 'providerRetired' })
  const after = await service.resolvePlacement(access, filesRequirement)
  expect(after).toEqual({ kind: 'rejected', reason: 'noMatchingEnvironment' })
})

it('refuses new acquisitions and invalidates leases once the Service unloads', async () => {
  const ctx = new Context()
  const registry = await ctx.plugin(ExecutionEnvironmentRegistry)
  await ctx.plugin(hostFilesPlugin)
  const service = serviceOf(ctx)
  const placement = await service.resolvePlacement(access, filesRequirement)
  if (placement.kind !== 'placement') throw new Error(`no placement: ${placement.reason}`)
  const input = (key: string) => ({
    acquisition: acquisitionRef(key),
    origin: originRef('call-1'),
    placement,
    ledger,
    guard: allow,
  })
  const acquired = await service.acquire(access, input('acq-1'))
  if (acquired.kind !== 'acquired') throw new Error('expected a lease')

  await registry.dispose()
  expect(ctx.get(executionEnvironmentKey)).toBeUndefined()
  await expect(acquired.lease.invalidated).resolves.toEqual({ reason: 'registryClosed' })
  expect(await service.acquire(access, input('acq-2'))).toEqual({
    kind: 'rejected',
    reason: 'ownerStopped',
  })
})

it('answers unavailable to recovery when the assembly gives no recovery authority', async () => {
  const ctx = new Context()
  await ctx.plugin(ExecutionEnvironmentRegistry)
  const service = serviceOf(ctx)
  const recoveryAccess = createRecoveryAccess()
  expect(await service.recoverOwned(scope('scope-1'), recoveryAccess)).toEqual({
    kind: 'rejected',
    reason: 'unavailable',
  })
  expect(await service.releaseScope(scope('scope-1'), recoveryAccess)).toEqual({
    kind: 'rejected',
    reason: 'unavailable',
  })
})

it('asks the injected recovery authority and reports the host provider as not recoverable', async () => {
  const asked: unknown[] = []
  const ctx = new Context()
  await ctx.plugin(
    executionEnvironmentRegistryWith({
      async authorizeRecovery(recoveryAccess) {
        asked.push(recoveryAccess)
        return 'authorized'
      },
    }),
  )
  await ctx.plugin(hostFilesPlugin)
  const service = serviceOf(ctx)
  const recoveryAccess = createRecoveryAccess()
  const recovered = await service.recoverOwned(scope('scope-1'), recoveryAccess)
  expect(asked).toEqual([recoveryAccess])
  expect(recovered).toMatchObject({
    kind: 'recovered',
    stopped: [],
    pending: [],
    unsupported: [{ kind: 'provider', provider: { name: 'host-files' } }],
    unavailable: [],
  })
})
