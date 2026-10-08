import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openStorage, type SqlStorage } from '@omne-harness-lite/storage-sql'
import {
  parseAccountId,
  parseLoginStateId,
  parseTenantId,
  unwrap,
} from '@omne-harness-lite/identity-values'
import { isGovernanceCenterId } from '@omne-harness-lite/governance-center-entry'
import {
  StorageUnavailable,
  type AtomicStorage,
  type StorageUnit,
  type MigrationFragment,
} from '@omne-harness-lite/storage'
import {
  createLocalAdmission,
  admissionMigrations,
  admissionUseMigrations,
  type LocalAdmission,
  type AdmissionSource,
  type AdmissionTarget,
  type AdmissionProbe,
} from '../src/index.ts'

const roots: string[] = []
const stores: SqlStorage[] = []
const owners: LocalAdmission[] = []
const centerId = 'a'.repeat(32)
if (!isGovernanceCenterId(centerId)) throw new Error('invalid fixture')
const source: AdmissionSource = {
  centerId,
  accountId: unwrap(parseAccountId('owner')),
  loginStateHandle: unwrap(parseLoginStateId('login-1')),
}
const tenant = unwrap(parseTenantId({ organization: 'team-a', account: 'owner' }))
const other = unwrap(parseTenantId({ organization: 'team-b', account: 'owner' }))
const target: AdmissionTarget = {
  tenant,
  session: 'session-a',
  purpose: 'startRun',
  operationKey: 'start-1',
  inputPosition: '1',
}
const policy = { maxLogins: 8, maxTickets: 16, maxRecordBytes: 4096 }
async function migrate(storage: AtomicStorage, fragments: readonly MigrationFragment[]) {
  for (const fragment of fragments) await storage.write(tx => fragment.migration.up(tx.db))
}
async function fixture(
  probe: AdmissionProbe = { verify: vi.fn(async () => ({ kind: 'valid' as const })) },
) {
  const root = await mkdtemp(join(tmpdir(), 'omne-admission-'))
  roots.push(root)
  const file = join(root, 'admission.sqlite')
  const storage = await openStorage({ dialect: 'sqlite', file, synchronous: 'full' })
  stores.push(storage)
  const tenantStorage = await openStorage({
    dialect: 'sqlite',
    file: join(root, 'tenant.sqlite'),
    synchronous: 'full',
  })
  stores.push(tenantStorage)
  await migrate(storage, admissionMigrations)
  await migrate(tenantStorage, admissionUseMigrations)
  const ownedProbe: AdmissionProbe = {
    verify: async (candidate, requested) =>
      requested.operationKey === 'fixture-member'
        ? { kind: 'memberValid' }
        : probe.verify(candidate, requested),
  }
  const owner = await createLocalAdmission(storage, ownedProbe, policy)
  owners.push(owner)
  const qualification = await owner.reserve(source, {
    tenant,
    session: null,
    purpose: 'createSession',
    operationKey: 'fixture-member',
    inputPosition: null,
  })
  await owner.query(qualification.ticket)
  await owner.consume(qualification.ticket, tenantStorage, async () => 'fixture-qualification')
  return { root, file, storage, tenantStorage, owner, probe }
}
afterEach(async () => {
  vi.restoreAllMocks()
  for (const owner of owners.splice(0)) await owner.close().catch(() => undefined)
  for (const store of stores.splice(0)) await store.close()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => {
    resolve = r
  })
  return { promise, resolve }
}

