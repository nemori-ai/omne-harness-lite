import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { governanceSqlMigrations } from '@omne-harness/governance-local'

it('exports fixed migration material with a digest of the actual module', () => {
  const migrations = governanceSqlMigrations()
  expect(migrations).toHaveLength(5)
  const migration = migrations[0]!
  expect(migration.owner).toBe('governance.activation')
  expect(migration.id).toBe('governance-relations-1')
  expect(migration.requires).toEqual([])
  expect(migrations[1]?.id).toBe('governance-recovery-index-1')
  expect(migrations[1]?.requires).toEqual([{ owner: migration.owner, id: migration.id }])
  expect(migrations[2]?.id).toBe('governance-sql-stage-1')
  expect(migrations[2]?.requires).toEqual([{ owner: migration.owner, id: migration.id }])
  expect(migrations[3]?.id).toBe('governance-source-custody-1')
  expect(migrations[3]?.requires).toEqual([
    { owner: migration.owner, id: 'governance-sql-stage-1' },
    { owner: migration.owner, id: 'governance-recovery-index-1' },
  ])
  expect(migrations[4]?.id).toBe('governance-external-write-1')
  expect(migrations[4]?.requires).toEqual([
    { owner: migration.owner, id: 'governance-source-custody-1' },
  ])
  for (const migration of migrations)
    expect(migration.checksum).toBe(
      createHash('sha256')
        .update(readFileSync(new URL(migration.moduleUrl)))
        .digest('hex'),
    )
})
