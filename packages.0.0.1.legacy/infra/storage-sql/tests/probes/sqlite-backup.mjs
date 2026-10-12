import assert from 'node:assert/strict'
import { DatabaseSync, backup } from 'node:sqlite'
import { mkdtemp, realpath, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
const root = await mkdtemp(join(await realpath(tmpdir()), 'omne-backup-probe-'))
const source = new DatabaseSync(join(root, 'source.sqlite'))
let reader, copy
try {
  source.exec(
    'PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA wal_autocheckpoint=0; CREATE TABLE facts(id INTEGER PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE link(id INTEGER REFERENCES facts(id));',
  )
  source.exec(
    "BEGIN IMMEDIATE; INSERT INTO facts VALUES(1,'first'); INSERT INTO link VALUES(1); COMMIT;",
  )
  const before = await readFile(join(root, 'source.sqlite-wal'))
  assert.ok(before.length > 32)
  reader = new DatabaseSync(join(root, 'source.sqlite'), { readOnly: true })
  const pages = await backup(reader, join(root, 'copy.sqlite'), { rate: 1 })
  copy = new DatabaseSync(join(root, 'copy.sqlite'), { readOnly: true })
  assert.equal(copy.prepare('SELECT value FROM facts WHERE id=1').get().value, 'first')
  assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
  assert.deepEqual(copy.prepare('PRAGMA foreign_key_check').all(), [])
  assert.deepEqual(await readFile(join(root, 'source.sqlite-wal')), before)
  copy.close()
  copy = undefined
  const old = new DatabaseSync(join(root, 'copy.sqlite'))
  old.exec("UPDATE facts SET value='destination-old'")
  old.close()
  await backup(reader, join(root, 'copy.sqlite'))
  copy = new DatabaseSync(join(root, 'copy.sqlite'), { readOnly: true })
  assert.equal(copy.prepare('SELECT value FROM facts WHERE id=1').get().value, 'first')
  const hash = createHash('sha256')
    .update(await readFile(join(root, 'copy.sqlite')))
    .digest('hex')
  console.log(
    JSON.stringify({
      status: 'PASS',
      node: process.version,
      sqlite: source.prepare('select sqlite_version() as v').get().v,
      pages,
      copyHash: hash,
      checks: [
        'readOnly source backup includes uncheckpointed WAL transaction and FK consistency',
        'source WAL bytes unchanged',
        'existing valid destination overwritten: caller must own staging/exclusive publication',
      ],
      scope:
        'Node/SQLite mechanism only, no accepted product backup or isolated restore, fsync/failure/whole-machine guarantee',
    }),
  )
} finally {
  copy?.close()
  reader?.close()
  source.close()
  await rm(root, { recursive: true, force: true })
}
