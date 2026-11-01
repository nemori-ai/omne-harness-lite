// The static materials of the Tool storage: one participant, one migration and three read handlers,
// as the SQL storage contract describes them (sql-contract §4). The application aggregates these
// with the materials of the other owners into one catalog and declares the combination; this
// member never builds a catalog, a Cordis service or a domain registration.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type {
  MigrationDescriptor,
  ParticipantDescriptor,
  ReadHandlerDescriptor,
  ReadOrdering,
} from '@omne-harness/sql-contract'
import {
  CHUNK_READ_HANDLER,
  LEDGER_READ_HANDLER,
  LEDGER_READ_ROWS,
  MANIFEST_READ_HANDLER,
  MIGRATION,
  PARTICIPANT,
  PROTOCOL,
  READ_OUTPUT_BYTES,
  TOOL_TABLES,
} from './worker/schema.ts'

/** The participant name that a combination lists for the Tool storage; its tables start with `tl_`. */
export const TOOL_PARTICIPANT = PARTICIPANT

const extension = import.meta.url.endsWith('.ts') ? '.ts' : '.js'

function module(name: string): Readonly<{ moduleUrl: string; digest: string }> {
  const moduleUrl = new URL(`./worker/${name}${extension}`, import.meta.url).href
  const digest = createHash('sha256')
    .update(readFileSync(fileURLToPath(moduleUrl)))
    .digest('hex')
  return { moduleUrl, digest }
}

const migrationRef = Object.freeze({ owner: MIGRATION.owner, id: MIGRATION.id })

type Handler = Readonly<{
  handler: string
  file: string
  ordering: ReadOrdering
  tables: readonly string[]
  rows: number
}>

/**
 * The ledger domain read is `domain-serial`: it is ordered after every write admitted before it
 * (sql-contract §9.3, §17). The custody reads are snapshots: a manifest is immutable once committed.
 */
const HANDLERS: readonly Handler[] = [
  {
    handler: LEDGER_READ_HANDLER,
    file: 'read-ledger',
    ordering: 'domain-serial',
    tables: ['tl_domain', 'tl_record'],
    rows: LEDGER_READ_ROWS + 2,
  },
  {
    handler: MANIFEST_READ_HANDLER,
    file: 'read-manifest',
    ordering: 'snapshot',
    tables: ['tl_manifest'],
    rows: 1,
  },
  {
    handler: CHUNK_READ_HANDLER,
    file: 'read-chunk',
    ordering: 'snapshot',
    tables: ['tl_chunk'],
    rows: 1,
  },
]

export type ToolStorageMaterials = Readonly<{
  participants: readonly ParticipantDescriptor[]
  migrations: readonly MigrationDescriptor[]
  readHandlers: readonly ReadHandlerDescriptor[]
}>

/** Reads the module files once and returns the descriptors with their digests. */
export function toolStorageMaterials(): ToolStorageMaterials {
  const participant = module('participant')
  const migration = module('migration')
  return {
    participants: [
      {
        participant: TOOL_PARTICIPANT,
        protocol: PROTOCOL,
        moduleUrl: participant.moduleUrl,
        codeDigest: participant.digest,
        ownedTables: TOOL_TABLES,
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
        ordering: item.ordering,
        readTables: item.tables,
        requiresMigrations: [migrationRef],
        maxOutputBytes: READ_OUTPUT_BYTES,
        maxRowsRead: item.rows,
      }
    }),
  }
}
