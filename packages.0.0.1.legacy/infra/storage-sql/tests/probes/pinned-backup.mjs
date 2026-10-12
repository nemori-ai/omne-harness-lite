import assert from 'node:assert/strict'
import { DatabaseSync, backup } from 'node:sqlite'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const root = await mkdtemp(join(await realpath(tmpdir()), 'omne-pinned-backup-'))
const source = new DatabaseSync(join(root, 'source.sqlite'))
let reader, copy
try {
  source.exec(
    'PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA wal_autocheckpoint=0; CREATE TABLE facts(id INTEGER PRIMARY KEY, generation INTEGER, bytes BLOB); BEGIN IMMEDIATE;',
  )
  const add = source.prepare('INSERT INTO facts VALUES (?,0,zeroblob(8192))')
  for (let i = 0; i < 512; i++) add.run(i)
  source.exec('COMMIT')
  reader = new DatabaseSync(join(root, 'source.sqlite'), { readOnly: true })
  reader.exec('BEGIN')
  assert.equal(reader.prepare('SELECT max(generation) AS v FROM facts').get().v, 0)
  let changes = 0,
    callbacks = 0
  const pages = await backup(reader, join(root, 'backup.sqlite'), {
    rate: 4,
    progress() {
      callbacks++
      if (changes < 10) {
        changes++
        source.prepare('UPDATE facts SET generation=?').run(changes)
      }
    },
  })
  assert.equal(changes, 10)
  assert.equal(source.prepare('SELECT min(generation) AS v FROM facts').get().v, 10)
  copy = new DatabaseSync(join(root, 'backup.sqlite'), { readOnly: true })
  assert.equal(copy.prepare('SELECT count(*) AS n FROM facts').get().n, 512)
  assert.equal(copy.prepare('SELECT max(generation) AS v FROM facts').get().v, 0)
  assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
  reader.exec('ROLLBACK')
  console.log(
    JSON.stringify({
      status: 'PASS',
      node: process.version,
      pages,
      callbacks,
      concurrentCommits: changes,
      backupGeneration: 0,
      liveGeneration: 10,
      scope:
        'fixed read transaction and WAL backup on Node24.21, synthetic data; not product API/adoption, fsync/cancellation/timeout guarantee',
    }),
  )
} finally {
  copy?.close()
  reader?.close()
  source.close()
  await rm(root, { recursive: true, force: true })
}
