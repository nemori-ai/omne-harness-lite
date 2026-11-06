import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { GOVERNANCE_MIGRATION } from './migration.ts'

export function governanceSqlMigrations(): SqlMaterialCatalog['migrations'] {
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const url = new URL(`./migration.${extension}`, import.meta.url)
  return [
    {
      ...GOVERNANCE_MIGRATION,
      moduleUrl: url.href,
      checksum: createHash('sha256').update(readFileSync(url)).digest('hex'),
      requires: [],
    },
  ]
}
