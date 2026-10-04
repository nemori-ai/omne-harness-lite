// Route stubs still participate in a real SQLite unit; SQL cross-owner behavior is
// checked separately with the real providers in the center composition tests.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, afterAll } from 'vitest'
import { openStorage, type SqlStorage } from '@omne-harness-lite/storage-sql'

export function decisionStorage(): () => SqlStorage {
  const directory = mkdtempSync(join(tmpdir(), 'omne-entry-decision-'))
  let storage: SqlStorage
  beforeAll(async () => {
    storage = await openStorage({ dialect: 'sqlite', file: join(directory, 'db.sqlite') })
  })
  afterAll(async () => {
    await storage?.close()
    rmSync(directory, { recursive: true, force: true })
  })
  return () => storage
}
