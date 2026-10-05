import { createHash } from 'node:crypto'
import { chmod, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { composeMigrations, type SnapshotInspection } from '@omne-harness-lite/storage'
import {
  createUpgradeGuard,
  openSnapshotInspection,
  openStorage,
} from '@omne-harness-lite/storage-sql'
import { governanceCenterMigrations } from '../src/center-id/migrations.ts'
import { governanceCenterSnapshotCheck } from '../src/center-id/snapshot.ts'
import { withBackupInput } from '../src/maintenance/assembly.ts'
import type { SnapshotFormat } from '../src/maintenance/maintenance-options.ts'
import { maintenanceFailure } from '../src/maintenance/failure.ts'
import { MAGIC, metadataBytes, parseMetadata } from '../src/maintenance/metadata.ts'
import type { Metadata } from '../src/maintenance/backup-data.ts'

const roots: string[] = []
const owners: SnapshotInspection[] = []
const format: SnapshotFormat = {
  migrationNames: ['0001_governance_center'],
  snapshotChecks: [governanceCenterSnapshotCheck],
}
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-backup-format-')))
  roots.push(root)
  const guard = createUpgradeGuard()
  const storage = await openStorage({
    dialect: 'sqlite',
    file: join(root, 'source.sqlite'),
    migrations: composeMigrations(governanceCenterMigrations),
    upgrade: { guard, checks: [] },
    maintenance: { workDirectory: join(root, '.online'), onClosed() {} },
  })
  let data: Buffer
  try {
    await storage.write(tx =>
      tx.db
        .updateTable('governance_center')
        .set({ center_id: '0123456789abcdef0123456789abcdef' })
        .execute()
        .then(() => undefined),
    )
    await guard.confirm()
    if (storage.maintenance === undefined) throw new Error('fixture requires maintenance')
    data = await storage.maintenance.run(session =>
      session.snapshot(async view => {
        const chunks: Uint8Array[] = []
        for (let offset = 0; offset < view.byteLength; offset += 65_536)
          chunks.push(await view.read(offset, Math.min(65_536, view.byteLength - offset)))
        return Buffer.concat(chunks)
      }),
    )
  } finally {
    await storage.close()
  }
  const metadata: Metadata = {
    format: 'omne-center-backup/1',
    centerId: '0123456789abcdef0123456789abcdef',
    sourceBuildId: null,
    migrationNames: format.migrationNames,
    startedAt: '2026-09-26T00:00:00.000Z',
    finishedAt: '2026-09-26T00:00:01.000Z',
    byteLength: data.length,
    sha256: createHash('sha256').update(data).digest('hex'),
  }
  const path = join(root, 'source.omne-backup')
  await writeFile(path, Buffer.concat([metadataBytes(metadata), data]), { mode: 0o600 })
  const owner = await openSnapshotInspection(join(root, '.offline'))
  owners.push(owner)
  const inspect = () =>
    owner
      .run(session => withBackupInput(path, session, input => input.inspect(session, format)))
      .catch((error: unknown) => {
        throw maintenanceFailure(error)
      })
  return { root, path, metadata, data, inspect, owner }
}
afterEach(async () => {
  for (const owner of owners.splice(0)) await owner.close()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

it('checks real snapshot bytes and owner identity without modifying the source file', async () => {
  const { path, inspect, metadata } = await fixture()
  const before = await readFile(path)
  expect(await inspect()).toEqual(metadata)
  expect(await readFile(path)).toEqual(before)
  expect(before.subarray(0, MAGIC.length).toString()).toBe('OMNE-CENTER-BACKUP/1\n')
})

it.each([
  'digest',
  'identity',
  'migration',
  'trailing',
  'short',
  'duplicate',
  'bad-date',
  'reversed',
] as const)('refuses %s in an otherwise valid envelope', async fault => {
  const { path, data, metadata, inspect } = await fixture()
  let header = metadataBytes(metadata)
  let body = data
  if (fault === 'digest') header = metadataBytes({ ...metadata, sha256: '0'.repeat(64) })
  if (fault === 'identity') header = metadataBytes({ ...metadata, centerId: 'f'.repeat(32) })
  if (fault === 'migration') header = metadataBytes({ ...metadata, migrationNames: ['wrong'] })
  if (fault === 'trailing') body = Buffer.concat([data, Buffer.from([1])])
  if (fault === 'short') body = data.subarray(0, data.length - 1)
  if (['duplicate', 'bad-date', 'reversed'].includes(fault)) {
    let text = JSON.stringify(metadata)
    if (fault === 'duplicate') text = text.replace('{', '{"format":"omne-center-backup/1",')
    if (fault === 'bad-date')
      text = text.replace('2026-09-26T00:00:00.000Z', '2026-02-30T00:00:00.000Z')
    if (fault === 'reversed')
      text = text.replace('2026-09-26T00:00:00.000Z', '2026-09-27T00:00:00.000Z')
    const bytes = Buffer.from(text)
    const length = Buffer.alloc(4)
    length.writeUInt32BE(bytes.length)
    header = Buffer.concat([MAGIC, length, bytes])
  }
  await writeFile(path, Buffer.concat([header, body]))
  await expect(inspect()).rejects.toMatchObject({ kind: 'invalid-backup' })
})

it('refuses a symlink and nonprivate file without reading their contents', async () => {
  const { root, path, inspect, owner } = await fixture()
  await chmod(path, 0o644)
  await expect(inspect()).rejects.toMatchObject({ kind: 'unavailable' })
  await chmod(path, 0o600)
  const alias = join(root, 'alias')
  await symlink(path, alias)
  await expect(
    owner.run(session => withBackupInput(alias, session, async () => true)),
  ).rejects.toThrow()
})

it('detects change through the fixed descriptor and parses time offsets semantically', async () => {
  const { path, metadata, owner } = await fixture()
  await expect(
    owner.run(session =>
      withBackupInput(path, session, async input => {
        await writeFile(path, 'changed')
        await input.stable()
      }),
    ),
  ).rejects.toMatchObject({ kind: 'unavailable' })
  expect(parseMetadata({ ...metadata, startedAt: '2026-09-26T08:00:00+08:00' })).toBeDefined()
})
