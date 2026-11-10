import {
  SETTINGS_SOURCE_CUSTODY_MIGRATION,
  SETTINGS_SOURCE_CUSTODY_TABLES,
} from './source-custody-migration.ts'
import { sourceSnapshotMaterials } from './source-snapshot-materials.ts'
import { sourceRetentionMaterials } from './source-retention-materials.ts'
import { SOURCE_WRITE_FACT } from './source-write.ts'
import { SETTINGS_INTENT_MIGRATION, SETTINGS_INTENT_TABLES } from './intent-migration.ts'
import { SETTINGS_PREPARING_MIGRATION } from './preparing-migration.ts'
import {
  SETTINGS_STANDING_CUSTODY_MIGRATION,
  SETTINGS_STANDING_CUSTODY_TABLE,
} from './standing-custody-migration.ts'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import {
  TERMINAL_MIGRATION,
  TERMINAL_PARTICIPANT,
  TERMINAL_PROTOCOL,
  TERMINAL_TABLE,
} from './terminal-schema.ts'
import { FINALIZATION_PLAN, FINALIZATION_TERMINAL } from './finalization-schema.ts'
import { preparationReadHandler, settingsPhaseParticipants } from './recovery-materials.ts'
import {
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
/**
 * The SQL catalog of Settings. A value is written only through preparation and commit; the
 * assembly registers the phase combinations from the exported participant sets.
 */
export function settingsSqlMaterials(): Pick<
  SqlMaterialCatalog,
  'participants' | 'migrations' | 'readHandlers'
> {
  const snapshot = sourceSnapshotMaterials()
  const retention = sourceRetentionMaterials()
  const participant = file('prepared-persistence')
  const migration = file('migration')
  const intentMigration = file('intent-migration')
  const preparingMigration = file('preparing-migration')
  const standingCustody = file('standing-custody-migration')
  const sourceCustody = file('source-custody-migration')
  const sources = file('source-layout-migration')
  const reader = file('read')
  const terminal = file('prepared-terminal-participant')
  const terminalMigration = file('terminal-migration')
  return {
    participants: [
      ...snapshot.participants,
      ...retention.participants,
      {
        participant: TERMINAL_PARTICIPANT,
        protocol: TERMINAL_PROTOCOL,
        moduleUrl: terminal.moduleUrl,
        codeDigest: terminal.digest,
        ownedTables: [TERMINAL_TABLE],
        readTables: [],
        requiresFacts: [FINALIZATION_PLAN],
        providesFacts: [FINALIZATION_TERMINAL],
        allowedFunctions: [],
        grouping: 'groupable',
      },
      {
        participant: PARTICIPANT,
        protocol: PROTOCOL,
        moduleUrl: participant.moduleUrl,
        codeDigest: participant.digest,
        ownedTables: [
          ...TABLES,
          ...SETTINGS_INTENT_TABLES,
          SETTINGS_STANDING_CUSTODY_TABLE,
          ...SETTINGS_SOURCE_CUSTODY_TABLES,
        ],
        readTables: [],
        requiresFacts: [FINALIZATION_PLAN, FINALIZATION_TERMINAL, SOURCE_WRITE_FACT],
        providesFacts: [RESULT_FACT],
        allowedFunctions: [],
        grouping: 'groupable',
      },
      ...settingsPhaseParticipants(),
    ],
    migrations: [
      {
        ...SETTINGS_SOURCE_CUSTODY_MIGRATION,
        moduleUrl: sourceCustody.moduleUrl,
        checksum: sourceCustody.digest,
        requires: [SETTINGS_PREPARING_MIGRATION],
      },
      ...retention.migrations,
      {
        ...SETTINGS_STANDING_CUSTODY_MIGRATION,
        moduleUrl: standingCustody.moduleUrl,
        checksum: standingCustody.digest,
        requires: [SETTINGS_PREPARING_MIGRATION],
      },
      {
        ...SETTINGS_PREPARING_MIGRATION,
        moduleUrl: preparingMigration.moduleUrl,
        checksum: preparingMigration.digest,
        requires: [SETTINGS_INTENT_MIGRATION],
      },
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
      ...retention.readHandlers,
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
      preparationReadHandler(),
    ],
  }
}
