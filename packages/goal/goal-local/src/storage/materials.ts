import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type {
  MigrationDescriptor,
  ParticipantDescriptor,
  ReadHandlerDescriptor,
} from '@omne-harness/sql-contract'
import {
  EXAMINER_MIGRATION,
  HANDLER,
  MIGRATION,
  PARTICIPANT,
  PROTOCOL,
  ROW_LIMIT,
  TABLES,
} from './schema.ts'

export type GoalSqlMaterials = Readonly<{
  participants: readonly ParticipantDescriptor[]
  migrations: readonly MigrationDescriptor[]
  readHandlers: readonly ReadHandlerDescriptor[]
}>

function file(name: string) {
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const url = new URL(`./${name}.${extension}`, import.meta.url)
  const digest = createHash('sha256').update(readFileSync(url)).digest('hex')
  return { moduleUrl: url.href, digest }
}

/** What an assembly adds to its storage combination so that goals can be stored. */
export function goalSqlMaterials(): GoalSqlMaterials {
  const participant = file('participant')
  const migration = file('migration')
  const examiner = file('examiner-migration')
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
        requiresFacts: [],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'groupable',
      },
    ],
    migrations: [
      { ...MIGRATION, moduleUrl: migration.moduleUrl, checksum: migration.digest, requires: [] },
      {
        ...EXAMINER_MIGRATION,
        moduleUrl: examiner.moduleUrl,
        checksum: examiner.digest,
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
        requiresMigrations: [MIGRATION, EXAMINER_MIGRATION],
        maxRowsRead: 4 * ROW_LIMIT,
        maxOutputBytes: 8 * 1024 * 1024,
      },
    ],
  }
}

export { PARTICIPANT as goalPersistenceParticipant }
