import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import {
  TERMINAL_FACT,
  TERMINAL_HANDLER,
  TERMINAL_MIGRATION,
  TERMINAL_PARTICIPANT,
  TERMINAL_PROTOCOL,
  TERMINAL_TABLE,
} from './terminal-schema.ts'

function material(name: string) {
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const url = new URL(`./${name}.${extension}`, import.meta.url)
  return {
    moduleUrl: url.href,
    digest: createHash('sha256').update(readFileSync(url)).digest('hex'),
  }
}
export function hitlSqlMaterials(): Pick<
  SqlMaterialCatalog,
  'participants' | 'migrations' | 'readHandlers'
> {
  const participant = material('terminal-participant')
  const migration = material('terminal-migration')
  const reader = material('terminal-read')
  return {
    participants: [
      {
        participant: TERMINAL_PARTICIPANT,
        protocol: TERMINAL_PROTOCOL,
        moduleUrl: participant.moduleUrl,
        codeDigest: participant.digest,
        ownedTables: [TERMINAL_TABLE],
        readTables: [],
        requiresFacts: [],
        providesFacts: [TERMINAL_FACT],
        allowedFunctions: [],
        grouping: 'groupable',
      },
    ],
    migrations: [
      {
        ...TERMINAL_MIGRATION,
        moduleUrl: migration.moduleUrl,
        checksum: migration.digest,
        requires: [],
      },
    ],
    readHandlers: [
      {
        handler: TERMINAL_HANDLER,
        protocol: TERMINAL_PROTOCOL,
        moduleUrl: reader.moduleUrl,
        codeDigest: reader.digest,
        ordering: 'snapshot',
        readTables: [TERMINAL_TABLE],
        requiresMigrations: [TERMINAL_MIGRATION],
        maxRowsRead: 1,
        maxOutputBytes: 32768,
      },
    ],
  }
}
