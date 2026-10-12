import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, readdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SnapshotEngine } from '../src/maintenance/engine.ts'
import { sqliteSnapshotProducer } from '../src/maintenance/source.ts'

const roots: string[] = []
const owners: SnapshotEngine[] = []
const writers: DatabaseSync[] = []
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-online-copy-')))
  roots.push(root)
  const file = join(root, 'source.sqlite')
  const db = new DatabaseSync(file)
  writers.push(db)
  db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE kysely_migration(name TEXT PRIMARY KEY NOT NULL,timestamp TEXT NOT NULL);
    INSERT INTO kysely_migration VALUES('001_test','2026-09-26T00:00:00.000Z');
    CREATE TABLE generation(value INTEGER NOT NULL); INSERT INTO generation VALUES(0);
    CREATE TABLE payload(id INTEGER PRIMARY KEY,body BLOB); BEGIN;`)
  const insert = db.prepare('INSERT INTO payload VALUES(?,zeroblob(4000))')
  for (let i = 0; i < 1024; i += 1) insert.run(i)
  db.exec('COMMIT; PRAGMA wal_checkpoint(TRUNCATE)')
  return { root, file, db }
}
afterEach(async () => {
  for (const owner of owners.splice(0)) await owner.close()
  for (const writer of writers.splice(0)) writer.close()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

describe('D055 online producer preserves its fixed observation', () => {
  it('exports the old observation while subsequent WAL commits continue', async () => {
    const { root, file, db } = await fixture()
    let committed = 0
    const owner = await SnapshotEngine.open(
      join(root, '.quarantine'),
      sqliteSnapshotProducer(file, {
        afterPinned() {
          db.exec('UPDATE generation SET value=1')
          committed = 1
        },
        progress() {
          if (committed < 5) db.prepare('UPDATE generation SET value=?').run(++committed)
        },
      }),
    )
    owners.push(owner)
    await owner.run(session =>
      session.snapshot(async view => {
        expect(
          await view.inspection.tx.db.selectFrom('generation').select('value').execute(),
        ).toEqual([{ value: 0 }])
      }),
    )
    expect(committed).toBe(5)
    expect(db.prepare('SELECT value FROM generation').get()).toEqual({ value: 5 })
    expect(db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get()).toMatchObject({ busy: 0, log: 0 })
  })

  it('waits for callback cancellation to settle, releases the fixed read, and supports a new explicit operation', async () => {
    const { root, file, db } = await fixture()
    const abort = new AbortController()
    let first = true
    const owner = await SnapshotEngine.open(
      join(root, '.quarantine'),
      sqliteSnapshotProducer(file, {
        progress() {
          if (first) {
            first = false
            abort.abort()
          }
        },
      }),
    )
    owners.push(owner)
    await expect(
      owner.run(session => session.snapshot(async () => true), { signal: abort.signal }),
    ).rejects.toMatchObject({ kind: 'cancelled' })
    expect(db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get()).toMatchObject({ busy: 0, log: 0 })
    expect(
      (await readdir(join(root, '.quarantine'))).filter(name => name.startsWith('task-')),
    ).toEqual([])
    await expect(
      owner.run(session => session.snapshot(async () => 'new explicit request')),
    ).resolves.toBe('new explicit request')
  })
})
