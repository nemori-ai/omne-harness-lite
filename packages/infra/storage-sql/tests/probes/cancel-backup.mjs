import assert from 'node:assert/strict'
import { DatabaseSync, backup } from 'node:sqlite'
import { mkdtemp, realpath, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const root = await mkdtemp(join(await realpath(tmpdir()), 'omne-backup-cancel-'))
const source = new DatabaseSync(join(root, 'source.sqlite'))
let reader, target
try {
  source.exec(
    'PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA wal_autocheckpoint=0; CREATE TABLE facts(id INTEGER PRIMARY KEY, generation INTEGER, bytes BLOB); BEGIN IMMEDIATE;',
  )
  const add = source.prepare('INSERT INTO facts VALUES (?,0,zeroblob(8192))')
  for (let n = 0; n < 512; n++) add.run(n)
  source.exec('COMMIT')
  source.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get()
  reader = new DatabaseSync(join(root, 'source.sqlite'), { readOnly: true })
  reader.exec('BEGIN')
  reader.prepare('SELECT * FROM facts LIMIT 1').get()
  let callbacks = 0,
    pinnedCheckpoint
  const sentinel = new Error('intentional-maintenance-cancellation')
  await assert.rejects(
    backup(reader, join(root, 'partial.sqlite'), {
      rate: 4,
      progress() {
        callbacks++
        source.prepare('UPDATE facts SET generation=?').run(callbacks)
        if (callbacks === 2) {
          pinnedCheckpoint = source.prepare('PRAGMA wal_checkpoint(PASSIVE)').get()
          throw sentinel
        }
      },
    }),
    error => error === sentinel,
  )
  assert.equal(callbacks, 2)
  // Promise has rejected; finish is owned by Node before rejection, read snapshot remains ours.
  reader.exec('ROLLBACK')
  reader.close()
  reader = undefined
  const after = source.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get()
  assert.equal(after.busy, 0)
  assert.equal((await stat(join(root, 'source.sqlite-wal'))).size, 0)
  const partialBytes = (await stat(join(root, 'partial.sqlite'))).size
  await backup(source, join(root, 'subsequent.sqlite'), { rate: 4 })
  target = new DatabaseSync(join(root, 'subsequent.sqlite'), { readOnly: true })
  assert.equal(target.prepare('SELECT min(generation) AS value FROM facts').get().value, 2)
  console.log(
    JSON.stringify({
      status: 'PASS',
      platform: process.platform,
      node: process.version,
      callbacks,
      pinnedCheckpoint,
      afterRelease: after,
      partialBytes,
      scope:
        'progress-callback throw at second step, rejection identity, snapshot release and subsequent backup; not arbitrary I/O timeout, capacity bound or product cancellation implementation',
    }),
  )
} finally {
  target?.close()
  reader?.close()
  source.close()
  await rm(root, { recursive: true, force: true })
}
