import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { composeMigrations, type SnapshotMaintenance } from '@omne-harness-lite/storage'
import { instantFromEpochMs } from '@omne-harness-lite/offer-expiry'
import {
  createUpgradeGuard,
  openSnapshotInspection,
  openStorage,
} from '@omne-harness-lite/storage-sql'
import { governanceCenterMigrations } from '../src/center-id/migrations.ts'
import { governanceCenterSnapshotCheck } from '../src/center-id/snapshot.ts'
import { OnlineMaintenance } from '../src/maintenance/online.ts'
import { createOfflineMaintenance } from '../src/maintenance/offline.ts'
import { BackupInputFile } from '../src/maintenance/input.ts'
import { metadataBytes, type Metadata } from '../src/maintenance/metadata.ts'
import { MaintenanceDirectory } from '../src/maintenance/publication.ts'

const faults = vi.hoisted(() => ({ closePath: '', unlinkCode: '' }))
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args)
      const close = handle.close.bind(handle)
      const path = String(args[0])
      handle.close = async () => {
        if (path === faults.closePath)
          throw Object.assign(new Error('injected close failure'), { code: 'EIO' })
        await close()
      }
      return handle
    },
    unlink: async (...args: Parameters<typeof actual.unlink>) => {
      if (faults.unlinkCode && String(args[0]).includes('/export-'))
        throw Object.assign(new Error('injected unlink failure'), { code: faults.unlinkCode })
      return actual.unlink(...args)
    },
  }
})

const cleanup: (() => Promise<void>)[] = []
const centerId = '0123456789abcdef0123456789abcdef'
async function fixture(identity = centerId) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-maintenance-operations-')))
  const backups = join(root, 'backups')
  const workDirectory = join(backups, '.quarantine')
  await mkdir(backups, { mode: 0o700 })
  const guard = createUpgradeGuard()
  const storage = await openStorage({
    dialect: 'sqlite',
    file: join(root, 'center.sqlite'),
    migrations: composeMigrations(governanceCenterMigrations),
    upgrade: { guard, checks: [] },
    maintenance: { workDirectory, onClosed() {} },
  })
  await storage.write(tx =>
    tx.db
      .updateTable('governance_center')
      .set({ center_id: identity })
      .execute()
      .then(() => undefined),
  )
  await guard.confirm()
  if (storage.maintenance === undefined) throw new Error('missing source maintenance')
  let now = Date.parse('2026-09-26T00:00:00.000Z')
  const clock = {
    now() {
      const parsed = instantFromEpochMs(now)
      if (!('ok' in parsed)) throw new Error('bad fixture time')
      return parsed.ok
    },
  }
  const report = vi.fn()
  const onClosed = vi.fn()
  const format = {
    migrationNames: ['0001_governance_center'],
    snapshotChecks: [governanceCenterSnapshotCheck],
  }
  let afterExport: (() => Promise<void>) | undefined
  const ownedSource = storage.maintenance
  const source: SnapshotMaintenance = {
    run: (fn, options) =>
      ownedSource.run(
        session =>
          fn({
            ...session,
            get cancelled() {
              return session.cancelled
            },
            snapshot: use =>
              session.snapshot(async view => {
                const value = await use(view)
                await afterExport?.()
                return value
              }),
          }),
        options,
      ),
  }
  const online = new OnlineMaintenance({
    ...format,
    source,
    clock,
    backupDirectory: backups,
    workDirectory,
    sourceBuildId: 'a'.repeat(64),
    report,
    onClosed,
  })
  online.serving(identity)
  const inspection = await openSnapshotInspection(join(root, '.offline'))
  const offline = createOfflineMaintenance({
    ...format,
    inspection,
    workDirectory: join(root, '.offline'),
    report,
  })
  cleanup.push(async () => {
    await online.close()
    await inspection.close()
    await storage.close()
    await rm(root, { recursive: true, force: true })
  })
  return {
    root,
    backups,
    online,
    offline,
    inspection,
    storage,
    report,
    onClosed,
    afterExport(fn: () => Promise<void>) {
      afterExport = fn
    },
    advance(ms: number) {
      now += ms
    },
  }
}
afterEach(async () => {
  faults.closePath = ''
  faults.unlinkCode = ''
  vi.restoreAllMocks()
  for (const fn of cleanup.splice(0).reverse()) await fn()
})

