// Retirement of the host files provider while a file operation is in flight. The operation is made
// slow and controllable by holding `open` on one marked path; everything else is the real file system.
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, type Message } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  acquisitionRef,
  originRef,
  type EnvironmentBinding,
  type FileSystemFacility,
  type ObjectToken,
  type ProviderAcquireInput,
  type ResourceLedger,
} from '@omne-harness/execution-environment-contract'
import { executionEnvironmentKey } from '@omne-harness/execution-environment-cordis-contract/cordis'
import {
  createHostFilesProvider,
  hostObjectToken,
  type HostFilesDiagnostic,
} from '@omne-harness/execution-environment-host-local'
import {
  ExecutionEnvironmentRegistry,
  filesFacilityPlugin,
  hostFilesPlugin,
} from '@omne-harness/execution-environment-host-local/cordis'

// `open` on a path with the marker signals `entered`, then waits until the test calls `release`.
const hold = vi.hoisted(() => ({
  marker: 'held-by-test',
  entered: (): void => undefined,
  release: (): void => undefined,
  gate: { entered: Promise.resolve(), released: Promise.resolve() },
}))

function holdNextOpen(): void {
  hold.gate = {
    entered: new Promise<void>(resolve => {
      hold.entered = resolve
    }),
    released: new Promise<void>(resolve => {
      hold.release = resolve
    }),
  }
}

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    async open(...args: Parameters<typeof actual.open>) {
      if (String(args[0]).includes(hold.marker)) {
        hold.entered()
        await hold.gate.released
      }
      return actual.open(...args)
    },
  }
})

const roots: string[] = []

afterEach(async () => {
  hold.release()
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

async function heldFile() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-exec-env-')))
  roots.push(root)
  const path = join(root, `${hold.marker}.txt`)
  await writeFile(path, 'before')
  holdNextOpen()
  return { path, named: await hostObjectToken(path) }
}

function write(files: FileSystemFacility<unknown>, path: string, named: ObjectToken, id: string) {
  return files.write({
    requestId: id,
    access: { principal: 'subject-a', tenant },
    origin: originRef('call-1'),
    binding: host,
    path,
    named,
    bytes: new TextEncoder().encode(`written-by-${id}`),
    mode: 'replace',
  })
}

async function providerFiles(provider: ReturnType<typeof createHostFilesProvider>) {
  const acquired = await provider.acquire({
    acquisition: acquisitionRef('acq-1'),
    origin: originRef('call-1'),
    scope: scope1,
    placement: {
      kind: 'placement',
      requirement: { allowedBindings: [host], facilities: ['files'], isolation: [] },
      binding: host,
      provider: { name: provider.name, generation: provider.generation, version: provider.version },
      continuity: { kind: 'not_guaranteed' },
    },
    tenant,
    ledger,
  })
  if (acquired.kind !== 'acquired') throw new Error('expected a lease')
  const files = acquired.lease.facility('files')
  if (files === undefined) throw new Error('expected files')
  return files
}

/** Resolves to `pending` when the promise has not settled after the queued callbacks ran. */
async function settledOrPending<T>(promise: Promise<T>): Promise<T | 'pending'> {
  return Promise.race([
    promise,
    new Promise<'pending'>(resolve => setTimeout(resolve, 30, 'pending')),
  ])
}

it('waits for an in-flight write before it reports drained, and admits no new operation meanwhile', async () => {
  const { path, named } = await heldFile()
  const diagnostics: HostFilesDiagnostic[] = []
  const provider = createHostFilesProvider({
    drainBoundMs: 5_000,
    diagnose: diagnostic => diagnostics.push(diagnostic),
  })
  const files = await providerFiles(provider)
  const inFlight = write(files, path, named, 'in-flight')
  await hold.gate.entered
  const retiring = provider.retire()
  expect(await settledOrPending(retiring)).toBe('pending')
  expect(await write(files, path, named, 'late')).toEqual({
    kind: 'rejected',
    requestId: 'late',
    reason: 'closed',
  })
  hold.release()
  expect(await retiring).toEqual({ kind: 'drained' })
  expect(await inFlight).toMatchObject({ kind: 'done', requestId: 'in-flight' })
  expect(await readFile(path, 'utf8')).toBe('written-by-in-flight')
  expect(diagnostics).toEqual([])
})

it('reports pending with no resources past the bound, with a diagnostic of the operations in flight', async () => {
  const { path, named } = await heldFile()
  const diagnostics: HostFilesDiagnostic[] = []
  const provider = createHostFilesProvider({
    drainBoundMs: 20,
    diagnose: diagnostic => diagnostics.push(diagnostic),
  })
  const files = await providerFiles(provider)
  const inFlight = write(files, path, named, 'in-flight')
  await hold.gate.entered
  expect(await provider.retire()).toEqual({ kind: 'pending', resources: [] })
  expect(diagnostics).toEqual([
    {
      kind: 'drainBoundExceeded',
      provider: 'host-files',
      generation: provider.generation,
      inFlight: 1,
      boundMs: 20,
    },
  ])
  hold.release()
  expect(await inFlight).toMatchObject({ kind: 'done' })
  expect(await provider.retire()).toEqual({ kind: 'drained' })
})

it('logs the diagnostic and RetirementPending when the host files plugin unloads past its bound', async () => {
  const { path, named } = await heldFile()
  const ctx = new Context()
  const errors: unknown[] = []
  ctx.logger.exporter({
    export(message: Message) {
      if (message.type === 'error') errors.push(...message.args)
    },
  })
  await ctx.plugin(ExecutionEnvironmentRegistry)
  await ctx.plugin(filesFacilityPlugin)
  const hostFiles = await ctx.plugin(hostFilesPlugin, { drainBoundMs: 20 })
  const service = ctx.get(executionEnvironmentKey)
  if (service === undefined) throw new Error('executionEnvironment is not provided')
  const access = { principal: 'subject-a', tenant }
  const placement = await service.resolvePlacement(access, {
    scope: scope1,
    requirement: { allowedBindings: [host], facilities: ['files'], isolation: [] },
  })
  if (placement.kind !== 'placement') throw new Error('expected a placement')
  const acquired = await service.acquire(access, {
    acquisition: acquisitionRef('acq-1'),
    origin: originRef('call-1'),
    scope: scope1,
    placement,
    ledger,
    guard: { authorize: async () => 'authorized' },
  })
  if (acquired.kind !== 'acquired') throw new Error('expected a lease')
  const files = acquired.lease.facility('files')
  if (files === undefined) throw new Error('expected files')
  const inFlight = write(files, path, named, 'in-flight')
  await hold.gate.entered
  await hostFiles.dispose()
  expect(errors).toMatchObject([
    { kind: 'drainBoundExceeded', provider: 'host-files', inFlight: 1, boundMs: 20 },
    { name: 'RetirementPending', resources: [] },
  ])
  hold.release()
  expect(await inFlight).toMatchObject({ kind: 'done' })
})