it('durably reserves the original target before IO and recognizes it on another root connection', async () => {
  const f = await fixture()
  const first = await f.owner.reserve(source, target)
  expect(first.state).toBe('waiting')
  expect(f.probe.verify).not.toHaveBeenCalled()
  const secondStore = await openStorage({ dialect: 'sqlite', file: f.file, synchronous: 'full' })
  stores.push(secondStore)
  const second = await createLocalAdmission(secondStore, f.probe, policy)
  owners.push(second)
  expect(await second.reserve(source, target)).toEqual(first)
  expect(await second.query(first.ticket)).toMatchObject({ state: 'ready' })
  expect(f.probe.verify).toHaveBeenCalledExactlyOnceWith(source, target)
})
it('serializes the query and original tenant consumption before activating the next demand', async () => {
  const pending = deferred<{ kind: 'valid' }>()
  const verify = vi.fn(async () => pending.promise)
  const f = await fixture({ verify })
  const a = await f.owner.reserve(source, target)
  const b = await f.owner.reserve(source, {
    ...target,
    tenant: other,
    session: 'session-b',
    operationKey: 'start-2',
  })
  const query = f.owner.query(a.ticket)
  await vi.waitFor(() => expect(verify).toHaveBeenCalledTimes(1))
  expect((await f.owner.query(b.ticket)).state).toBe('waiting')
  pending.resolve({ kind: 'valid' })
  await query
  expect((await f.owner.query(b.ticket)).state).toBe('waiting')
  expect(await f.owner.consume(a.ticket, f.tenantStorage, async () => 'receipt-1')).toEqual({
    kind: 'consumed',
    receipt: 'receipt-1',
  })
  expect((await f.owner.query(b.ticket)).state).toBe('ready')
  expect(verify).toHaveBeenCalledTimes(2)
})
it('absorbs a trusted login rejection across tenants and permits only a genuinely new handle', async () => {
  const verify = vi
    .fn<AdmissionProbe['verify']>()
    .mockResolvedValueOnce({ kind: 'valid' })
    .mockResolvedValueOnce({ kind: 'rejected' })
    .mockResolvedValue({ kind: 'valid' })
  const f = await fixture({ verify })
  const a = await f.owner.reserve(source, target)
  await f.owner.query(a.ticket)
  await f.owner.consume(a.ticket, f.tenantStorage, async () => 'receipt-1')
  const b = await f.owner.reserve(source, { ...target, tenant: other, operationKey: 'start-2' })
  expect((await f.owner.query(b.ticket)).state).toBe('rejected')
  await expect(
    f.owner.withCurrent(source, tenant, f.tenantStorage, async () => 'wrong'),
  ).rejects.toMatchObject({ reason: 'denied' })
  await expect(
    f.owner.reserve(source, { ...target, operationKey: 'start-3' }),
  ).rejects.toMatchObject({ reason: 'denied' })
  const fresh = await f.owner.reserve(
    { ...source, loginStateHandle: unwrap(parseLoginStateId('login-new')) },
    { ...target, operationKey: 'start-new' },
  )
  expect((await f.owner.query(fresh.ticket)).state).toBe('ready')
})
it('leaves an owner-lost query pending after reopen and never sends its successor', async () => {
  const f = await fixture({
    verify: vi.fn(async () => {
      throw new Error('source-lost')
    }),
  })
  const a = await f.owner.reserve(source, target)
  await expect(f.owner.query(a.ticket)).rejects.toThrow('source-lost')
  const secondStore = await openStorage({ dialect: 'sqlite', file: f.file, synchronous: 'full' })
  stores.push(secondStore)
  const verify = vi.fn<AdmissionProbe['verify']>().mockResolvedValue({ kind: 'valid' })
  const reopened = await createLocalAdmission(secondStore, { verify }, policy)
  owners.push(reopened)
  const b = await reopened.reserve(source, { ...target, tenant: other, operationKey: 'start-2' })
  expect((await reopened.query(a.ticket)).state).toBe('querying')
  expect((await reopened.query(b.ticket)).state).toBe('waiting')
  expect(verify).not.toHaveBeenCalled()
  await expect(f.owner.close()).rejects.toMatchObject({ reason: 'pending-result' })
})
it('does not perform IO when the reservation receipt is unavailable', async () => {
  const f = await fixture()
  const faulty = f.storage
  const original = faulty.atomic.bind(faulty)
  vi.spyOn(faulty, 'atomic').mockImplementation(async fn => {
    await original(fn)
    throw new StorageUnavailable('unconfirmed')
  })
  const owner = await createLocalAdmission(faulty, f.probe, policy)
  owners.push(owner)
  await expect(owner.reserve(source, target)).rejects.toBeInstanceOf(StorageUnavailable)
  expect(f.probe.verify).not.toHaveBeenCalled()
  vi.restoreAllMocks()
  expect((await f.owner.reserve(source, target)).state).toBe('waiting')
})
it('atomically records exact ticket use with the tenant result and returns it without restaging', async () => {
  const f = await fixture()
  const a = await f.owner.reserve(source, target)
  await f.owner.query(a.ticket)
  const stage = vi.fn(async (_unit: StorageUnit, _guard: unknown) => 'original-receipt')
  expect(await f.owner.consume(a.ticket, f.tenantStorage, stage)).toEqual({
    kind: 'consumed',
    receipt: 'original-receipt',
  })
  expect(await f.owner.consume(a.ticket, f.tenantStorage, stage)).toEqual({
    kind: 'consumed',
    receipt: 'original-receipt',
  })
  expect(stage).toHaveBeenCalledTimes(1)
})
it('does not release the root order while the tenant write is in flight', async () => {
  const f = await fixture()
  const a = await f.owner.reserve(source, target)
  await f.owner.query(a.ticket)
  const secondStore = await openStorage({ dialect: 'sqlite', file: f.file, synchronous: 'full' })
  stores.push(secondStore)
  const next = await createLocalAdmission(secondStore, f.probe, policy)
  owners.push(next)
  const entered = deferred<void>()
  const release = deferred<void>()
  let observed = false
  const consuming = f.owner.consume(a.ticket, f.tenantStorage, async () => {
    entered.resolve()
    await release.promise
    return 'receipt'
  })
  await entered.promise
  const reserve = next.reserve(source, { ...target, operationKey: 'second' }).then(x => {
    observed = true
    return x
  })
  await new Promise<void>(r => setTimeout(r, 30))
  expect(observed).toBe(false)
  release.resolve()
  await consuming
  await reserve
})
it('rolls back tenant use and permits a bounded original retry after a staging failure', async () => {
  const f = await fixture()
  const a = await f.owner.reserve(source, target)
  await f.owner.query(a.ticket)
  await expect(
    f.owner.consume(a.ticket, f.tenantStorage, async () => {
      throw new Error('stage-failed')
    }),
  ).rejects.toThrow('stage-failed')
  expect((await f.owner.read(a.ticket)).state).toBe('ready')
  expect(await f.owner.consume(a.ticket, f.tenantStorage, async () => 'retried')).toEqual({
    kind: 'consumed',
    receipt: 'retried',
  })
})
it('does not repeat staging after a committed tenant write with an unavailable receipt', async () => {
  const f = await fixture()
  const a = await f.owner.reserve(source, target)
  await f.owner.query(a.ticket)
  let fail = true
  const faulty = f.tenantStorage
  const original = faulty.atomic.bind(faulty)
  vi.spyOn(faulty, 'atomic').mockImplementation(async fn => {
    const value = await original(fn)
    if (fail) {
      fail = false
      throw new StorageUnavailable('unknown')
    }
    return value
  })
  const stage = vi.fn(async () => 'actual-receipt')
  expect(await f.owner.consume(a.ticket, faulty, stage)).toMatchObject({
    kind: 'unknownCommit',
    ticket: a.ticket,
  })
  expect((await f.owner.read(a.ticket)).state).toBe('ready')
  expect(await f.owner.consume(a.ticket, faulty, stage)).toEqual({
    kind: 'consumed',
    receipt: 'actual-receipt',
  })
  expect(stage).toHaveBeenCalledTimes(1)
})
it('rejects copied guards, wrong sources, units and tenants, and invalidates the live guard on exit', async () => {
  const f = await fixture()
  const a = await f.owner.reserve(source, target)
  await f.owner.query(a.ticket)
  let captured!: Parameters<LocalAdmission['authorizeIn']>[1]
  let originalUnit!: StorageUnit
  await f.owner.consume(a.ticket, f.tenantStorage, async (unit, guard) => {
    captured = guard
    originalUnit = unit
    expect(f.owner.authorizeIn(unit, guard, source, tenant)).toBe(true)
    expect(f.owner.authorizeIn(unit, { ...guard }, source, tenant)).toBe(false)
    expect(f.owner.authorizeIn(unit, guard, source, other)).toBe(false)
    expect(
      f.owner.authorizeIn(
        unit,
        guard,
        { ...source, loginStateHandle: unwrap(parseLoginStateId('different')) },
        tenant,
      ),
    ).toBe(false)
    return 'receipt'
  })
  expect(f.owner.authorizeIn(originalUnit, captured, source, tenant)).toBe(false)
})
it('bounds durable demand and rejects mismatched account input before any IO', async () => {
  const f = await fixture()
  const owner = await createLocalAdmission(f.storage, f.probe, { ...policy, maxTickets: 2 })
  owners.push(owner)
  await owner.reserve(source, target)
  await expect(owner.reserve(source, { ...target, operationKey: 'second' })).rejects.toMatchObject({
    reason: 'capacity',
  })
  await expect(
    owner.reserve(source, {
      ...target,
      tenant: unwrap(parseTenantId({ organization: 'team', account: 'intruder' })),
    }),
  ).rejects.toMatchObject({ reason: 'invalid-input' })
  expect(f.probe.verify).not.toHaveBeenCalled()
})
it('ends an explicitly unavailable query without granting a new Run and then advances the next demand', async () => {
  const verify = vi
    .fn<AdmissionProbe['verify']>()
    .mockResolvedValueOnce({ kind: 'unavailable' })
    .mockResolvedValue({ kind: 'valid' })
  const f = await fixture({ verify })
  const a = await f.owner.reserve(source, target)
  const b = await f.owner.reserve(source, { ...target, operationKey: 'next' })
  expect((await f.owner.query(a.ticket)).state).toBe('unavailable')
  expect(await f.owner.consume(a.ticket, f.tenantStorage, async () => 'wrong')).toEqual({
    kind: 'blocked',
    state: 'unavailable',
  })
  expect((await f.owner.query(b.ticket)).state).toBe('ready')
})

