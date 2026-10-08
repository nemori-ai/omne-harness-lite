import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { startAssemblyWork } from '@omne-harness-lite/assembly-lifecycle/cordis'
import { GovernanceTransportService } from '@omne-harness-lite/governance-center-entry-https-json/cordis'
import type { GovernanceOutcome } from '@omne-harness-lite/governance-center-entry-https-json'
import { createClientAssembly } from '../src/assembly.ts'
import { openCliCatalog } from '../src/catalog-open.ts'
import { runLoginEntry, type LoginEntryInput } from '../src/login-entry.ts'
import { tenantPaths } from '../src/state-layout.ts'
import { checkedTenantBinding } from '../src/state-layout-values.ts'
import { openClientLocalState } from '@omne-harness-lite/client-local-state-sqlite'
import { openStorage } from '@omne-harness-lite/storage-sql'

const cleanup: (() => Promise<void>)[] = []
const centerId = 'a'.repeat(32),
  account = 'owner',
  handle = 'issued-handle'
const tenant = { organization: 'personal', account }
const secret = ' private credential\n',
  presentation = 'do-not-print-issued-bearer'
const loginOperation = 'capability.account-identity/v3#S-15'
afterEach(async () => {
  vi.restoreAllMocks()
  for (const close of cleanup.splice(0).reverse()) await close()
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'omne-login-entry-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const home = join(root, '.omne'),
    credentialFile = join(root, 'credential')
  await writeFile(credentialFile, secret, { mode: 0o600 })
  const owned = await openCliCatalog(home, {
    maxCenters: 8,
    maxCreations: 8,
    maxRecordBytes: 65536,
  })
  cleanup.push(() => owned.close())
  await owned.catalog.registerCenter({
    name: 'work',
    center: { centerId, endpoint: 'https://center.invalid/', trust: { mode: 'ca' } },
  })
  let changedCenter = false,
    unknown = false,
    rejected = false
  const exchange = vi.fn(async (_options: unknown, body: unknown): Promise<GovernanceOutcome> => {
    const request = body as { operation: string; payload: Record<string, unknown> }
    if (request.operation === loginOperation && unknown)
      return { kind: 'unavailable', reason: 'connection', sendAttempted: true }
    if (request.operation === loginOperation && rejected)
      return { kind: 'reply', reply: { failure: 'credentialMismatch' }, sendAttempted: true }
    const result =
      request.operation === loginOperation
        ? { loginState: presentation, loginStateHandle: handle }
        : request.operation === 'composition.account-registration/v2#S-8'
          ? 'registered'
          : request.operation.endsWith('#S-36')
            ? tenant
            : { standing: 'effective', role: 'member' }
    return { kind: 'reply', reply: { result }, sendAttempted: true }
  })
  class Transport extends GovernanceTransportService {
    readPublicHealth: GovernanceTransportService['readPublicHealth'] = async () => ({
      kind: 'health',
      reply: { reachable: true, centerId: changedCenter ? 'b'.repeat(32) : centerId, version: '3' },
    })
    exchangeGovernance = exchange
  }
  const factory = (options: Parameters<typeof createClientAssembly>[0]) =>
    createClientAssembly(options, {
      transport: {
        name: 'login-test-transport',
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
    })
  const input: LoginEntryInput = {
    home,
    action: 'login',
    centerName: null,
    loginIdentifier: 'me',
    credentialFile,
    operationId: 'original-login-entry',
  }
  return {
    input,
    owned,
    factory,
    exchange,
    changedCenter: () => {
      changedCenter = true
    },
    unknown: () => {
      unknown = true
    },
    rejected: () => {
      rejected = true
    },
  }
}
it('installs the original issued login in actual tenant state and selects it without a Session', async () => {
  const f = await fixture()
  const result = await runLoginEntry(
    f.input,
    f.owned.catalog,
    new AbortController().signal,
    f.factory,
  )
  expect(result).toMatchObject({
    outcome: {
      kind: 'logged-in',
      binding: { centerId, tenant },
      auth: { login: { kind: 'installed' } },
      selection: 'selected',
    },
    diagnostics: [],
  })
  expect(JSON.stringify(result)).not.toContain(presentation)
  expect(JSON.stringify(result)).not.toContain(secret)
  expect((await f.owned.catalog.readSelection()).selected).toEqual({
    formatVersion: 1,
    centerId,
    tenant,
  })
  const paths = tenantPaths(
    f.input.home,
    checkedTenantBinding({ formatVersion: 1, centerId, tenant }),
  )
  const state = await openClientLocalState(
    { directory: paths.auth },
    { storage: { open: file => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }) } },
  )
  try {
    expect(await state.read()).toMatchObject({
      kind: 'read',
      snapshot: { value: { login: { accountId: account, handle, presentation } } },
    })
  } finally {
    await state.close()
  }
  const sends = f.exchange.mock.calls.filter(
    ([, body]) => (body as { operation: string }).operation === loginOperation,
  )
  expect(sends).toHaveLength(1)
  expect(sends[0]?.[1]).toMatchObject({ payload: { credential: secret } })
  await expect(readFile(join(paths.sessions, 'session.json'))).rejects.toMatchObject({
    code: 'ENOENT',
  })
})
it('registers once and returns its real result without issuing a login or selecting a tenant', async () => {
  const f = await fixture()
  expect(
    await runLoginEntry(
      { ...f.input, action: 'register' },
      f.owned.catalog,
      new AbortController().signal,
      f.factory,
    ),
  ).toMatchObject({
    outcome: {
      kind: 'governance-result',
      report: {
        operation: 'composition.account-registration/v2#S-8',
        remote: { status: 'success', reply: { reply: { result: 'registered' } } },
      },
    },
  })
  expect(f.exchange.mock.calls).toHaveLength(1)
  expect((await f.owned.catalog.readSelection()).selected).toBeNull()
})
it('does not read credentials or send them when the saved center changes', async () => {
  const f = await fixture()
  f.changedCenter()
  await rm(f.input.credentialFile)
  expect(
    await runLoginEntry(f.input, f.owned.catalog, new AbortController().signal, f.factory),
  ).toMatchObject({ outcome: { kind: 'blocked', reason: 'center-mismatch' } })
  expect(f.exchange).not.toHaveBeenCalled()
})
it('does not guess a center when more than one is eligible', async () => {
  const f = await fixture()
  await f.owned.catalog.registerCenter({
    name: 'other',
    center: { centerId: 'b'.repeat(32), endpoint: 'https://other.invalid/', trust: { mode: 'ca' } },
  })
  expect(
    await runLoginEntry(f.input, f.owned.catalog, new AbortController().signal, f.factory),
  ).toMatchObject({ outcome: { kind: 'blocked', reason: 'center-required' } })
  expect(f.exchange).not.toHaveBeenCalled()
})
it('does not silently retry an unknown login or publish a local selection', async () => {
  const f = await fixture()
  f.unknown()
  expect(
    await runLoginEntry(f.input, f.owned.catalog, new AbortController().signal, f.factory),
  ).toMatchObject({
    outcome: { kind: 'governance-result', report: { remote: { status: 'unknown' } } },
  })
  expect(f.exchange.mock.calls).toHaveLength(1)
  expect((await f.owned.catalog.readSelection()).selected).toBeNull()
})
it('preserves the remote login when a competing local tenant selection wins', async () => {
  const f = await fixture()
  vi.spyOn(f.owned.catalog, 'selectTenant').mockResolvedValue('conflict')
  expect(
    await runLoginEntry(f.input, f.owned.catalog, new AbortController().signal, f.factory),
  ).toMatchObject({
    outcome: { kind: 'logged-in', selection: 'conflict', auth: { login: { kind: 'installed' } } },
  })
  expect(
    f.exchange.mock.calls.filter(
      ([, body]) => (body as { operation: string }).operation === loginOperation,
    ),
  ).toHaveLength(1)
})
it('stops before construction or credential access when already cancelled', async () => {
  const f = await fixture(),
    controller = new AbortController(),
    factory = vi.fn(f.factory)
  controller.abort()
  expect(await runLoginEntry(f.input, f.owned.catalog, controller.signal, factory)).toMatchObject({
    outcome: { kind: 'blocked', reason: 'input-cancelled' },
  })
  expect(factory).not.toHaveBeenCalled()
})
