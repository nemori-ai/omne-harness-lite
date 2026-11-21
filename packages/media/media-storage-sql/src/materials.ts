import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type {
  MigrationDescriptor,
  ParticipantDescriptor,
  ReadHandlerDescriptor,
} from '@omne-harness/sql-contract'
import { HANDLER, MIGRATION, PARTICIPANT, PROTOCOL, TABLES } from './schema.ts'

export type MediaSqlMaterials = Readonly<{
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

/** What an assembly adds to its storage combination so that the metadata of media can be stored. */
export function mediaSqlMaterials(): MediaSqlMaterials {
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
        requiresFacts: [],
        providesFacts: [],
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
        maxRowsRead: 20_000,
        maxOutputBytes: 8 * 1024 * 1024,
      },
    ],
  }
}

export { PARTICIPANT as mediaIndexParticipant }