it('retains a completed probe result through unknown settlement and retries storage without network IO', async () => {
  const f = await fixture()
  const a = await f.owner.reserve(source, target)
  const atomic = f.storage.atomic.bind(f.storage)
  let calls = 0
  vi.spyOn(f.storage, 'atomic').mockImplementation(async fn => {
    calls += 1
    const value = await atomic(fn)
    if (calls === 2) throw new StorageUnavailable('settlement-unknown')
    return value
  })
  await expect(f.owner.query(a.ticket)).rejects.toBeInstanceOf(StorageUnavailable)
  expect(f.probe.verify).toHaveBeenCalledTimes(1)
  expect((await f.owner.query(a.ticket)).state).toBe('ready')
  expect(f.probe.verify).toHaveBeenCalledTimes(1)
})
it('recognizes tenant use after an outer root failure without repeating staging', async () => {
  const f = await fixture()
  const a = await f.owner.reserve(source, target)
  await f.owner.query(a.ticket)
  const atomic = f.storage.atomic.bind(f.storage)
  let fail = true
  vi.spyOn(f.storage, 'atomic').mockImplementation(async fn => {
    const value = await atomic(fn)
    if (fail) {
      fail = false
      throw new StorageUnavailable('root-unknown')
    }
    return value
  })
  const stage = vi.fn(async () => 'tenant-receipt')
  expect(await f.owner.consume(a.ticket, f.tenantStorage, stage)).toMatchObject({
    kind: 'unknownCommit',
  })
  expect((await f.owner.read(a.ticket)).state).toBe('ready')
  expect(await f.owner.consume(a.ticket, f.tenantStorage, stage)).toEqual({
    kind: 'consumed',
    receipt: 'tenant-receipt',
  })
  expect(stage).toHaveBeenCalledTimes(1)
})
it('drains owned queries before closing and rejects new admission immediately', async () => {
  const gate = deferred<{ kind: 'valid' }>()
  const verify = vi.fn(async () => gate.promise)
  const f = await fixture({ verify })
  const a = await f.owner.reserve(source, target)
  const querying = f.owner.query(a.ticket)
  await vi.waitFor(() => expect(verify).toHaveBeenCalledTimes(1))
  let ended = false
  const closing = f.owner.close().then(() => {
    ended = true
  })
  await expect(f.owner.reserve(source, { ...target, operationKey: 'new' })).rejects.toMatchObject({
    reason: 'closed',
  })
  expect(ended).toBe(false)
  gate.resolve({ kind: 'valid' })
  await querying
  await closing
  expect(ended).toBe(true)
  await expect(f.storage.read(async () => 'still-borrowed')).resolves.toBe('still-borrowed')
})
it('keeps finite older demand ahead of every later registration', async () => {
  const f = await fixture()
  const a = await f.owner.reserve(source, target)
  const b = await f.owner.reserve(source, { ...target, operationKey: 'second' })
  const c = await f.owner.reserve(source, { ...target, operationKey: 'third' })
  expect((await f.owner.query(c.ticket)).state).toBe('waiting')
  await f.owner.query(a.ticket)
  await f.owner.consume(a.ticket, f.tenantStorage, async () => 'first')
  const d = await f.owner.reserve(source, { ...target, operationKey: 'fourth' })
  expect((await f.owner.query(d.ticket)).state).toBe('waiting')
  expect((await f.owner.query(b.ticket)).state).toBe('ready')
})
it('rejects a ticket with another root, target or sequence and never invokes its callback', async () => {
  const f = await fixture()
  const a = await f.owner.reserve(source, target)
  await f.owner.query(a.ticket)
  const stage = vi.fn(async () => 'wrong')
  for (const ticket of [
    { ...a.ticket, root: 'different' },
    { ...a.ticket, sequence: (BigInt(a.ticket.sequence) + 1n).toString() },
    { ...a.ticket, target: { ...target, tenant: other } },
  ]) {
    await expect(f.owner.consume(ticket, f.tenantStorage, stage)).rejects.toMatchObject({
      reason: 'denied',
    })
  }
  expect(stage).not.toHaveBeenCalled()
})

