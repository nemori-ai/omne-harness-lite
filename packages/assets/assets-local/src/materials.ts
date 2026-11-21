import { assetsPublicationFact } from './publication.ts'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { settingsAssetsProjectionFact } from '@omne-harness/settings-local'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { MAX_ASSET_PAGE } from '@omne-harness/assets'
import { HANDLER, LIST_HANDLER, MIGRATION, PARTICIPANT, PROTOCOL, TABLES } from './schema.ts'
function file(name: string) {
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const url = new URL(`./${name}.${extension}`, import.meta.url)
  return {
    moduleUrl: url.href,
    digest: createHash('sha256').update(readFileSync(url)).digest('hex'),
  }
}
export function assetsSqlMaterials(): Pick<
  SqlMaterialCatalog,
  'participants' | 'migrations' | 'readHandlers'
> {
  const participant = file('participant'),
    migration = file('migration'),
    reader = file('read'),
    lister = file('list')
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
        providesFacts: [settingsAssetsProjectionFact, assetsPublicationFact],
        allowedFunctions: [],
        grouping: 'groupable',
      },
    ],
    migrations: [
      { ...MIGRATION, moduleUrl: migration.moduleUrl, checksum: migration.digest, requires: [] },
    ],
    readHandlers: [
      {
        handler: HANDLER,
        protocol: PROTOCOL,
        moduleUrl: reader.moduleUrl,
        codeDigest: reader.digest,
        ordering: 'snapshot',
        readTables: TABLES,
        requiresMigrations: [MIGRATION],
        maxRowsRead: 5,
        maxOutputBytes: 2 * 1024 * 1024,
      },
      {
        handler: LIST_HANDLER,
        protocol: PROTOCOL,
        moduleUrl: lister.moduleUrl,
        codeDigest: lister.digest,
        ordering: 'snapshot',
        readTables: TABLES,
        requiresMigrations: [MIGRATION],
        maxRowsRead: 3 * MAX_ASSET_PAGE + 2,
        maxOutputBytes: 2 * 1024 * 1024,
      },
    ],
  }
}
