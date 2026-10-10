import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { openRuntimeDatabase, sessionTenantMigrations } from '../src/session-runtime-files.ts'

it('adds manifest storage after the existing tenant migrations without losing existing data', async () => {
  const migrations = await sessionTenantMigrations.getMigrations()
  const names = Object.keys(migrations)
  expect(names.at(-2)).toBe('0028_credential_custodian_replica_source_ref')
  expect(names.at(-1)).toBe('0029_assembly_manifest')
  const { ['0029_assembly_manifest']: manifest, ...previous } = migrations
  expect(manifest).toBeDefined()
  const directory = await mkdtemp(join(tmpdir(), 'omne-runtime-upgrade-'))
  const file = join(directory, 'runtime.sqlite')
  try {
    const oldStorage = await openRuntimeDatabase(file, { getMigrations: async () => previous })
    await oldStorage.close()
    const before = new DatabaseSync(file)
    try {
      before.exec(
        "CREATE TABLE upgrade_sentinel(value TEXT); INSERT INTO upgrade_sentinel VALUES ('original')",
      )
      expect(
        before
          .prepare("SELECT name FROM sqlite_master WHERE name = 'assembly_manifest_record'")
          .get(),
      ).toBeUndefined()
    } finally {
      before.close()
    }
    const upgraded = await openRuntimeDatabase(file, sessionTenantMigrations)
    await upgraded.close()
    const after = new DatabaseSync(file)
    try {
      expect(after.prepare('SELECT value FROM upgrade_sentinel').get()).toEqual({
        value: 'original',
      })
      expect(
        after
          .prepare("SELECT name FROM sqlite_master WHERE name = 'assembly_manifest_record'")
          .get(),
      ).toEqual({ name: 'assembly_manifest_record' })
    } finally {
      after.close()
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
