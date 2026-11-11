import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { SOURCE_SERVICE_READ } from './source-service-schema.ts'
import { SOURCE_WRITE_FACT } from './source-write.ts'
import {
  SOURCE_RETENTION_OWNER,
  SOURCE_RETENTION_PROTOCOL,
  SOURCE_RETENTION_TABLES,
  SOURCE_RETENTION_MIGRATION,
  SOURCE_SNAPSHOT_FACT,
} from './source-retention-schema.ts'
export function sourceRetentionMaterials(): Pick<
  SqlMaterialCatalog,
  'participants' | 'migrations' | 'readHandlers'
> {
  const file = (name: string) => {
    const url = new URL(
      `./${name}.${import.meta.url.endsWith('.ts') ? 'ts' : 'js'}`,
      import.meta.url,
    )
    return {
      moduleUrl: url.href,
      codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
    }
  }
  const migration = file('source-retention-migration')
  return {
    participants: [
      {
        participant: SOURCE_RETENTION_OWNER,
        protocol: SOURCE_RETENTION_PROTOCOL,
        ...file('source-retention-participant'),
        ownedTables: SOURCE_RETENTION_TABLES,
        readTables: [],
        requiresFacts: [SOURCE_SNAPSHOT_FACT],
        providesFacts: [SOURCE_WRITE_FACT],
        allowedFunctions: [],
        grouping: 'groupable',
      },
    ],
    migrations: [
      {
        ...SOURCE_RETENTION_MIGRATION,
        moduleUrl: migration.moduleUrl,
        checksum: migration.codeDigest,
        requires: [],
      },
    ],
    readHandlers: [
      {
        ...SOURCE_SERVICE_READ,
        ...file('source-service-read'),
        ordering: 'snapshot',
        readTables: SOURCE_RETENTION_TABLES,
        requiresMigrations: [SOURCE_RETENTION_MIGRATION],
        maxRowsRead: 100,
        maxOutputBytes: 2 * 1024 * 1024,
      },
    ],
  }
}
