import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { settingsStandaloneProjectionFact, settingsAssetsProjectionFact } from './projection.ts'
import {
  CATALOG_TERMINAL,
  CATALOG_TERMINAL_FACT,
  CATALOG_TERMINAL_MIGRATION,
} from './catalog-terminal-schema.ts'
import { SNAPSHOT_PARTICIPANT, SNAPSHOT_PROTOCOL } from './snapshot-schema.ts'
export function settingsCatalogMaterials(): Pick<
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
  const sources = [settingsStandaloneProjectionFact, settingsAssetsProjectionFact]
  return {
    participants: [
      {
        participant: CATALOG_TERMINAL.participant,
        protocol: CATALOG_TERMINAL.protocol,
        ...file('catalog-terminal-participant'),
        ownedTables: [CATALOG_TERMINAL.table],
        readTables: [],
        requiresFacts: [],
        providesFacts: [CATALOG_TERMINAL_FACT],
        allowedFunctions: [],
        grouping: 'groupable',
      },
      {
        participant: SNAPSHOT_PARTICIPANT,
        protocol: SNAPSHOT_PROTOCOL,
        ...file('snapshot-participant'),
        ownedTables: [],
        readTables: ['st_states'],
        requiresFacts: [...sources, CATALOG_TERMINAL_FACT],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'groupable',
      },
    ],
    migrations: [
      {
        ...CATALOG_TERMINAL_MIGRATION,
        moduleUrl: file('catalog-terminal-migration').moduleUrl,
        checksum: file('catalog-terminal-migration').codeDigest,
        requires: [],
      },
    ],
    readHandlers: [],
  }
}
