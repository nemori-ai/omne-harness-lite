import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { settingsStandalonePublicationFact } from './standalone-publication.ts'
import { STANDALONE_READ } from './standalone-read-schema.ts'
import { SOURCE_WRITE_FACT } from './source-write.ts'
import { settingsStandaloneProjectionFact } from './projection.ts'
import {
  STANDALONE_MIGRATION,
  STANDALONE_PARTICIPANT,
  STANDALONE_PROJECTION,
  STANDALONE_PROTOCOL,
  STANDALONE_TABLES,
} from './standalone-schema.ts'
export function settingsStandaloneMaterials(): Pick<
  SqlMaterialCatalog,
  'participants' | 'migrations' | 'readHandlers'
> {
  const file = (name: string) => {
    const moduleUrl = new URL(
      `./${name}.${import.meta.url.endsWith('.ts') ? 'ts' : 'js'}`,
      import.meta.url,
    )
    return {
      moduleUrl: moduleUrl.href,
      codeDigest: createHash('sha256').update(readFileSync(moduleUrl)).digest('hex'),
    }
  }
  const participant = file('standalone-participant'),
    migration = file('standalone-migration')
  return {
    participants: [
      {
        participant: STANDALONE_PARTICIPANT,
        protocol: STANDALONE_PROTOCOL,
        ...participant,
        ownedTables: STANDALONE_TABLES,
        readTables: [],
        requiresFacts: [SOURCE_WRITE_FACT],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'groupable',
      },
      {
        participant: STANDALONE_PROJECTION,
        protocol: STANDALONE_PROTOCOL,
        ...file('standalone-projection'),
        ownedTables: [],
        readTables: ['st_targets'],
        requiresFacts: [],
        providesFacts: [settingsStandaloneProjectionFact, settingsStandalonePublicationFact],
        allowedFunctions: [],
        grouping: 'groupable',
      },
    ],
    migrations: [
      {
        ...STANDALONE_MIGRATION,
        moduleUrl: migration.moduleUrl,
        checksum: migration.codeDigest,
        requires: [],
      },
    ],
    readHandlers: [
      {
        ...STANDALONE_READ,
        ...file('standalone-read'),
        ordering: 'snapshot',
        readTables: ['st_targets'],
        requiresMigrations: [STANDALONE_MIGRATION],
        maxRowsRead: 1,
        maxOutputBytes: 2 * 1024 * 1024,
      },
    ],
  }
}
