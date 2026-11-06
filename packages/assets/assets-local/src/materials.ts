import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { settingsAssetsProjectionFact, settingsSqlGuardFact } from '@omne-harness/settings-local'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import {
  HANDLER,
  MIGRATION,
  ENABLEMENT_MIGRATION,
  SOURCE_LAYOUT_MIGRATION,
  PARTICIPANT,
  PROTOCOL,
  TABLES,
} from './schema.ts'
function file(name: string) {
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const url = new URL(`./${name}.${extension}`, import.meta.url)
  return {
    moduleUrl: url.href,
    digest: createHash('sha256').update(readFileSync(url)).digest('hex'),
  }
}
export function assetsSqlMaterials(
  options: { settingsGuard?: boolean } = {},
): Pick<SqlMaterialCatalog, 'participants' | 'migrations' | 'readHandlers'> {
  const participant = file('participant'),
    migration = file('migration'),
    enablement = file('enablement-migration'),
    sources = file('source-layout-migration'),
    reader = file('read')
  return {
    participants: [
      {
        participant: PARTICIPANT,
        protocol: PROTOCOL,
        moduleUrl: participant.moduleUrl,
        codeDigest: participant.digest,
        ownedTables: TABLES,
        readTables: [],
        requiresFacts: [],
        providesFacts: [
          ...(options.settingsGuard === false ? [] : [settingsSqlGuardFact]),
          settingsAssetsProjectionFact,
        ],
        allowedFunctions: [],
        grouping: 'groupable',
      },
    ],
    migrations: [
      {
        ...SOURCE_LAYOUT_MIGRATION,
        moduleUrl: sources.moduleUrl,
        checksum: sources.digest,
        requires: [ENABLEMENT_MIGRATION],
      },
      { ...MIGRATION, moduleUrl: migration.moduleUrl, checksum: migration.digest, requires: [] },
      {
        ...ENABLEMENT_MIGRATION,
        moduleUrl: enablement.moduleUrl,
        checksum: enablement.digest,
        requires: [MIGRATION],
      },
    ],
    readHandlers: [
      {
        handler: HANDLER,
        protocol: PROTOCOL,
        moduleUrl: reader.moduleUrl,
        codeDigest: reader.digest,
        ordering: 'snapshot',
        readTables: TABLES,
        requiresMigrations: [MIGRATION, ENABLEMENT_MIGRATION, SOURCE_LAYOUT_MIGRATION],
        maxRowsRead: 4,
        maxOutputBytes: 2 * 1024 * 1024,
      },
    ],
  }
}