const sessionTarget: AdmissionTarget = {
  tenant,
  session: null,
  purpose: 'createSession',
  operationKey: 'create-session',
  inputPosition: null,
}
it('keeps member visibility separate from a later login rejection', async () => {
  const verify = vi
    .fn<AdmissionProbe['verify']>()
    .mockResolvedValueOnce({ kind: 'memberValid' })
    .mockResolvedValueOnce({ kind: 'rejected' })
  const f = await fixture({ verify })
  const created = await f.owner.reserve(source, sessionTarget)
  expect((await f.owner.query(created.ticket)).state).toBe('ready')
  await f.owner.consume(created.ticket, f.tenantStorage, async () => 'created')
  const run = await f.owner.reserve(source, target)
  expect((await f.owner.query(run.ticket)).state).toBe('rejected')
  await expect(
    f.owner.withMember(source, tenant, f.tenantStorage, async () => 'visible'),
  ).resolves.toBe('visible')
  await expect(
    f.owner.withCurrent(source, tenant, f.tenantStorage, async () => 'write'),
  ).rejects.toMatchObject({ reason: 'denied' })
})
it('never turns an effective login into restored member qualification', async () => {
  const verify = vi
    .fn<AdmissionProbe['verify']>()
    .mockResolvedValueOnce({ kind: 'memberRejected' })
    .mockResolvedValueOnce({ kind: 'valid' })
  const f = await fixture({ verify })
  const creation = await f.owner.reserve(source, sessionTarget)
  expect((await f.owner.query(creation.ticket)).state).toBe('memberRejected')
  const run = await f.owner.reserve(source, target)
  expect((await f.owner.query(run.ticket)).state).toBe('ready')
  await expect(
    f.owner.withMember(source, tenant, f.tenantStorage, async () => 'wrong'),
  ).rejects.toMatchObject({ reason: 'denied' })
  const stage = vi.fn(async () => 'wrong')
  await expect(f.owner.consume(run.ticket, f.tenantStorage, stage)).rejects.toMatchObject({
    reason: 'denied',
  })
  expect(stage).not.toHaveBeenCalled()
})
it('serializes member observations across handles and allows a later genuine effective restoration', async () => {
  const pending = deferred<{ kind: 'memberRejected' }>()
  const verify = vi
    .fn<AdmissionProbe['verify']>()
    .mockImplementationOnce(async () => pending.promise)
    .mockResolvedValue({ kind: 'memberValid' })
  const f = await fixture({ verify })
  const a = await f.owner.reserve(source, sessionTarget)
  const freshSource = { ...source, loginStateHandle: unwrap(parseLoginStateId('fresh-login')) }
  const b = await f.owner.reserve(freshSource, { ...sessionTarget, operationKey: 'fresh-create' })
  const first = f.owner.query(a.ticket)
  void first.catch(() => undefined)
  await vi.waitFor(() => expect(verify).toHaveBeenCalledTimes(1))
  expect((await f.owner.query(b.ticket)).state).toBe('waiting')
  expect(verify).toHaveBeenCalledTimes(1)
  pending.resolve({ kind: 'memberRejected' })
  await first
  await expect(
    f.owner.withMember(freshSource, tenant, f.tenantStorage, async () => 'hidden'),
  ).rejects.toMatchObject({ reason: 'denied' })
  expect((await f.owner.query(b.ticket)).state).toBe('ready')
  await f.owner.consume(b.ticket, f.tenantStorage, async () => 'restored')
  await expect(
    f.owner.withMember(freshSource, tenant, f.tenantStorage, async () => 'visible'),
  ).resolves.toBe('visible')
})
it('terminates every waiting relation of a rejected login instead of permanently occupying the member queue head', async () => {
  const pending = deferred<{ kind: 'rejected' }>()
  const verify = vi
    .fn<AdmissionProbe['verify']>()
    .mockImplementationOnce(async () => pending.promise)
    .mockResolvedValue({ kind: 'memberValid' })
  const f = await fixture({ verify })
  const active = await f.owner.reserve(source, target)
  const wait = await f.owner.reserve(source, sessionTarget)
  const fresh = await f.owner.reserve(
    { ...source, loginStateHandle: unwrap(parseLoginStateId('fresh-login')) },
    { ...sessionTarget, operationKey: 'new-create' },
  )
  const querying = f.owner.query(active.ticket)
  void querying.catch(() => undefined)
  await vi.waitFor(() => expect(verify).toHaveBeenCalledTimes(1))
  expect((await f.owner.query(wait.ticket)).state).toBe('waiting')
  pending.resolve({ kind: 'rejected' })
  await querying
  expect((await f.owner.read(wait.ticket)).state).toBe('rejected')
  expect((await f.owner.query(fresh.ticket)).state).toBe('ready')
})
it('retains a lost member observation across new handles and blocks reading or new Run consumption', async () => {
  const verify = vi
    .fn<AdmissionProbe['verify']>()
    .mockRejectedValue(new Error('member-source-lost'))
  const f = await fixture({ verify })
  const a = await f.owner.reserve(source, sessionTarget)
  await expect(f.owner.query(a.ticket)).rejects.toThrow('member-source-lost')
  const fresh = { ...source, loginStateHandle: unwrap(parseLoginStateId('fresh-login')) }
  const next = await f.owner.reserve(fresh, { ...sessionTarget, operationKey: 'new-create' })
  expect((await f.owner.query(next.ticket)).state).toBe('waiting')
  await expect(
    f.owner.withMember(fresh, tenant, f.tenantStorage, async () => 'wrong'),
  ).rejects.toMatchObject({ reason: 'denied' })
  expect(verify).toHaveBeenCalledTimes(1)
})

