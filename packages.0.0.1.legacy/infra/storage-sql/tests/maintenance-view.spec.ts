import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SnapshotFailure, StorageDefect, type SnapshotView } from '@omne-harness-lite/storage'
import { SnapshotWorkspace } from '../src/maintenance/workspace.ts'
import { SnapshotResources } from '../src/maintenance/resources.ts'
import { useSnapshotView } from '../src/maintenance/view.ts'

const roots: string[] = []
const workspaces: SnapshotWorkspace[] = []
async function fixture(registry = true) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-snapshot-view-')))
  roots.push(root)
  const workspace = await SnapshotWorkspace.open(join(root, '.quarantine'))
  workspaces.push(workspace)
  const path = join(await workspace.createTask(), 'copy.sqlite')
  const db = new DatabaseSync(path)
  db.exec(`CREATE TABLE data (id INTEGER PRIMARY KEY, label TEXT NOT NULL);
    CREATE UNIQUE INDEX unique_label ON data(label) WHERE id > 0;
    CREATE TABLE sqliteX_visible (id INTEGER);
    INSERT INTO data VALUES(1, 'original');`)
  if (registry)
    db.exec(`CREATE TABLE kysely_migration (name TEXT PRIMARY KEY NOT NULL, timestamp TEXT NOT NULL);
    INSERT INTO kysely_migration VALUES ('001_test', '2026-09-25T00:00:00.000Z');`)
  db.close()
  return path
}
afterEach(async () => {
  for (const workspace of workspaces.splice(0)) await workspace.close()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

describe('D055 a borrowed snapshot view', () => {
  it('shares one immutable copy for bytes, structural facts, and owner queries', async () => {
    const path = await fixture()
    const original = await readFile(path)
    await useSnapshotView(path, async view => {
      expect(Buffer.from(await view.read(0, original.length))).toEqual(original)
      expect(view.inspection.appliedMigrations).toEqual(['001_test'])
      expect(view.inspection.tables.has('sqliteX_visible')).toBe(true)
      const data = view.structure.tables.find(t => t.name === 'data')
      expect(data?.columns).toEqual([
        { name: 'id', type: 'INTEGER', notNull: false, primaryKeyPosition: 1 },
        { name: 'label', type: 'TEXT', notNull: true, primaryKeyPosition: 0 },
      ])
      expect(data?.indexes).toContainEqual(
        expect.objectContaining({
          name: 'unique_label',
          unique: true,
          partial: true,
          columns: ['label'],
        }),
      )
      expect(await view.inspection.tx.db.selectFrom('data').selectAll().execute()).toEqual([
        { id: 1, label: 'original' },
      ])
      await expect(
        view.inspection.tx.db.updateTable('data').set({ label: 'changed' }).execute(),
      ).rejects.toThrow()
    })
    expect(await readFile(path)).toEqual(original)
  })

  it('drains started byte reads, and refuses both byte and SQL use after the callback', async () => {
    const path = await fixture()
    const original = await readFile(path)
    let borrowed: SnapshotView | undefined
    let inFlight: Promise<Uint8Array> | undefined
    await useSnapshotView(path, async view => {
      borrowed = view
      inFlight = view.read(0, original.length)
      // Intentionally return without awaiting the started read: the owner must wait.
    })
    if (borrowed === undefined || inFlight === undefined)
      throw new Error('fixture did not capture view')
    expect(Buffer.from(await inFlight)).toEqual(original)
    await expect(borrowed.read(0, 1)).rejects.toMatchObject({ kind: 'unavailable' })
    await expect(
      borrowed.inspection.tx.db.selectFrom('data').selectAll().execute(),
    ).rejects.toThrow()
  })

  it('does not infer a valid migration history from an otherwise physically valid database', async () => {
    const path = await fixture(false)
    await expect(useSnapshotView(path, async () => true)).rejects.toMatchObject({
      kind: 'invalid-data',
    })
  })
})

it('preserves an internal callback defect alongside a failed resource close', async () => {
  const path = await fixture()
  const resources = new SnapshotResources()
  const defect = new StorageDefect('callback defect')
  const cleanup = new SnapshotFailure('unavailable')
  let fail = true
  resources.own(async () => {
    if (fail) throw cleanup
  })
  try {
    await expect(
      useSnapshotView(
        path,
        async () => {
          throw defect
        },
        resources,
      ),
    ).rejects.toMatchObject({ errors: [defect, cleanup] })
  } finally {
    fail = false
    await resources.close()
  }
})
