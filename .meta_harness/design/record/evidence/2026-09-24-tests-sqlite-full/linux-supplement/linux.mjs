import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openStorage } from '/workspace/packages/infra/storage-sql/dist/index.js'
import { sql } from '/workspace/packages/infra/storage-sql/node_modules/kysely/dist/index.js'
const directory = await mkdtemp(join(tmpdir(), 'omne-full-linux-'))
const checks = []
try {
  for (const synchronous of ['normal', 'full']) {
    const file = join(directory, `${synchronous}.sqlite`)
    for (let pass = 0; pass < 2; pass++) {
      const storage = await openStorage({ dialect: 'sqlite', file, synchronous })
      try {
        for (const mode of ['read', 'write']) await storage[mode](async tx => {
          assert.deepEqual((await sql`PRAGMA synchronous`.execute(tx.db)).rows.map(row => ({ ...row })), [{ synchronous: synchronous === 'full' ? 2 : 1 }])
          assert.deepEqual((await sql`PRAGMA journal_mode`.execute(tx.db)).rows.map(row => ({ ...row })), [{ journal_mode: 'wal' }])
        })
        if (pass === 0) await storage.write(async tx => {
          await sql`CREATE TABLE durable_probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL)`.execute(tx.db)
          await sql`INSERT INTO durable_probe VALUES (1, 'committed')`.execute(tx.db)
        })
        assert.deepEqual(await storage.read(async tx => (await sql`SELECT value FROM durable_probe WHERE id = 1`.execute(tx.db)).rows.map(row => ({ ...row }))), [{ value: 'committed' }])
        checks.push({ synchronous, reopened: pass === 1, readWritePragmas: 'pass', committedRead: 'pass' })
      } finally { await storage.close() }
    }
  }
  process.stdout.write(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch, checks, limits: 'Built provider smoke only; no power-loss, host, PostgreSQL or full Linux test-suite validation.' }, null, 2) + '\n')
} finally { await rm(directory, { recursive: true, force: true }) }