it('backs up online, verifies offline, and restores identical bytes with business closed', async () => {
  const { root, backups, online, offline, storage } = await fixture()
  expect(await online.backupStatus({})).toEqual({
    status: 'observed',
    health: 'missing',
    latest: null,
    invalidCount: 0,
  })
  const result = await online.backup({ onlyIfDue: true })
  expect(result.status).toBe('completed')
  if (result.status !== 'completed') throw new Error('backup failed')
  const sourceLocation = join(backups, result.backup.fileName)
  expect(await offline.verify({ sourceLocation })).toEqual({
    status: 'verified',
    metadata: result.backup.metadata,
    businessOpen: false,
  })
  const targetLocation = join(root, 'restored')
  expect(await offline.restoreIsolated({ sourceLocation, targetLocation })).toEqual({
    status: 'restored-isolated',
    metadata: result.backup.metadata,
    targetLocation,
    businessOpen: false,
  })
  expect(await readFile(join(targetLocation, 'data.omne-backup'))).toEqual(
    await readFile(sourceLocation),
  )
  expect(await offline.restoreIsolated({ sourceLocation, targetLocation })).toEqual({
    status: 'target-exists',
  })
  const empty = join(root, 'already-empty')
  await mkdir(empty, { mode: 0o700 })
  expect(await offline.restoreIsolated({ sourceLocation, targetLocation: empty })).toEqual({
    status: 'target-exists',
  })
  expect(
    await storage.read(tx => tx.db.selectFrom('governance_center').selectAll().execute()),
  ).toEqual([{ slot: 'center', center_id: centerId }])
  expect(
    (await readdir(join(backups, '.quarantine'))).filter(
      name => name.startsWith('task-') || name.startsWith('export-'),
    ),
  ).toEqual([])
})

it('uses 20h due and strictly greater than 24h overdue, with deterministic name ties', async () => {
  const { backups, online, advance } = await fixture()
  const result = await online.backup({ onlyIfDue: false })
  if (result.status !== 'completed') throw new Error('backup failed')
  const first = result.backup
  const smallest = `${'0'.repeat(32)}.omne-backup`
  await writeFile(join(backups, smallest), await readFile(join(backups, first.fileName)), {
    mode: 0o600,
  })
  advance(72_000_000 - 1)
  expect(await online.backup({ onlyIfDue: true })).toMatchObject({
    status: 'not-due',
    backup: { fileName: smallest },
  })
  advance(1)
  expect((await online.backup({ onlyIfDue: true })).status).toBe('completed')
  advance(86_400_000)
  expect(await online.backupStatus({})).toMatchObject({ status: 'observed', health: 'current' })
  advance(1)
  expect(await online.backupStatus({})).toMatchObject({ status: 'observed', health: 'overdue' })
})

it('counts known bad entries and ignores other names, while a capacity refusal is not missing', async () => {
  const { backups, online } = await fixture()
  await writeFile(join(backups, 'ignore-me'), 'irrelevant')
  await writeFile(join(backups, `${'1'.repeat(32)}.omne-backup`), 'broken', { mode: 0o600 })
  await mkdir(join(backups, `${'2'.repeat(32)}.omne-backup`), { mode: 0o700 })
  await symlink('ignore-me', join(backups, `${'3'.repeat(32)}.omne-backup`))
  expect(await online.backupStatus({})).toEqual({
    status: 'observed',
    health: 'missing',
    latest: null,
    invalidCount: 3,
  })
  for (let i = 0; i < 254; i++)
    await writeFile(join(backups, `${i.toString(16).padStart(32, '0')}.omne-backup`), 'broken', {
      mode: 0o600,
    })
  expect(await online.backupStatus({})).toEqual({ status: 'capacity' })
})

it('preserves an uncertain published backup, then permits explicit durability confirmation', async () => {
  const { backups, online } = await fixture()
  const sync = vi
    .spyOn(MaintenanceDirectory.prototype, 'confirm')
    .mockRejectedValueOnce(Object.assign(new Error('injected fsync failure'), { code: 'EIO' }))
  const result = await online.backup({ onlyIfDue: false })
  expect(result.status).toBe('outcome-unknown')
  if (result.status !== 'outcome-unknown' || result.fileName === null)
    throw new Error('missing uncertain output identity')
  expect((await readFile(join(backups, result.fileName))).length).toBeGreaterThan(0)
  sync.mockRestore()
  expect(await online.backupStatus({})).toMatchObject({
    status: 'observed',
    health: 'current',
    latest: { fileName: result.fileName },
  })
})

