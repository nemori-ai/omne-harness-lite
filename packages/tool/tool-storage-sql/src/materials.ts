// The static materials of the Tool storage: its participant, two migrations and four read handlers,
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
  BODY_READ_CHUNKS,
  BODY_READ_HANDLER,
  DUE_READ_ENTRIES,
  DUE_READ_HANDLER,
  LEDGER_READ_HANDLER,
  LEDGER_READ_ROWS,
  MIGRATION,
  PARTICIPANT,
  PENDING_MIGRATION,
  PENDING_READ_HANDLER,
  PENDING_TABLES,
  PROTOCOL,
  READ_OUTPUT_BYTES,
  TOOL_TABLES,
} from './worker/schema.ts'
import { PENDING_READ_LIMIT } from './worker/facts.ts'

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
const pendingMigrationRef = Object.freeze({
  owner: PENDING_MIGRATION.owner,
  id: PENDING_MIGRATION.id,
})

type Handler = Readonly<{
  handler: string
  file: string
  ordering: ReadOrdering
  tables: readonly string[]
  rows: number
  requires: readonly Readonly<{ owner: string; id: string }>[]
}>

/**
 * The ledger domain read is `domain-serial`: it is ordered after every write admitted before it
 * (sql-contract §9.3, §17). The body read is a snapshot: a sealed body is immutable.
 */
const HANDLERS: readonly Handler[] = [
  {
    handler: LEDGER_READ_HANDLER,
    file: 'read-ledger',
    ordering: 'domain-serial',
    tables: ['tl_domain', 'tl_record'],
    rows: LEDGER_READ_ROWS + 2,
    requires: [migrationRef],
  },
  // 待办标记的一页也按 `domain-serial` 读：提交返回 committed 之后开始的扫描看得到它的标记。
  {
    handler: PENDING_READ_HANDLER,
    file: 'read-pending',
    ordering: 'domain-serial',
    tables: PENDING_TABLES,
    rows: PENDING_READ_LIMIT + 1,
    requires: [pendingMigrationRef],
  },
  {
    handler: BODY_READ_HANDLER,
    file: 'read-body',
    ordering: 'snapshot',
    tables: ['tl_body_manifest', 'tl_body_chunk'],
    rows: BODY_READ_CHUNKS + 1,
    requires: [migrationRef],
  },
  {
    handler: DUE_READ_HANDLER,
    file: 'read-due',
    ordering: 'domain-serial',
    tables: ['tl_due'],
    rows: DUE_READ_ENTRIES,
    requires: [migrationRef],
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
  const pendingMigration = module('migration-pending')
  return {
    participants: [
      {
        participant: TOOL_PARTICIPANT,
        protocol: PROTOCOL,
        moduleUrl: participant.moduleUrl,
        codeDigest: participant.digest,
        ownedTables: [...TOOL_TABLES, ...PENDING_TABLES],
        readTables: [],
        requiresFacts: [],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'singleton',
      },
    ],
    migrations: [
      { ...migrationRef, moduleUrl: migration.moduleUrl, checksum: migration.digest, requires: [] },
      {
        ...pendingMigrationRef,
        moduleUrl: pendingMigration.moduleUrl,
        checksum: pendingMigration.digest,
        requires: [migrationRef],
      },
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
        requiresMigrations: item.requires,
        maxOutputBytes: READ_OUTPUT_BYTES,
        maxRowsRead: item.rows,
      }
    }),
  }
}
