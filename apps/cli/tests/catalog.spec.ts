import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openStorage, type SqlStorage } from '@omne-harness-lite/storage-sql'
import type { ActionReport, GovernanceUse } from '@omne-harness-lite/governance-client-operations'
import { parseAccountId, parseLoginStateId, unwrap } from '@omne-harness-lite/identity-values'
import { isGovernanceCenterId } from '@omne-harness-lite/governance-center-entry'
import { prepareCliCatalog, type CliCatalog, type CapturedCreation } from '../src/catalog.ts'
import { checkedTenantBinding } from '../src/state-layout-values.ts'
import { narrow, StorageUnavailable, type AtomicStorage } from '@omne-harness-lite/storage'

const roots: string[] = []
const stores: SqlStorage[] = []
const catalogs: CliCatalog[] = []
const policy = { maxCenters: 8, maxCreations: 8, maxRecordBytes: 64 * 1024 }
const centerId = 'a'.repeat(32)
if (!isGovernanceCenterId(centerId)) throw new Error('invalid fixture')
const profile = {
  name: '研发中心',
  center: { centerId, endpoint: 'https://center.example.invalid/', trust: { mode: 'ca' as const } },
}
const binding = checkedTenantBinding({
  formatVersion: 1,
  centerId,
  tenant: { organization: 'personal', account: 'owner' },
})
const request: CapturedCreation = {
  login: {
    centerId,
    accountId: unwrap(parseAccountId('owner')),
    loginStateHandle: unwrap(parseLoginStateId('login-owner')),
  },
  name: '研发组',
  creationKey: 'original-key',
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'omne-catalog-'))
  roots.push(root)
  const file = join(root, 'catalog.sqlite')
  const storage = await openStorage({ dialect: 'sqlite', file, synchronous: 'full' })
  stores.push(storage)
  const catalog = await prepareCliCatalog(storage, policy, true)
  catalogs.push(catalog)
  return { file, storage, catalog }
}
afterEach(async () => {
  for (const catalog of catalogs.splice(0)) await catalog.close()
  for (const storage of stores.splice(0)) await storage.close()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
function report(operation: string, result: unknown): ActionReport {
  const reply = { operation, reply: { result } }
  return {
    format: 'governance-client/1',
    actionId: 'action-1',
    action: 'invoke',
    operation,
    origin: request.login,
    admission: { status: 'admitted' },
    remote: { status: 'success', stage: 'operation', sendAttempted: true, reply },
    local: { status: 'installed' },
    view: { source: 'online', data: reply },
    use: 'active',
  }
}
function governanceUse() {
  const run = vi
    .fn<GovernanceUse['run']>()
    .mockResolvedValueOnce(report('capability.organization-governance/v2#S-21', 'new-team'))
    .mockResolvedValueOnce(
      report('capability.organization-governance/v2#S-22', {
        organization: 'new-team',
        organizationKind: 'team',
        name: request.name,
      }),
    )
    .mockResolvedValueOnce(
      report('capability.organization-governance/v2#S-26', {
        standing: 'effective',
        role: 'superAdministrator',
      }),
    )
  const use: GovernanceUse = { run, runPrepared: vi.fn(), close: vi.fn(async () => {}) }
  return { use, run }
}

it('persists center templates and selection across real SQLite reopen', async () => {
  const f = await fixture()
  expect(await f.catalog.listCenters()).toEqual([])
  expect(await f.catalog.registerCenter(profile)).toBe('saved')
  expect(await f.catalog.registerCenter(profile)).toBe('already-saved')
  const snapshot = await f.catalog.readSelection()
  expect(snapshot.selected).toBeNull()
  expect(await f.catalog.selectTenant(snapshot, binding, 'selection-1')).toBe('selected')
  await f.catalog.close()
  await f.storage.close()
  const next = await openStorage({ dialect: 'sqlite', file: f.file, synchronous: 'full' })
  stores.push(next)
  const reopened = await prepareCliCatalog(next, policy, false)
  catalogs.push(reopened)
  expect(await reopened.listCenters()).toEqual([profile])
  expect(await reopened.readSelection()).toEqual({
    ...snapshot,
    revision: snapshot.revision + 1,
    operationId: 'selection-1',
    selected: binding,
  })
})
it('rejects same-name different-center and same-center different-template without overwrite', async () => {
  const f = await fixture()
  await f.catalog.registerCenter(profile)
  expect(
    await f.catalog.registerCenter({
      ...profile,
      center: { ...profile.center, centerId: 'b'.repeat(32) },
    }),
  ).toBe('conflict')
  expect(
    await f.catalog.registerCenter({
      ...profile,
      center: { ...profile.center, endpoint: 'https://other.invalid/' },
    }),
  ).toBe('conflict')
  expect(await f.catalog.listCenters()).toEqual([profile])
})
it('serializes competing names across two actual storage instances', async () => {
  const f = await fixture()
  const next = await openStorage({ dialect: 'sqlite', file: f.file, synchronous: 'full' })
  stores.push(next)
  const second = await prepareCliCatalog(next, policy, false)
  catalogs.push(second)
  const outcomes = await Promise.all([
    f.catalog.registerCenter(profile),
    second.registerCenter({ ...profile, center: { ...profile.center, centerId: 'b'.repeat(32) } }),
  ])
  expect(outcomes.filter(x => x === 'saved')).toHaveLength(1)
  expect(outcomes.filter(x => x === 'conflict')).toHaveLength(1)
  expect(await f.catalog.listCenters()).toHaveLength(1)
})
it('compares exact store and revision for local selection without changing the old binding on conflict', async () => {
  const f = await fixture()
  const original = await f.catalog.readSelection()
  expect(await f.catalog.selectTenant(original, binding, 'select-first')).toBe('selected')
  const another = checkedTenantBinding({
    ...binding,
    tenant: { ...binding.tenant, organization: 'other' },
  })
  expect(await f.catalog.selectTenant(original, another, 'select-late')).toBe('conflict')
  expect(
    await f.catalog.selectTenant(
      { ...original, storeId: 'other-store', revision: 1 },
      another,
      'select-wrong-store',
    ),
  ).toBe('conflict')
  expect((await f.catalog.readSelection()).selected).toEqual(binding)
})
it('keeps the original request, rejects semantic conflict, and never deduplicates by name', async () => {
  const f = await fixture()
  expect(await f.catalog.captureCreation(request)).toBe('captured')
  expect(await f.catalog.captureCreation(request)).toBe('already-captured')
  expect(await f.catalog.captureCreation({ ...request, name: 'other' })).toBe('conflict')
  expect(await f.catalog.captureCreation({ ...request, creationKey: 'another-key' })).toBe(
    'captured',
  )
  expect(await f.catalog.readCreation(request)).toEqual({
    request,
    status: 'prepared',
    result: null,
  })
})
it('gives only one competing caller a remote execution and retains the resulting tenant', async () => {
  const f = await fixture()
  await f.catalog.captureCreation(request)
  const g = governanceUse()
  const outcomes = await Promise.all([
    f.catalog.executeCreation(request, g.use),
    f.catalog.executeCreation(request, g.use),
  ])
  expect(outcomes.filter(x => x.kind === 'recorded')).toHaveLength(1)
  expect(outcomes.filter(x => x.kind === 'existing')).toHaveLength(1)
  expect(g.run).toHaveBeenCalledTimes(3)
  const stored = await f.catalog.readCreation(request)
  expect(stored?.status).toBe('settled')
  expect(stored?.result).toMatchObject({
    kind: 'created',
    tenant: { organization: 'new-team', account: 'owner' },
  })
})
it('refuses remote execution until the exact original request was captured', async () => {
  const f = await fixture()
  const g = governanceUse()
  await expect(f.catalog.executeCreation(request, g.use)).rejects.toMatchObject({
    reason: 'invalid-input',
  })
  await f.catalog.captureCreation(request)
  await expect(
    f.catalog.executeCreation({ ...request, name: 'different' }, g.use),
  ).rejects.toMatchObject({ reason: 'invalid-input' })
  expect(g.run).not.toHaveBeenCalled()
})
it('reopens a submitted unknown without granting another remote execution', async () => {
  const f = await fixture()
  await f.catalog.captureCreation(request)
  const unknown = report('capability.organization-governance/v2#S-21', 'unused')
  const first = governanceUse()
  first.run.mockReset().mockResolvedValue({
    ...unknown,
    remote: { status: 'unknown', stage: 'operation', sendAttempted: true },
    view: { source: 'none' },
  })
  expect((await f.catalog.executeCreation(request, first.use)).kind).toBe('recorded')
  expect((await f.catalog.readCreation(request))?.status).toBe('submitted')
  await f.catalog.close()
  await f.storage.close()
  const next = await openStorage({ dialect: 'sqlite', file: f.file, synchronous: 'full' })
  stores.push(next)
  const reopened = await prepareCliCatalog(next, policy, false)
  catalogs.push(reopened)
  const again = governanceUse()
  expect((await reopened.executeCreation(request, again.use)).kind).toBe('existing')
  expect(again.run).not.toHaveBeenCalled()
})
it('stops admission but holds borrowed storage through remote result settlement', async () => {
  const f = await fixture()
  await f.catalog.captureCreation(request)
  const pending = Promise.withResolvers<ActionReport>()
  const entered = Promise.withResolvers<void>()
  const g = governanceUse()
  g.run
    .mockReset()
    .mockImplementationOnce(() => {
      entered.resolve()
      return pending.promise
    })
    .mockResolvedValueOnce(
      report('capability.organization-governance/v2#S-22', {
        organization: 'new-team',
        organizationKind: 'team',
        name: request.name,
      }),
    )
    .mockResolvedValueOnce(
      report('capability.organization-governance/v2#S-26', {
        standing: 'effective',
        role: 'superAdministrator',
      }),
    )
  const work = f.catalog.executeCreation(request, g.use)
  await entered.promise
  let closed = false
  const close = f.catalog.close().then(() => {
    closed = true
  })
  await Promise.resolve()
  expect(closed).toBe(false)
  await expect(f.catalog.listCenters()).rejects.toMatchObject({ reason: 'closed' })
  pending.resolve(report('capability.organization-governance/v2#S-21', 'new-team'))
  expect((await work).kind).toBe('recorded')
  await close
  const reopened = await prepareCliCatalog(f.storage, policy, false)
  catalogs.push(reopened)
  expect((await reopened.readCreation(request))?.status).toBe('settled')
  expect(g.use.close).not.toHaveBeenCalled()
})
it('does not make unknown space available by deleting original requests at capacity', async () => {
  const f = await fixture()
  const small = await prepareCliCatalog(f.storage, { ...policy, maxCreations: 1 }, false)
  catalogs.push(small)
  await small.captureCreation(request)
  await expect(small.captureCreation({ ...request, creationKey: 'new-key' })).rejects.toMatchObject(
    { reason: 'capacity' },
  )
  expect(await small.readCreation(request)).not.toBeNull()
})

function failingStorage(
  storage: AtomicStorage,
  fault: { before: boolean; after: boolean },
): AtomicStorage {
  return {
    read: fn => storage.read(fn),
    write: fn => storage.write(fn),
    atomic: async fn => {
      if (fault.before) throw new StorageUnavailable('controlled pre-commit failure')
      const result = await storage.atomic(fn)
      if (fault.after) throw new StorageUnavailable('controlled lost commit receipt')
      return result
    },
  }
}
it.each([false, true])(
  'does not send when the original claim receipt is unavailable (committed=%s)',
  async after => {
    const f = await fixture()
    await f.catalog.captureCreation(request)
    const fault = { before: !after, after }
    const subject = await prepareCliCatalog(failingStorage(f.storage, fault), policy, false)
    catalogs.push(subject)
    const g = governanceUse()
    expect(await subject.executeCreation(request, g.use)).toEqual({
      kind: 'unconfirmed',
      creationKey: request.creationKey,
      result: null,
    })
    expect(g.run).not.toHaveBeenCalled()
    expect((await f.catalog.readCreation(request))?.status).toBe(after ? 'submitted' : 'prepared')
  },
)
it('retains a remote result through failed settlement and failed close, then retries storage without sending', async () => {
  const f = await fixture()
  await f.catalog.captureCreation(request)
  const fault = { before: false, after: false }
  const subject = await prepareCliCatalog(failingStorage(f.storage, fault), policy, false)
  catalogs.push(subject)
  const g = governanceUse()
  // Reset the queued sequence so the fault happens only after the claim committed.
  g.run
    .mockReset()
    .mockImplementationOnce(async () => {
      fault.before = true
      return report('capability.organization-governance/v2#S-21', 'new-team')
    })
    .mockResolvedValueOnce(
      report('capability.organization-governance/v2#S-22', {
        organization: 'new-team',
        organizationKind: 'team',
        name: request.name,
      }),
    )
    .mockResolvedValueOnce(
      report('capability.organization-governance/v2#S-26', {
        standing: 'effective',
        role: 'superAdministrator',
      }),
    )
  const outcome = await subject.executeCreation(request, g.use)
  expect(outcome).toMatchObject({ kind: 'unconfirmed', result: { kind: 'created' } })
  expect((await f.catalog.readCreation(request))?.result).toBeNull()
  await expect(subject.close()).rejects.toMatchObject({ reason: 'pending-result' })
  await expect(subject.readSelection()).rejects.toMatchObject({ reason: 'closed' })
  fault.before = false
  await subject.close()
  expect((await f.catalog.readCreation(request))?.result).toEqual(
    outcome.kind === 'unconfirmed' ? outcome.result : null,
  )
  expect(g.run).toHaveBeenCalledTimes(3)
  expect(g.use.close).not.toHaveBeenCalled()
})
it('rejects an unsupported catalog format without changing its contents', async () => {
  const f = await fixture()
  await f.storage.write(tx =>
    narrow<{ cli_catalog_meta: { format_version: number } }>(tx)
      .updateTable('cli_catalog_meta')
      .set({ format_version: 9 })
      .execute(),
  )
  await expect(prepareCliCatalog(f.storage, policy, false)).rejects.toMatchObject({
    reason: 'unsupported-format',
  })
})
it('rejects a stored result assigned to another original account before exposing it', async () => {
  const f = await fixture()
  await f.catalog.captureCreation(request)
  await f.catalog.executeCreation(request, governanceUse().use)
  const record = await f.catalog.readCreation(request)
  if (record?.result?.kind !== 'created') throw new Error('missing created fixture')
  const corrupt = {
    ...record.result,
    tenant: { ...record.result.tenant, account: 'other-account' },
  }
  await f.storage.write(tx =>
    narrow<{ cli_catalog_creations: { result_json: string } }>(tx)
      .updateTable('cli_catalog_creations')
      .set({ result_json: JSON.stringify(corrupt) })
      .execute(),
  )
  await expect(f.catalog.readCreation(request)).rejects.toMatchObject({ reason: 'invalid-record' })
})
it('rejects a settled status paired with an unresolved remote result', async () => {
  const f = await fixture()
  await f.catalog.captureCreation(request)
  const g = governanceUse()
  g.run.mockReset().mockResolvedValue({
    ...report('capability.organization-governance/v2#S-21', 'unused'),
    remote: { status: 'unknown', stage: 'operation', sendAttempted: true },
    view: { source: 'none' },
  })
  await f.catalog.executeCreation(request, g.use)
  await f.storage.write(tx =>
    narrow<{ cli_catalog_creations: { status: string } }>(tx)
      .updateTable('cli_catalog_creations')
      .set({ status: 'settled' })
      .execute(),
  )
  await expect(f.catalog.readCreation(request)).rejects.toMatchObject({ reason: 'invalid-record' })
})
