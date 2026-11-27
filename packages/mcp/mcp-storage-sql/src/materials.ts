import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type {
  MigrationDescriptor,
  ParticipantDescriptor,
  ReadHandlerDescriptor,
} from '@omne-harness/sql-contract'
import {
  GRANT_MIGRATION,
  SUBSCRIPTION_MIGRATION,
  HANDLER,
  MIGRATION,
  OWNED_TABLES,
  PARTICIPANT,
  PROTOCOL,
} from './schema.ts'

export type McpSqlMaterials = Readonly<{
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

/** What an assembly adds to its storage combination so that the facts of MCP outlive a restart. */
export function mcpSqlMaterials(): McpSqlMaterials {
  const participant = file('participant')
  const migration = file('migration')
  const grants = file('migration-grants')
  const subscriptions = file('migration-subscriptions')
  const reader = file('read')
  return {
    participants: [
      {
        participant: PARTICIPANT,
        protocol: PROTOCOL,
        moduleUrl: participant.moduleUrl,
        codeDigest: participant.digest,
        ownedTables: OWNED_TABLES,
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
        ...GRANT_MIGRATION,
        moduleUrl: grants.moduleUrl,
        checksum: grants.digest,
        requires: [MIGRATION],
      },
      {
        ...SUBSCRIPTION_MIGRATION,
        moduleUrl: subscriptions.moduleUrl,
        checksum: subscriptions.digest,
        requires: [GRANT_MIGRATION],
      },
    ],
    readHandlers: [
      {
        handler: HANDLER,
        protocol: PROTOCOL,
        moduleUrl: reader.moduleUrl,
        codeDigest: reader.digest,
        ordering: 'snapshot',
        readTables: OWNED_TABLES,
        requiresMigrations: [MIGRATION, GRANT_MIGRATION, SUBSCRIPTION_MIGRATION],
        maxRowsRead: 1000,
        maxOutputBytes: 8 * 1024 * 1024,
      },
    ],
  }
}

export { PARTICIPANT as mcpStoreParticipant }
