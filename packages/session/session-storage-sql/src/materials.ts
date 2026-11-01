// The static materials of the Session storage: two participants (`session` and `execution-record`),
// their three migrations (two of `session`: the log and the execution index) and their read
// handlers, as the SQL storage contract describes them
// (sql-contract SPEC 4). The `session` participant reads the same-root index tables of
// `execution-record` (sql-contract SPEC 4.1: a read table of another participant of the same
// combination). The application
// aggregates these with the materials of the other owners into one catalog and declares the
// combination; this member never builds a catalog, a Cordis service or a domain registration.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type {
  MigrationDescriptor,
  ParticipantDescriptor,
  ReadHandlerDescriptor,
} from '@omne-harness/sql-contract'
import {
  EXECUTION_RECORD_PARTICIPANT,
  EXECUTION_RECORD_PROTOCOL,
  SESSION_PARTICIPANT,
} from './participants.ts'
import {
  EXECUTION_RECORD_INDEX_TABLES,
  EXECUTION_RECORD_MIGRATION,
  EXECUTION_RECORD_TABLES,
} from './worker/execution-record-schema.ts'
import {
  EXECUTION_INDEX_MIGRATION,
  EXECUTION_INDEX_TABLES,
  MIGRATION,
  PROTOCOL,
  SESSION_TABLES,
} from './worker/schema.ts'

const extension = import.meta.url.endsWith('.ts') ? '.ts' : '.js'

function module(name: string): Readonly<{ moduleUrl: string; digest: string }> {
  const moduleUrl = new URL(`./worker/${name}${extension}`, import.meta.url).href
  const digest = createHash('sha256')
    .update(readFileSync(fileURLToPath(moduleUrl)))
    .digest('hex')
  return { moduleUrl, digest }
}

const migrationRef = Object.freeze({ owner: MIGRATION.owner, id: MIGRATION.id })
const indexMigrationRef = Object.freeze({
  owner: EXECUTION_INDEX_MIGRATION.owner,
  id: EXECUTION_INDEX_MIGRATION.id,
})
const recordMigrationRef = Object.freeze({
  owner: EXECUTION_RECORD_MIGRATION.owner,
  id: EXECUTION_RECORD_MIGRATION.id,
})

type Handler = Readonly<{
  handler: string
  file: string
  tables: readonly string[]
  /** The protocol of the participant the handler reads for; the Session protocol by default. */
  protocol?: string
  /** The migrations whose tables the handler reads; the Session migration by default. */
  migrations?: readonly Readonly<{ owner: string; id: string }>[]
}>

export const HANDLERS: readonly Handler[] = [
  { handler: 'session.work', file: 'read-work', tables: ['sl_journal', 'sl_state'] },
  { handler: 'session.input', file: 'read-input', tables: ['sl_journal', 'sl_input'] },
  {
    handler: 'session.model-selection',
    file: 'read-model-selection',
    tables: ['sl_journal', 'sl_state', 'sl_entry', 'sl_operation'],
  },
  {
    handler: 'session.history',
    file: 'read-history',
    tables: ['sl_journal', 'sl_entry', 'sl_annotation_idx'],
  },
  {
    handler: 'session.model-view',
    file: 'read-model-view',
    tables: ['sl_journal', 'sl_model_view'],
  },
  { handler: 'session.pending', file: 'read-pending', tables: ['sl_pending_idx'] },
  { handler: 'session.references', file: 'read-references', tables: ['sl_resident_idx'] },
  {
    handler: 'session.released-scopes',
    file: 'read-released-scopes',
    tables: ['sl_released_scope_idx'],
  },
  {
    handler: 'session.history-root',
    file: 'read-history-root',
    tables: ['sl_journal', 'sl_entry', 'er_root'],
    migrations: [migrationRef, recordMigrationRef],
  },
  {
    handler: 'session.execution',
    file: 'read-execution-session',
    tables: ['sl_execution_idx'],
    migrations: [indexMigrationRef],
  },
  {
    handler: 'execution-record.state',
    file: 'read-execution-state',
    tables: ['er_root', 'er_state'],
    protocol: EXECUTION_RECORD_PROTOCOL,
    migrations: [recordMigrationRef],
  },
  {
    handler: 'execution-record.operation',
    file: 'read-execution-operation',
    tables: ['er_operation'],
    protocol: EXECUTION_RECORD_PROTOCOL,
    migrations: [recordMigrationRef],
  },
]

export type SessionStorageMaterials = Readonly<{
  participants: readonly ParticipantDescriptor[]
  migrations: readonly MigrationDescriptor[]
  readHandlers: readonly ReadHandlerDescriptor[]
}>

/** Reads the module files once and returns the descriptors with their digests. */
export function sessionStorageMaterials(): SessionStorageMaterials {
  const participant = module('participant')
  const record = module('execution-record')
  const migration = module('migration')
  const recordMigration = module('execution-record-migration')
  const indexMigration = module('execution-index-migration')
  return {
    participants: [
      {
        participant: EXECUTION_RECORD_PARTICIPANT,
        protocol: EXECUTION_RECORD_PROTOCOL,
        moduleUrl: record.moduleUrl,
        codeDigest: record.digest,
        ownedTables: EXECUTION_RECORD_TABLES,
        readTables: [],
        requiresFacts: [],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'singleton',
      },
      {
        participant: SESSION_PARTICIPANT,
        protocol: PROTOCOL,
        moduleUrl: participant.moduleUrl,
        codeDigest: participant.digest,
        ownedTables: [...SESSION_TABLES, ...EXECUTION_INDEX_TABLES],
        readTables: EXECUTION_RECORD_INDEX_TABLES,
        requiresFacts: [],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'singleton',
      },
    ],
    migrations: [
      {
        ...migrationRef,
        moduleUrl: migration.moduleUrl,
        checksum: migration.digest,
        requires: [],
      },
      {
        ...recordMigrationRef,
        moduleUrl: recordMigration.moduleUrl,
        checksum: recordMigration.digest,
        requires: [],
      },
      {
        ...indexMigrationRef,
        moduleUrl: indexMigration.moduleUrl,
        checksum: indexMigration.digest,
        requires: [migrationRef],
      },
    ],
    readHandlers: HANDLERS.map(item => {
      const file = module(item.file)
      return {
        handler: item.handler,
        protocol: item.protocol ?? PROTOCOL,
        moduleUrl: file.moduleUrl,
        codeDigest: file.digest,
        ordering: 'snapshot',
        readTables: item.tables,
        requiresMigrations: item.migrations ?? [migrationRef],
        maxOutputBytes: 1 << 20,
        maxRowsRead: 2000,
      }
    }),
  }
}
