import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { settingsStandalonePublicationFact } from './standalone-publication.ts'
import { SOURCE_WRITE_FACT } from './source-write.ts'
import { GUARD_FACT } from './schema.ts'
import { settingsStandaloneProjectionFact } from './projection.ts'
import {
  STANDALONE_MIGRATION,
  STANDALONE_PUBLICATION_MIGRATION,
  STANDALONE_SOURCE_LAYOUT_MIGRATION,
  STANDALONE_ENABLEMENT_MIGRATION,
  STANDALONE_PARTICIPANT,
  STANDALONE_PROJECTION,
  STANDALONE_PROTOCOL,
  STANDALONE_TABLES,
} from './standalone-schema.ts'
export function settingsStandaloneMaterials(
  options: { settingsGuard?: boolean } = {},
): Pick<SqlMaterialCatalog, 'participants' | 'migrations' | 'readHandlers'> {
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
    migration = file('standalone-migration'),
    enablement = file('standalone-enablement-migration'),
    sources = file('standalone-source-layout-migration')
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
        readTables: ['st_targets', 'st_target_publication'],
        requiresFacts: [],
        providesFacts: [
          settingsStandaloneProjectionFact,
          settingsStandalonePublicationFact,
          ...(options.settingsGuard === false ? [] : [GUARD_FACT]),
        ],
        allowedFunctions: [],
        grouping: 'groupable',
      },
    ],
    migrations: [
      {
        ...STANDALONE_PUBLICATION_MIGRATION,
        moduleUrl: file('standalone-publication-migration').moduleUrl,
        checksum: file('standalone-publication-migration').codeDigest,
        requires: [STANDALONE_SOURCE_LAYOUT_MIGRATION],
      },
      {
        ...STANDALONE_SOURCE_LAYOUT_MIGRATION,
        moduleUrl: sources.moduleUrl,
        checksum: sources.codeDigest,
        requires: [STANDALONE_ENABLEMENT_MIGRATION],
      },
      {
        ...STANDALONE_MIGRATION,
        moduleUrl: migration.moduleUrl,
        checksum: migration.codeDigest,
        requires: [],
      },
      {
        ...STANDALONE_ENABLEMENT_MIGRATION,
        moduleUrl: enablement.moduleUrl,
        checksum: enablement.codeDigest,
        requires: [STANDALONE_MIGRATION],
      },
    ],
    readHandlers: [],
  }
}
