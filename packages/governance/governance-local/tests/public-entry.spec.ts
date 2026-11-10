import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { governanceSqlMaterials } from '@omne-harness/governance-local'

it('exports one migration with a digest of the actual module', () => {
  const { migrations } = governanceSqlMaterials()
  expect(migrations.map(migration => [migration.owner, migration.id, migration.requires])).toEqual([
    ['governance.activation', 'governance-relations-1', []],
  ])
  for (const migration of migrations)
    expect(migration.checksum).toBe(
      createHash('sha256')
        .update(readFileSync(new URL(migration.moduleUrl)))
        .digest('hex'),
    )
})
