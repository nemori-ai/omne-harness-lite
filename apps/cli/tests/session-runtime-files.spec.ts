import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { openRuntimeDatabase, sessionTenantMigrations } from '../src/session-runtime-files.ts'

it('adds manifest storage after the existing tenant migrations without losing existing data', async () => {
  const migrations = await sessionTenantMigrations.getMigrations()
  const names = Object.keys(migrations)
  const previousName = names.filter(name =>
    name.endsWith('_credential_custodian_replica_source_ref'),
  )
  const manifestNames = names.filter(name => name.endsWith('_assembly_manifest'))
  const toolNames = names.filter(name => name.endsWith('_tool_original_issue'))
  expect(previousName).toHaveLength(1)
  expect(manifestNames).toHaveLength(1)
  expect(toolNames).toHaveLength(1)
  const manifestName = manifestNames[0]!
  expect(names.indexOf(manifestName)).toBe(names.indexOf(previousName[0]!) + 1)
  expect(names.indexOf(toolNames[0]!)).toBeGreaterThan(names.indexOf(manifestName))
  const manifest = migrations[manifestName]
  const previous = Object.fromEntries(
    Object.entries(migrations).slice(0, names.indexOf(manifestName)),
  )
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
      expect(
        after
          .prepare('SELECT name FROM kysely_migration ORDER BY name')
          .all()
          .map(row => row.name),
      ).toEqual(names)
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