it('ends an unused ready ticket only after proving its tenant use absent under the root order', async () => {
  const f = await fixture()
  const a = await f.owner.reserve(source, target)
  await f.owner.query(a.ticket)
  const next = await f.owner.reserve(source, { ...target, operationKey: 'next' })
  await expect(
    f.owner.consume(a.ticket, f.tenantStorage, async () => {
      throw new Error('definition-failed')
    }),
  ).rejects.toThrow('definition-failed')
  expect(await f.owner.abandon(a.ticket, f.tenantStorage)).toEqual({ kind: 'notUsed' })
  expect((await f.owner.query(next.ticket)).state).toBe('ready')
  expect(await f.owner.consume(a.ticket, f.tenantStorage, async () => 'wrong')).toEqual({
    kind: 'blocked',
    state: 'notUsed',
  })
})
it('never abandons a committed tenant use whose receipt was unavailable', async () => {
  const f = await fixture()
  const a = await f.owner.reserve(source, target)
  await f.owner.query(a.ticket)
  const atomic = f.tenantStorage.atomic.bind(f.tenantStorage)
  let fail = true
  vi.spyOn(f.tenantStorage, 'atomic').mockImplementation(async fn => {
    const value = await atomic(fn)
    if (fail) {
      fail = false
      throw new StorageUnavailable('unknown')
    }
    return value
  })
  const stage = vi.fn(async () => 'actual')
  expect(await f.owner.consume(a.ticket, f.tenantStorage, stage)).toHaveProperty(
    'kind',
    'unknownCommit',
  )
  expect(await f.owner.abandon(a.ticket, f.tenantStorage)).toEqual({
    kind: 'consumed',
    receipt: 'actual',
  })
  expect((await f.owner.read(a.ticket)).state).toBe('consumed')
  expect(stage).toHaveBeenCalledTimes(1)
})
it('does not abandon an unfinished owned query by assuming that its tenant use is absent', async () => {
  const pending = deferred<{ kind: 'valid' }>()
  const verify = vi.fn(async () => pending.promise)
  const f = await fixture({ verify })
  const a = await f.owner.reserve(source, target)
  const querying = f.owner.query(a.ticket)
  await vi.waitFor(() => expect(verify).toHaveBeenCalledTimes(1))
  try {
    expect(await f.owner.abandon(a.ticket, f.tenantStorage)).toEqual({
      kind: 'blocked',
      state: 'querying',
    })
  } finally {
    pending.resolve({ kind: 'valid' })
    await querying
  }
})
