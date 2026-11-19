import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type {
  MigrationDescriptor,
  ParticipantDescriptor,
  ReadHandlerDescriptor,
} from '@omne-harness/sql-contract'
import {
  ALL_TABLES,
  HANDLER,
  MIGRATION,
  PARTICIPANT,
  PROTOCOL,
  ROW_LIMIT,
  SOURCES_MIGRATION,
} from './schema.ts'

export type WorkspaceSqlMaterials = Readonly<{
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

/** What an assembly adds to its storage combination so that workspaces can be stored. */
export function workspaceSqlMaterials(): WorkspaceSqlMaterials {
  const participant = file('participant')
  const migration = file('migration')
  const sources = file('migration-sources')
  const reader = file('read')
  return {
    participants: [
      {
        participant: PARTICIPANT,
        protocol: PROTOCOL,
        moduleUrl: participant.moduleUrl,
        codeDigest: participant.digest,
        ownedTables: ALL_TABLES,
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
        ...SOURCES_MIGRATION,
        moduleUrl: sources.moduleUrl,
        checksum: sources.digest,
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
        readTables: ALL_TABLES,
        requiresMigrations: [MIGRATION, SOURCES_MIGRATION],
        maxRowsRead: 4 * ROW_LIMIT,
        maxOutputBytes: 8 * 1024 * 1024,
      },
    ],
  }
}

export {
  DOMAIN as workspaceStorageDomain,
  PARTICIPANT as workspacePersistenceParticipant,
} from './schema.ts'
