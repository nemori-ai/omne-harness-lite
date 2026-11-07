import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { GOVERNANCE_MIGRATION } from './migration.ts'
import { GOVERNANCE_RECOVERY_MIGRATION } from './recovery-migration.ts'
import { RECOVERY_HANDLER } from './recovery-read.ts'

export function governanceSqlMigrations(): SqlMaterialCatalog['migrations'] {
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const url = new URL(`./migration.${extension}`, import.meta.url)
  const recovery = new URL(`./recovery-migration.${extension}`, import.meta.url)
  return [
    {
      ...GOVERNANCE_MIGRATION,
      moduleUrl: url.href,
      checksum: createHash('sha256').update(readFileSync(url)).digest('hex'),
      requires: [],
    },
    {
      ...GOVERNANCE_RECOVERY_MIGRATION,
      moduleUrl: recovery.href,
      checksum: createHash('sha256').update(readFileSync(recovery)).digest('hex'),
      requires: [GOVERNANCE_MIGRATION],
    },
  ]
}

export function governanceRecoveryReadMaterials(): SqlMaterialCatalog['readHandlers'] {
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const url = new URL(`./recovery-read.${extension}`, import.meta.url)
  return [
    {
      ...RECOVERY_HANDLER,
      moduleUrl: url.href,
      codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
      ordering: 'domain-serial',
      readTables: ['gc_scope', 'gc_operation'],
      requiresMigrations: [GOVERNANCE_RECOVERY_MIGRATION],
      maxOutputBytes: 256 * 1024,
      maxRowsRead: 66,
    },
  ]
}
