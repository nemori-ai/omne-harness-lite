import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { governanceSqlMigrations } from '@omne-harness/governance-local'

it('exports fixed migration material with a digest of the actual module', () => {
  const migrations = governanceSqlMigrations()
  expect(migrations).toHaveLength(1)
  const migration = migrations[0]!
  expect(migration.owner).toBe('governance.activation')
  expect(migration.id).toBe('governance-relations-1')
  expect(migration.requires).toEqual([])
  expect(migration.checksum).toBe(
    createHash('sha256')
      .update(readFileSync(new URL(migration.moduleUrl)))
      .digest('hex'),
  )
})
