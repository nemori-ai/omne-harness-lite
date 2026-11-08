// The static materials of the Model records: one participant, one migration and three read handlers,
// as the SQL storage contract describes them (sql-contract §4). Each module is named by its file
// URL and the SHA-256 of its bytes; a provider loads it by the default export of that file. The
// application aggregates these with the materials of the other owners into one catalog and declares
// the combination; this member never builds a catalog, a Cordis service or a domain registration.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type {
  MigrationDescriptor,
  ParticipantDescriptor,
  ReadHandlerDescriptor,
} from '@omne-harness/sql-contract'
import {
  DIAGNOSTICS_HANDLER,
  DIAGNOSTICS_READ_MAX_OUTPUT_BYTES,
  DIAGNOSTICS_READ_MAX_ROWS,
} from './diagnostics.ts'
import {
  CALL_HANDLER,
  CALL_READ_MAX_OUTPUT_BYTES,
  CALL_READ_MAX_ROWS,
  PENDING_HANDLER,
  PENDING_READ_MAX_ROWS,
} from './reads.ts'
import { MIGRATION, MODEL_PARTICIPANT, MODEL_TABLES, PROTOCOL, TABLES } from './schema.ts'

/** `maxOutputBytes` of `model.pending`: one page of at most 1000 call identities and a flag. */
export const PENDING_READ_MAX_OUTPUT_BYTES = 1 << 20

const extension = import.meta.url.endsWith('.ts') ? '.ts' : '.js'

function module(name: string): Readonly<{ moduleUrl: string; digest: string }> {
  const moduleUrl = new URL(`./${name}${extension}`, import.meta.url).href
  const digest = createHash('sha256')
    .update(readFileSync(fileURLToPath(moduleUrl)))
    .digest('hex')
  return { moduleUrl, digest }
}

const migrationRef = Object.freeze({ owner: MIGRATION.owner, id: MIGRATION.id })

type Handler = Readonly<{
  handler: string
  file: string
  tables: readonly string[]
  rows: number
  bytes: number
}>

/**
 * All reads are snapshots: `run` reads one call and commits against its row version (CAS), so a
 * read that misses a newer commit ends in a conflict and a new read, never in a lost write. The
 * diagnostics read pins the row version in its cursor, so a page after a newer commit is invalid.
 */
const HANDLERS: readonly Handler[] = [
  {
    handler: CALL_HANDLER,
    file: 'handler-call',
    tables: MODEL_TABLES,
    rows: CALL_READ_MAX_ROWS,
    bytes: CALL_READ_MAX_OUTPUT_BYTES,
  },
  {
    handler: PENDING_HANDLER,
    file: 'handler-pending',
    tables: [TABLES.call.name],
    rows: PENDING_READ_MAX_ROWS,
    bytes: PENDING_READ_MAX_OUTPUT_BYTES,
  },
  {
    handler: DIAGNOSTICS_HANDLER,
    file: 'handler-diagnostics',
    tables: [TABLES.call.name, TABLES.dispatch.name],
    rows: DIAGNOSTICS_READ_MAX_ROWS,
    bytes: DIAGNOSTICS_READ_MAX_OUTPUT_BYTES,
  },
]

export type ModelStorageMaterials = Readonly<{
  participants: readonly ParticipantDescriptor[]
  migrations: readonly MigrationDescriptor[]
  readHandlers: readonly ReadHandlerDescriptor[]
}>

/** Reads the module files once and returns the descriptors with their digests. */
export function modelStorageMaterials(): ModelStorageMaterials {
  const participant = module('commit')
  const migration = module('schema')
  return {
    participants: [
      {
        participant: MODEL_PARTICIPANT,
        protocol: PROTOCOL,
        moduleUrl: participant.moduleUrl,
        codeDigest: participant.digest,
        ownedTables: MODEL_TABLES,
        readTables: [],
        requiresFacts: [],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'singleton',
      },
    ],
    migrations: [
      { ...migrationRef, moduleUrl: migration.moduleUrl, checksum: migration.digest, requires: [] },
    ],
    readHandlers: HANDLERS.map(item => {
      const file = module(item.file)
      return {
        handler: item.handler,
        protocol: PROTOCOL,
        moduleUrl: file.moduleUrl,
        codeDigest: file.digest,
        ordering: 'snapshot',
        readTables: item.tables,
        requiresMigrations: [migrationRef],
        maxOutputBytes: item.bytes,
        maxRowsRead: item.rows,
      }
    }),
  }
}