it('does not fall back or create a new backup after a candidate confirmation fails', async () => {
  const { backups, online } = await fixture()
  expect((await online.backup({ onlyIfDue: false })).status).toBe('completed')
  vi.spyOn(BackupInputFile.prototype, 'confirm').mockRejectedValue(
    Object.assign(new Error('injected sync failure'), { code: 'EIO' }),
  )
  expect((await online.backupStatus({})).status).toBe('outcome-unknown')
  expect((await online.backup({ onlyIfDue: true })).status).toBe('outcome-unknown')
  expect((await readdir(backups)).filter(name => name.endsWith('.omne-backup'))).toHaveLength(1)
})

it('refuses future current-center time while malformed or foreign metadata cannot become current', async () => {
  const { backups, online, advance } = await fixture()
  const result = await online.backup({ onlyIfDue: false })
  if (result.status !== 'completed') throw new Error('backup failed')
  advance(-1)
  expect(await online.backupStatus({})).toEqual({ status: 'unavailable' })
  // Header identity alone cannot relabel the data's owner identity.
  const path = join(backups, result.backup.fileName)
  const bytes = await readFile(path)
  const originalHeader = metadataBytes(result.backup.metadata)
  const changed: Metadata = { ...result.backup.metadata, centerId: 'f'.repeat(32) }
  await writeFile(
    path,
    Buffer.concat([metadataBytes(changed), bytes.subarray(originalHeader.length)]),
  )
  expect(await online.backupStatus({})).toEqual({
    status: 'observed',
    health: 'missing',
    latest: null,
    invalidCount: 1,
  })
})

it('keeps the slot and close pending until a running check really ends', async () => {
  const { online, onClosed } = await fixture()
  let release!: () => void
  let entered!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  const ready = new Promise<void>(resolve => {
    entered = resolve
  })
  const original = MaintenanceDirectory.prototype.stable
  vi.spyOn(MaintenanceDirectory.prototype, 'stable').mockImplementationOnce(async function (
    this: MaintenanceDirectory,
  ) {
    entered()
    await gate
    return original.call(this)
  })
  const work = online.backupStatus({})
  await ready
  expect(await online.backupStatus({})).toEqual({ status: 'busy' })
  const closing = online.close()
  expect(onClosed).not.toHaveBeenCalled()
  release()
  expect(await work).toEqual({ status: 'cancelled' })
  await closing
  expect(onClosed).toHaveBeenCalledWith('clean')
})

it('filters a completely valid foreign-center future backup before evaluating due time', async () => {
  const current = await fixture()
  const foreign = await fixture('f'.repeat(32))
  foreign.advance(86_400_000)
  const result = await foreign.online.backup({ onlyIfDue: false })
  if (result.status !== 'completed') throw new Error('foreign backup failed')
  await writeFile(
    join(current.backups, result.backup.fileName),
    await readFile(join(foreign.backups, result.backup.fileName)),
    { mode: 0o600 },
  )
  expect(await current.online.backupStatus({})).toEqual({
    status: 'observed',
    health: 'missing',
    latest: null,
    invalidCount: 1,
  })
  expect((await current.online.backup({ onlyIfDue: true })).status).toBe('completed')
})

