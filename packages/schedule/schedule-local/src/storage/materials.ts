import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type {
  MigrationDescriptor,
  ParticipantDescriptor,
  ReadHandlerDescriptor,
} from '@omne-harness/sql-contract'
import {
  DOMAIN,
  GUARD_FACT,
  HANDLER,
  MIGRATION,
  PARTICIPANT,
  PROTOCOL,
  RESULT_FACT,
  TABLES,
} from './schema.ts'

export type ScheduleManagementSqlMaterials = Readonly<{
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
export function scheduleManagementSqlMaterials(): ScheduleManagementSqlMaterials {
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
        requiresFacts: [GUARD_FACT],
        providesFacts: [RESULT_FACT],
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
        maxRowsRead: 505,
        maxOutputBytes: 8 * 1024 * 1024,
      },
    ],
  }
}
export {
  DOMAIN as scheduleManagementTransactionDomain,
  PARTICIPANT as scheduleManagementPersistenceParticipant,
  PROTOCOL as scheduleManagementPersistenceProtocol,
  HANDLER as scheduleManagementReadHandler,
  GUARD_FACT as scheduleManagementGuardsFact,
  RESULT_FACT as scheduleManagementResultFact,
}
