import { SETTINGS_INTENT_MIGRATION, SETTINGS_INTENT_TABLES } from './intent-migration.ts'
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
import {
  GUARD_FACT,
  HANDLER,
  MIGRATION,
  SOURCE_LAYOUT_MIGRATION,
  PARTICIPANT,
  PROTOCOL,
  RESULT_FACT,
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
export function settingsSqlMaterials(): Pick<
  SqlMaterialCatalog,
  'participants' | 'migrations' | 'readHandlers'
> {
  const participant = file('participant')
  const migration = file('migration')
  const intentMigration = file('intent-migration')
  const sources = file('source-layout-migration')
  const reader = file('read')
  const terminal = file('terminal-participant')
  const terminalMigration = file('terminal-migration')
  const terminalReader = file('terminal-read')
  return {
    participants: [
      {
        participant: TERMINAL_PARTICIPANT,
        protocol: TERMINAL_PROTOCOL,
        moduleUrl: terminal.moduleUrl,
        codeDigest: terminal.digest,
        ownedTables: [TERMINAL_TABLE],
        readTables: [],
        requiresFacts: [],
        providesFacts: [TERMINAL_FACT],
        allowedFunctions: [],
        grouping: 'groupable',
      },
      {
        participant: PARTICIPANT,
        protocol: PROTOCOL,
        moduleUrl: participant.moduleUrl,
        codeDigest: participant.digest,
        ownedTables: [...TABLES, ...SETTINGS_INTENT_TABLES],
        readTables: [],
        requiresFacts: [GUARD_FACT, TERMINAL_FACT],
        providesFacts: [RESULT_FACT],
        allowedFunctions: [],
        grouping: 'groupable',
      },
    ],
    migrations: [
      {
        ...SETTINGS_INTENT_MIGRATION,
        moduleUrl: intentMigration.moduleUrl,
        checksum: intentMigration.digest,
        requires: [MIGRATION],
      },
      {
        ...TERMINAL_MIGRATION,
        moduleUrl: terminalMigration.moduleUrl,
        checksum: terminalMigration.digest,
        requires: [],
      },
      { ...MIGRATION, moduleUrl: migration.moduleUrl, checksum: migration.digest, requires: [] },
      {
        ...SOURCE_LAYOUT_MIGRATION,
        moduleUrl: sources.moduleUrl,
        checksum: sources.digest,
        requires: [MIGRATION],
      },
    ],
    readHandlers: [
      {
        handler: TERMINAL_HANDLER,
        protocol: TERMINAL_PROTOCOL,
        moduleUrl: terminalReader.moduleUrl,
        codeDigest: terminalReader.digest,
        ordering: 'snapshot',
        readTables: [TERMINAL_TABLE],
        requiresMigrations: [TERMINAL_MIGRATION],
        maxOutputBytes: 32768,
        maxRowsRead: 1,
      },
      {
        handler: HANDLER,
        protocol: PROTOCOL,
        moduleUrl: reader.moduleUrl,
        codeDigest: reader.digest,
        ordering: 'snapshot',
        readTables: TABLES,
        requiresMigrations: [MIGRATION, SOURCE_LAYOUT_MIGRATION],
        maxRowsRead: 102,
        maxOutputBytes: 2 * 1024 * 1024,
      },
    ],
  }
}
