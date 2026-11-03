import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type {
  MigrationDescriptor,
  ParticipantDescriptor,
  ReadHandlerDescriptor,
} from '@omne-harness/sql-contract'
import {
  AUTHORITY_FACT,
  HANDLER,
  MIGRATION,
  PAGE_LIMIT,
  PARTICIPANT,
  PROTOCOL,
  RESULT_FACT,
  TABLES,
} from './schema.ts'

export type CalendarSqlMaterials = Readonly<{
  participants: readonly ParticipantDescriptor[]
  migrations: readonly MigrationDescriptor[]
  readHandlers: readonly ReadHandlerDescriptor[]
}>
function file(name: string) {
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const url = new URL(`./${name}.${extension}`, import.meta.url)
  return {
    moduleUrl: url.href,
    digest: createHash('sha256').update(readFileSync(url)).digest('hex'),
  }
}
export function calendarSqlMaterials(): CalendarSqlMaterials {
  const participant = file('participant')
  const migration = file('migration')
  const reader = file('read')
  return {
    participants: [
      {
        participant: PARTICIPANT,
        protocol: PROTOCOL,
        moduleUrl: participant.moduleUrl,
        codeDigest: participant.digest,
        ownedTables: TABLES,
        readTables: [],
        requiresFacts: [AUTHORITY_FACT],
        providesFacts: [RESULT_FACT],
        allowedFunctions: [],
        grouping: 'singleton',
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
        ordering: 'domain-serial',
        readTables: TABLES,
        requiresMigrations: [MIGRATION],
        maxRowsRead: PAGE_LIMIT + 1,
        maxOutputBytes: 8 * 1024 * 1024,
      },
    ],
  }
}
export {
  AUTHORITY_FACT as calendarPersistenceAuthorityFact,
  RESULT_FACT as calendarPersistenceResultFact,
  DOMAIN as calendarTransactionDomain,
  PARTICIPANT as calendarPersistenceParticipant,
} from './schema.ts'