it('retains restored output when confirmation of the new target parent fails', async () => {
  const { root, backups, online, offline } = await fixture()
  const result = await online.backup({ onlyIfDue: false })
  if (result.status !== 'completed') throw new Error('backup failed')
  const sourceLocation = join(backups, result.backup.fileName)
  const targetLocation = join(root, 'unknown-restore')
  const confirm = MaintenanceDirectory.prototype.confirm
  vi.spyOn(MaintenanceDirectory.prototype, 'confirm').mockImplementation(async function (
    this: MaintenanceDirectory,
  ) {
    if (this.path === root) throw Object.assign(new Error('parent sync failure'), { code: 'EIO' })
    return confirm.call(this)
  })
  expect(await offline.restoreIsolated({ sourceLocation, targetLocation })).toEqual({
    status: 'outcome-unknown',
    fileName: null,
    targetLocation,
  })
  expect(await readFile(join(targetLocation, 'data.omne-backup'))).toEqual(
    await readFile(sourceLocation),
  )
  expect(
    (await offline.verify({ sourceLocation: join(targetLocation, 'data.omne-backup') })).status,
  ).toBe('verified')
  const before = await readFile(join(targetLocation, 'data.omne-backup'))
  await expect(
    openStorage({ dialect: 'sqlite', file: join(targetLocation, 'data.omne-backup') }),
  ).rejects.toThrow()
  expect(await readFile(join(targetLocation, 'data.omne-backup'))).toEqual(before)
})

it('reports a retained published backup when only SQL task deletion fails afterward', async () => {
  const { backups, online, report, onClosed, afterExport } = await fixture()
  const root = join(backups, '.quarantine')
  afterExport(() => chmod(root, 0o500))
  try {
    expect(await online.backup({ onlyIfDue: false })).toEqual({ status: 'unavailable' })
    const published = (await readdir(backups)).filter(name => name.endsWith('.omne-backup'))
    expect(published).toHaveLength(1)
    expect(report).toHaveBeenCalledWith({
      event: 'maintenance-residual',
      temporaryLocation: expect.stringMatching(/\/task-[0-9a-f]+$/),
      publishedLocation: join(backups, published[0]!),
    })
    await online.close()
    expect(onClosed).toHaveBeenCalledWith('error')
  } finally {
    await chmod(root, 0o700)
  }
})

it('reports ordinary directory close failure and marks the controller incomplete', async () => {
  const { backups, online, report, onClosed } = await fixture()
  faults.closePath = backups
  try {
    expect(await online.backupStatus({})).toEqual({ status: 'unavailable' })
    expect(report).toHaveBeenCalledWith({
      event: 'maintenance-residual',
      temporaryLocation: backups,
      publishedLocation: null,
    })
    await online.close()
    expect(onClosed).toHaveBeenCalledWith('error')
  } finally {
    faults.closePath = ''
  }
})

it.each([false, true])(
  'classifies cleanup ENOSPC as unavailable, preserving unknown=%s',
  async unknown => {
    const { backups, online, report, onClosed } = await fixture()
    faults.unlinkCode = 'ENOSPC'
    if (unknown)
      vi.spyOn(MaintenanceDirectory.prototype, 'confirm').mockRejectedValueOnce(
        Object.assign(new Error('sync failed'), { code: 'EIO' }),
      )
    try {
      const result = await online.backup({ onlyIfDue: false })
      expect(result.status).toBe(unknown ? 'outcome-unknown' : 'unavailable')
      const published = (await readdir(backups)).filter(name => name.endsWith('.omne-backup'))
      expect(published).toHaveLength(1)
      expect(report).toHaveBeenCalledWith({
        event: 'maintenance-residual',
        temporaryLocation: expect.stringMatching(/\/export-[0-9a-f]+$/),
        publishedLocation: join(backups, published[0]!),
      })
      await online.close()
      expect(onClosed).toHaveBeenCalledWith('error')
    } finally {
      faults.unlinkCode = ''
    }
  },
)

it('reports retained restored output if only its target directory close fails', async () => {
  const { root, backups, online, offline, report } = await fixture()
  const result = await online.backup({ onlyIfDue: false })
  if (result.status !== 'completed') throw new Error('backup failed')
  const sourceLocation = join(backups, result.backup.fileName)
  const targetLocation = join(root, 'close-failed-restore')
  faults.closePath = targetLocation
  try {
    expect(await offline.restoreIsolated({ sourceLocation, targetLocation })).toEqual({
      status: 'unavailable',
    })
    expect(await readFile(join(targetLocation, 'data.omne-backup'))).toEqual(
      await readFile(sourceLocation),
    )
    expect(report).toHaveBeenCalledWith({
      event: 'maintenance-residual',
      temporaryLocation: targetLocation,
      publishedLocation: join(targetLocation, 'data.omne-backup'),
    })
  } finally {
    faults.closePath = ''
  }
})
