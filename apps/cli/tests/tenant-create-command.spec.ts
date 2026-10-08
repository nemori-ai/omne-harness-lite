import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm, readFile, mkdir, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { openClientLocalState } from '@omne-harness-lite/client-local-state-sqlite'
import { createGovernanceClient } from '@omne-harness-lite/governance-client-operations-local'
import type { GovernanceOutcome } from '@omne-harness-lite/governance-center-entry-https-json'
import { GovernanceTransportService } from '@omne-harness-lite/governance-center-entry-https-json/cordis'
import { startAssemblyWork } from '@omne-harness-lite/assembly-lifecycle/cordis'
import type { Context } from '@deepseek-ai/cordis'
import { createClientAssembly } from '../src/assembly.ts'
import { openCliCatalog } from '../src/catalog-open.ts'
import { parseRunLoginBinding } from '../src/session-preparation.ts'
import { tenantPaths } from '../src/state-layout.ts'
import {
  runTenantCreateCommand,
  type TenantCreateCommandInput,
} from '../src/tenant-create-command.ts'

const clean: (() => Promise<void>)[] = []
const centerId = 'a'.repeat(32),
  account = 'owner',
  handle = 'original-login'
const personal = { organization: 'personal', account },
  created = { organization: 'team-created', account }
const current = 'capability.organization-governance/v2#S-36'
const create = 'capability.organization-governance/v2#S-21'
const read = 'capability.organization-governance/v2#S-22'
const membership = 'capability.organization-governance/v2#S-26'
const sourceSecret = 'original-private-presentation'
const login = parseRunLoginBinding({ centerId, accountId: account, loginStateHandle: handle })
if (login === undefined) throw new Error('invalid fixture')
const loginScope = { centerId: login.centerId, accountId: login.accountId }
afterEach(async () => {
  vi.restoreAllMocks()
  for (const close of clean.splice(0).reverse()) await close()
})
async function fixture(unrecognized = false) {
  const root = await mkdtemp(join(tmpdir(), 'omne-tenant-create-command-'))
  clean.push(() => rm(root, { force: true, recursive: true }))
  const source = await openClientLocalState(
    { directory: join(root, 'original-auth') },
    { storage: { open: file => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }) } },
  )
  clean.push(() => source.close())
  const initial = await source.read()
  if (initial.kind !== 'read') throw new Error('source unavailable')
  expect(
    (
      await source.compareAndReplace(
        initial.snapshot.token,
        {
          center: { centerId, endpoint: 'https://center.invalid/', trust: { mode: 'ca' } },
          login: {
            handle,
            presentation: sourceSecret,
            ...(unrecognized ? {} : { accountId: account }),
          },
          cache: [],
        },
        'initial',
      )
    ).kind,
  ).toBe('installed')
  const input: TenantCreateCommandInput = {
    home: join(root, '.omne'),
    name: '研发组',
    creationKey: 'original-create-key',
    loginScope,
  }
  const owned = await openCliCatalog(input.home, {
    maxCenters: 8,
    maxCreations: 8,
    maxRecordBytes: 64 * 1024,
  })
  clean.push(() => owned.close())
  let unknown = false,
    rejected = false,
    ineffective = false,
    unavailable = false
  const exchange = vi.fn(async (_options: unknown, value: unknown): Promise<GovernanceOutcome> => {
    const request = value as { operation: string; payload: Record<string, unknown> }
    if (rejected)
      return { kind: 'entry-answer', answer: 'login-state-rejected', sendAttempted: true }
    if (unavailable) return { kind: 'entry-answer', answer: 'unavailable', sendAttempted: true }
    if (unknown && request.operation === create)
      return { kind: 'unavailable', reason: 'connection', sendAttempted: true }
    const result =
      request.operation === current
        ? personal
        : request.operation === create
          ? created.organization
          : request.operation === read
            ? { organization: created.organization, organizationKind: 'team', name: input.name }
            : ineffective
              ? { standing: 'ineffective' }
              : { standing: 'effective', role: 'superAdministrator' }
    return { kind: 'reply', reply: { result }, sendAttempted: true }
  })
  const client = createGovernanceClient({
    state: source,
    transport: {
      readPublicHealth: async () => ({
        kind: 'health',
        reply: { reachable: true, centerId, version: 'fixture' },
      }),
      exchangeGovernance: exchange,
    },
  })
  clean.push(() => client.close())
  const ports = { client, catalog: owned.catalog, source }
  const sends = () =>
    exchange.mock.calls.filter(([, body]) => (body as { operation: string }).operation === create)
  return {
    root,
    input,
    ports,
    exchange,
    sends,
    unknown: () => {
      unknown = true
    },
    reject: () => {
      rejected = true
    },
    ineffective: () => {
      ineffective = true
    },
    unavailable: () => {
      unavailable = true
    },
  }
}
it('uses actual CG and SQLite to create once, prepare bound tenant auth and keep selection unchanged', async () => {
  const f = await fixture(),
    outcome = await runTenantCreateCommand(f.input, f.ports)
  expect(outcome).toMatchObject({
    kind: 'created',
    result: { tenant: created, preparation: { kind: 'observed', name: f.input.name } },
    auth: { login: { kind: 'installed' } },
  })
  expect(f.sends()).toHaveLength(1)
  expect(await f.ports.catalog.readSelection()).toMatchObject({ selected: null })
  expect(JSON.stringify(outcome)).not.toContain(sourceSecret)
  const paths = tenantPaths(f.input.home, {
    formatVersion: 1,
    centerId: login.centerId,
    tenant: created as never,
  })
  expect(JSON.parse(await readFile(paths.binding, 'utf8'))).toEqual({
    formatVersion: 1,
    centerId,
    tenant: created,
  })
  const target = await openClientLocalState(
    { directory: paths.auth },
    { storage: { open: file => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }) } },
  )
  try {
    const value = await target.read()
    if (value.kind !== 'read') throw new Error('target unavailable')
    expect(value.snapshot.value?.login).toMatchObject({
      accountId: account,
      handle,
      presentation: sourceSecret,
    })
    expect(value.snapshot.operationId).toBe(f.input.creationKey)
  } finally {
    await target.close()
  }
  expect(await f.ports.client.openUse()).toHaveProperty('kind', 'use')
})
it('creates through the real Cordis assembly and borrows its actual source for tenant auth', async () => {
  const f = await fixture()
  class Transport extends GovernanceTransportService {
    readPublicHealth: GovernanceTransportService['readPublicHealth'] = async () => ({
      kind: 'health',
      reply: { reachable: true, centerId, version: 'fixture' },
    })
    exchangeGovernance = f.exchange
  }
  const assembly = createClientAssembly(
    { directory: join(f.root, 'original-auth') },
    {
      transport: {
        name: 'controlled-transport',
        assemblyLifecycle: 1,
        inject: ['assemblyLifetime'],
        apply(ctx: Context) {
          startAssemblyWork(
            ctx,
            async () => {
              new Transport(ctx)
            },
            async () => {},
          )
        },
      },
    },
  )
  clean.push(async () => {
    assembly.requestStop()
    await assembly.clientStopped
    assembly.releasePresentation()
    expect((await assembly.closed).complete).toBe(true)
  })
  const client = await assembly.ready,
    source = await assembly.borrowState()
  expect(await runTenantCreateCommand(f.input, { ...f.ports, client, source })).toMatchObject({
    kind: 'created',
    request: { login },
    auth: { login: { kind: 'installed' } },
  })
  expect(f.sends()).toHaveLength(1)
  expect(await runTenantCreateCommand(f.input, { ...f.ports, client, source })).toMatchObject({
    kind: 'created',
    auth: { login: { kind: 'already-installed' } },
  })
  expect(f.sends()).toHaveLength(1)
  expect(await f.ports.catalog.readSelection()).toMatchObject({ selected: null })
})
it('recognizes the account of a just-issued login before capturing the original request', async () => {
  const f = await fixture(true)
  expect(await runTenantCreateCommand(f.input, f.ports)).toMatchObject({
    kind: 'created',
    request: { login },
    auth: { login: { kind: 'installed' } },
  })
  expect(f.sends()).toHaveLength(1)
})
it.each([
  { centerId: 'b'.repeat(32), accountId: account },
  { centerId, accountId: 'another-account' },
])('refuses a source login outside the captured command owner %j', async scope => {
  const f = await fixture()
  expect(await runTenantCreateCommand({ ...f.input, loginScope: scope as never }, f.ports)).toEqual(
    {
      kind: 'blocked',
      reason: 'identity-mismatch',
    },
  )
  expect(f.sends()).toHaveLength(0)
})
it('does not resend creation on same-request replay and recognizes original tenant auth', async () => {
  const f = await fixture()
  await runTenantCreateCommand(f.input, f.ports)
  expect(await runTenantCreateCommand(f.input, f.ports)).toMatchObject({
    kind: 'created',
    auth: { login: { kind: 'already-installed' } },
  })
  expect(f.sends()).toHaveLength(1)
})
it('retains an unknown original remote outcome and does not resend on another command invocation', async () => {
  const f = await fixture()
  f.unknown()
  expect(await runTenantCreateCommand(f.input, f.ports)).toMatchObject({
    kind: 'unresolved',
    result: { kind: 'unresolved', report: { remote: { status: 'unknown' } } },
  })
  expect(await runTenantCreateCommand(f.input, f.ports)).toMatchObject({ kind: 'unresolved' })
  expect(f.sends()).toHaveLength(1)
})
it('does not send when durable original capture is unconfirmed', async () => {
  const f = await fixture(),
    actual = f.ports.catalog.captureCreation.bind(f.ports.catalog)
  vi.spyOn(f.ports.catalog, 'captureCreation').mockImplementation(async request => {
    await actual(request)
    return 'unconfirmed'
  })
  expect(await runTenantCreateCommand(f.input, f.ports)).toMatchObject({ kind: 'unconfirmed' })
  expect(f.sends()).toHaveLength(0)
  expect(
    await f.ports.catalog.readCreation({
      login,
      name: f.input.name,
      creationKey: f.input.creationKey,
    }),
  ).toMatchObject({ status: 'prepared' })
})
it('rejects changed name under an original key without creating another organization', async () => {
  const f = await fixture()
  await runTenantCreateCommand(f.input, f.ports)
  expect(await runTenantCreateCommand({ ...f.input, name: 'changed' }, f.ports)).toEqual({
    kind: 'blocked',
    reason: 'identity-conflict',
  })
  expect(f.sends()).toHaveLength(1)
})
it.each(['name', 'creationKey', 'home'] as const)(
  'rejects invalid %s before client admission and network',
  async field => {
    const f = await fixture(),
      opened = vi.spyOn(f.ports.client, 'openUse')
    expect(await runTenantCreateCommand({ ...f.input, [field]: '' }, f.ports)).toEqual({
      kind: 'blocked',
      reason: 'invalid-input',
    })
    expect(opened).not.toHaveBeenCalled()
    expect(f.exchange).not.toHaveBeenCalled()
  },
)
it('does not create when login is rejected and does not reinterpret unavailability as rejection', async () => {
  const f = await fixture()
  f.reject()
  expect(await runTenantCreateCommand(f.input, f.ports)).toEqual({
    kind: 'blocked',
    reason: 'login-rejected',
  })
  expect(f.sends()).toHaveLength(0)
  const g = await fixture()
  g.unavailable()
  expect(await runTenantCreateCommand(g.input, g.ports)).toEqual({
    kind: 'blocked',
    reason: 'identity-unavailable',
  })
  expect(g.sends()).toHaveLength(0)
})
it('preserves remote creation when target membership preparation is blocked', async () => {
  const f = await fixture()
  f.ineffective()
  expect(await runTenantCreateCommand(f.input, f.ports)).toMatchObject({
    kind: 'created',
    result: { tenant: created },
    auth: { kind: 'not-prepared', reason: 'membership-ineffective' },
  })
  expect(f.sends()).toHaveLength(1)
  expect(
    await f.ports.catalog.readCreation({
      login,
      name: f.input.name,
      creationKey: f.input.creationKey,
    }),
  ).toMatchObject({ result: { kind: 'created', tenant: created } })
})
it('reports unsafe tenant namespace separately from the already-created remote organization', async () => {
  const f = await fixture()
  await mkdir(join(f.root, 'outside'))
  await symlink(join(f.root, 'outside'), join(f.input.home, 'tenants'))
  expect(await runTenantCreateCommand(f.input, f.ports)).toMatchObject({
    kind: 'created',
    result: { tenant: created },
    auth: { kind: 'failed', reason: 'unsafe-path' },
  })
  expect(f.sends()).toHaveLength(1)
})
it('waits for owned use close and retains original failure when close also fails', async () => {
  const f = await fixture(),
    actual = f.ports.client.openUse.bind(f.ports.client)
  const work = new Error('original-flow-defect'),
    close = new Error('original-close-defect')
  vi.spyOn(f.ports.client, 'openUse').mockImplementation(async () => {
    const result = await actual()
    if (result.kind !== 'use') return result
    return {
      ...result,
      use: {
        run: result.use.run.bind(result.use),
        runPrepared: result.use.runPrepared.bind(result.use),
        close: async () => {
          await result.use.close()
          throw close
        },
      },
    }
  })
  vi.spyOn(f.ports.catalog, 'captureCreation').mockRejectedValueOnce(work)
  const failure = await runTenantCreateCommand(f.input, f.ports).catch(error => error)
  expect(failure).toBeInstanceOf(AggregateError)
  expect(failure.errors).toEqual([work, close])
  expect(f.sends()).toHaveLength(0)
})
