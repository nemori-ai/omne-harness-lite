import {
  AUTHORIZATION_CONTEXT_MIGRATION,
  AUTHORIZATION_CONTEXT_TABLES,
  PERMISSION_CURRENT_MIGRATION,
  PERMISSION_CURRENT_TABLES,
} from './worker/permission-current-schema.ts'
import {
  SESSION_AUTHORIZATION_GUARD,
  SESSION_PERMISSION_CURRENT_FACT,
  SESSION_PERMISSION_GUARD,
} from './permission-current.ts'
import {
  SESSION_ORDINARY_BASIS,
  SESSION_COMMIT_BASIS,
  SESSION_COMMIT_PROTOCOL,
} from './commit-basis.ts'
import { createHash } from 'node:crypto'
import { SESSION_RUN_LIVE_FACT, SESSION_RUN_LIVE_GUARD } from './run-live.ts'
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
  ADMISSION_ATTEMPT_MIGRATION,
  ADMISSION_ATTEMPT_TABLES,
  FACT_BLOB_MIGRATION,
  FACT_BLOB_TABLES,
  FACT_BODY_MIGRATION,
  FACT_BODY_TABLES,
  ITEM_MIGRATION,
  ITEM_TABLES,
  EXECUTION_RECORD_INDEX_TABLES,
  EXECUTION_RECORD_MIGRATION,
  EXECUTION_RECORD_TABLES,
  PREADMISSION_MIGRATION,
  PREADMISSION_TABLES,
  STATE_PART_MIGRATION,
  STATE_PART_TABLES,
} from './worker/execution-record-schema.ts'
import {
  EXECUTION_INDEX_MIGRATION,
  EXECUTION_INDEX_TABLES,
  MIGRATION,
  OPERATION_EVIDENCE_MIGRATION,
  OPERATION_EVIDENCE_TABLES,
  PROTOCOL,
  SESSION_TABLES,
  STATE_ITEM_MIGRATION,
  STATE_ITEM_TABLES,
  ATTEMPT_GRANT_MIGRATION,
  ATTEMPT_GRANT_TABLES,
  SCOPE_INDEX_MIGRATION,
  SCOPE_INDEX_TABLES,
  SESSION_LIST_HELD,
  SESSION_LIST_MIGRATION,
  SESSION_LIST_SCAN_ROWS,
  SESSION_LIST_TABLES,
  SESSION_ARCHIVE_MIGRATION,
  SESSION_ARCHIVE_TABLES,
  SESSION_STANDING_MIGRATION,
} from './worker/schema.ts'
import {
  COMPACTION_INDEX_MIGRATION,
  COMPACTION_INDEX_TABLES,
} from './worker/compaction-index-migration.ts'
import { CALL_LEFT_MIGRATION, CALL_LEFT_TABLES } from './worker/call-left.ts'
import { FORK_MIGRATION, FORK_TABLES } from './worker/fork.ts'

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
const evidenceMigrationRef = Object.freeze({
  owner: OPERATION_EVIDENCE_MIGRATION.owner,
  id: OPERATION_EVIDENCE_MIGRATION.id,
})
const stateItemMigrationRef = Object.freeze({
  owner: STATE_ITEM_MIGRATION.owner,
  id: STATE_ITEM_MIGRATION.id,
})
const attemptGrantMigrationRef = Object.freeze({
  owner: ATTEMPT_GRANT_MIGRATION.owner,
  id: ATTEMPT_GRANT_MIGRATION.id,
})
const scopeIndexMigrationRef = Object.freeze({
  owner: SCOPE_INDEX_MIGRATION.owner,
  id: SCOPE_INDEX_MIGRATION.id,
})
const sessionListMigrationRef = Object.freeze({
  owner: SESSION_LIST_MIGRATION.owner,
  id: SESSION_LIST_MIGRATION.id,
})
const sessionArchiveMigrationRef = Object.freeze({
  owner: SESSION_ARCHIVE_MIGRATION.owner,
  id: SESSION_ARCHIVE_MIGRATION.id,
})
const sessionStandingMigrationRef = Object.freeze({
  owner: SESSION_STANDING_MIGRATION.owner,
  id: SESSION_STANDING_MIGRATION.id,
})
const recordMigrationRef = Object.freeze({
  owner: EXECUTION_RECORD_MIGRATION.owner,
  id: EXECUTION_RECORD_MIGRATION.id,
})
const preadmissionMigrationRef = Object.freeze({
  owner: PREADMISSION_MIGRATION.owner,
  id: PREADMISSION_MIGRATION.id,
})
const admissionAttemptMigrationRef = Object.freeze({
  owner: ADMISSION_ATTEMPT_MIGRATION.owner,
  id: ADMISSION_ATTEMPT_MIGRATION.id,
})
const statePartMigrationRef = Object.freeze({
  owner: STATE_PART_MIGRATION.owner,
  id: STATE_PART_MIGRATION.id,
})
const factBodyMigrationRef = Object.freeze({
  owner: FACT_BODY_MIGRATION.owner,
  id: FACT_BODY_MIGRATION.id,
})
const factBlobMigrationRef = Object.freeze({
  owner: FACT_BLOB_MIGRATION.owner,
  id: FACT_BLOB_MIGRATION.id,
})
const itemMigrationRef = Object.freeze({ owner: ITEM_MIGRATION.owner, id: ITEM_MIGRATION.id })
const indexMigrations = [
  migrationRef,
  attemptGrantMigrationRef,
  recordMigrationRef,
  admissionAttemptMigrationRef,
  factBlobMigrationRef,
]
const factMigrations = [migrationRef, recordMigrationRef, factBlobMigrationRef]
const itemMigrations = [...factMigrations, itemMigrationRef]

export type SessionStorageMaterialsOptions = Readonly<{
  readOutputLimitBytes: number
}>

function requireReadOutputLimit(options: SessionStorageMaterialsOptions | undefined): number {
  const limit: unknown = options?.readOutputLimitBytes
  if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1)
    throw new TypeError('readOutputLimitBytes must be a positive safe integer')
  return limit
}

type Handler = Readonly<{
  handler: string
  file: string
  tables: readonly string[]
  protocol?: string
  migrations?: readonly Readonly<{ owner: string; id: string }>[]
  maxRowsRead?: number
}>

const MAX_ROWS_READ = 2000
const WORK_ROWS_READ = 4000

export const HANDLERS: readonly Handler[] = [
  {
    handler: 'session.compaction-input-check',
    file: 'check-compaction-input',
    tables: ['sl_journal', 'sl_model_view', 'sl_blob', ...COMPACTION_INDEX_TABLES],
    migrations: [...factMigrations, COMPACTION_INDEX_MIGRATION],
    maxRowsRead: 300_010,
  },
  {
    handler: 'session.compaction-context',
    file: 'read-compaction-context',
    tables: ['sl_journal', 'sl_model_view', 'sl_blob', ...COMPACTION_INDEX_TABLES],
    migrations: [...factMigrations, COMPACTION_INDEX_MIGRATION],
    maxRowsRead: 200_010,
  },
  {
    handler: 'session.entry-message',
    file: 'read-entry-message',
    tables: ['sl_journal', 'sl_model_view', 'sl_entry', 'sl_blob'],
    migrations: [...factMigrations, COMPACTION_INDEX_MIGRATION],
    maxRowsRead: 8,
  },
  {
    handler: 'session.permission-mode',
    file: 'read-permission-mode',
    tables: ['sl_permission_head', 'sl_journal', 'sl_entry'],
    migrations: [PERMISSION_CURRENT_MIGRATION],
    maxRowsRead: MAX_ROWS_READ + 1,
  },
  {
    handler: 'session.permission-current',
    file: 'read-permission-current',
    tables: [...PERMISSION_CURRENT_TABLES, ...AUTHORIZATION_CONTEXT_TABLES],
    migrations: [PERMISSION_CURRENT_MIGRATION, AUTHORIZATION_CONTEXT_MIGRATION],
    // The permission row and its assignment; the authorization revision and the two rows asked for.
    maxRowsRead: 5,
  },
  {
    handler: 'session.work',
    file: 'read-work',
    tables: [
      'sl_journal',
      'sl_state',
      ...STATE_ITEM_TABLES,
      'sl_entry',
      ...ATTEMPT_GRANT_TABLES,
      ...EXECUTION_RECORD_INDEX_TABLES,
    ],
    migrations: [stateItemMigrationRef, ...indexMigrations],
    maxRowsRead: WORK_ROWS_READ,
  },
  {
    handler: 'session.current-scope',
    file: 'read-current-scope',
    tables: ['sl_journal', 'sl_state', ...STATE_ITEM_TABLES],
    migrations: [stateItemMigrationRef],
    maxRowsRead: 3,
  },
  {
    handler: 'session.work-version',
    file: 'read-work-version',
    tables: ['sl_journal', 'er_root'],
    migrations: [migrationRef, recordMigrationRef],
  },
  {
    handler: 'session.work-index',
    file: 'read-work-index',
    tables: ['sl_journal', 'sl_entry', ...ATTEMPT_GRANT_TABLES, ...EXECUTION_RECORD_INDEX_TABLES],
    migrations: indexMigrations,
  },
  {
    handler: 'session.calls-left',
    file: 'read-calls-left',
    tables: [...CALL_LEFT_TABLES],
    migrations: [migrationRef, CALL_LEFT_MIGRATION],
  },
  {
    handler: 'session.work-reads',
    file: 'read-work-reads',
    tables: ['sl_journal', 'sl_entry', ...ATTEMPT_GRANT_TABLES, ...EXECUTION_RECORD_INDEX_TABLES],
    migrations: indexMigrations,
  },
  {
    handler: 'session.binding',
    file: 'read-binding',
    tables: ['sl_journal', 'sl_entry'],
  },
  { handler: 'session.input', file: 'read-input', tables: ['sl_journal', 'sl_input'] },
  {
    handler: 'session.model-selection',
    file: 'read-model-selection',
    tables: ['sl_journal', 'sl_state', ...STATE_ITEM_TABLES, 'sl_entry', 'sl_operation'],
    migrations: [migrationRef, stateItemMigrationRef],
  },
  {
    handler: 'session.history',
    file: 'read-history',
    tables: ['sl_journal', 'sl_entry', 'sl_annotation_idx', 'sl_blob'],
    migrations: factMigrations,
  },
  {
    handler: 'session.fork-point',
    file: 'read-fork-point',
    tables: ['sl_journal', 'sl_model_view', 'sl_entry', ...FORK_TABLES],
    migrations: [migrationRef, FORK_MIGRATION],
    maxRowsRead: 128,
  },
  {
    handler: 'session.model-view',
    file: 'read-model-view',
    tables: ['sl_journal', 'sl_model_view', 'sl_blob', ...FORK_TABLES],
    migrations: [...factMigrations, FORK_MIGRATION],
  },
  { handler: 'session.pending', file: 'read-pending', tables: ['sl_pending_idx'] },
  {
    handler: 'session.search-sessions',
    file: 'read-search-sessions',
    tables: ['sl_journal', 'sl_session_list'],
    migrations: [...factMigrations, sessionListMigrationRef],
    maxRowsRead: 40_010,
  },
  {
    handler: 'session.search-stamp',
    file: 'read-search-stamp',
    tables: ['sl_journal', 'sl_session_list'],
    migrations: [...factMigrations, sessionListMigrationRef],
    maxRowsRead: 4,
  },
  {
    handler: 'session.search-entries',
    file: 'read-search-entries',
    tables: ['sl_journal', 'sl_entry', 'sl_blob', 'sl_commit_time'],
    migrations: [...factMigrations, sessionListMigrationRef],
    maxRowsRead: 4000,
  },
  {
    handler: 'session.list',
    file: 'read-session-list',
    tables: ['sl_session_list'],
    migrations: [sessionStandingMigrationRef],
    maxRowsRead: SESSION_LIST_SCAN_ROWS + 2,
  },
  {
    handler: 'session.list-archived',
    file: 'read-archived-sessions',
    tables: ['sl_session_list', 'sl_session_archive'],
    migrations: [sessionArchiveMigrationRef, sessionStandingMigrationRef],
    maxRowsRead: SESSION_LIST_SCAN_ROWS + 2,
  },

  { handler: 'session.references', file: 'read-references', tables: ['sl_resident_idx'] },
  {
    handler: 'session.released-scopes',
    file: 'read-released-scopes',
    tables: ['sl_released_scope_idx'],
  },
  {
    handler: 'session.scope-owner',
    file: 'read-scope-owner',
    tables: SCOPE_INDEX_TABLES,
    migrations: [scopeIndexMigrationRef],
    maxRowsRead: 1,
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
    handler: 'execution-record.facts',
    file: 'read-execution-batches',
    tables: ['sl_journal', 'er_root', 'er_fact'],
    protocol: EXECUTION_RECORD_PROTOCOL,
    migrations: factMigrations,
  },
  {
    handler: 'execution-record.open-executions',
    file: 'read-execution-open',
    tables: ['sl_journal', 'er_root', 'er_fact', 'er_execution'],
    protocol: EXECUTION_RECORD_PROTOCOL,
    migrations: factMigrations,
  },
  {
    handler: 'execution-record.events',
    file: 'read-execution-events',
    tables: ['sl_journal', 'er_root', 'er_fact', 'er_execution'],
    protocol: EXECUTION_RECORD_PROTOCOL,
    migrations: factMigrations,
  },
  {
    handler: 'execution-record.operation',
    file: 'read-execution-operation',
    tables: ['er_operation', 'er_fact'],
    protocol: EXECUTION_RECORD_PROTOCOL,
    migrations: [recordMigrationRef, factBlobMigrationRef],
  },
  {
    handler: 'execution-record.blob',
    file: 'read-blob',
    tables: ['sl_blob'],
    protocol: EXECUTION_RECORD_PROTOCOL,
    migrations: [factBlobMigrationRef],
  },
  {
    handler: 'execution-record.blobs',
    file: 'read-blobs',
    tables: ['sl_blob'],
    protocol: EXECUTION_RECORD_PROTOCOL,
    migrations: [factBlobMigrationRef],
    maxRowsRead: 20_000,
  },
  {
    handler: 'execution-record.open-items',
    file: 'read-execution-open-items',
    tables: ['sl_journal', 'er_root', 'er_fact', 'er_execution', ...ITEM_TABLES],
    protocol: EXECUTION_RECORD_PROTOCOL,
    migrations: itemMigrations,
  },
  {
    handler: 'execution-record.items',
    file: 'read-execution-items',
    tables: ['sl_journal', 'er_root', 'er_fact', 'er_execution', ...ITEM_TABLES],
    protocol: EXECUTION_RECORD_PROTOCOL,
    migrations: itemMigrations,
  },
  {
    handler: 'execution-record.preadmission',
    file: 'read-preadmission',
    tables: PREADMISSION_TABLES,
    protocol: EXECUTION_RECORD_PROTOCOL,
    migrations: [preadmissionMigrationRef],
  },
]

export type SessionStorageMaterials = Readonly<{
  participants: readonly ParticipantDescriptor[]
  migrations: readonly MigrationDescriptor[]
  readHandlers: readonly ReadHandlerDescriptor[]
}>

function migrationOf(
  ref: Readonly<{ owner: string; id: string }>,
  file: string,
  requires: readonly Readonly<{ owner: string; id: string }>[],
): MigrationDescriptor {
  const found = module(file)
  return { ...ref, moduleUrl: found.moduleUrl, checksum: found.digest, requires }
}

/** A guard reads in the commit's transaction and writes nothing. */
function guardOf(
  participant: string,
  file: string,
  readTables: readonly string[],
  providesFacts: ParticipantDescriptor['providesFacts'],
): ParticipantDescriptor {
  const found = module(file)
  return {
    participant,
    protocol: '1',
    moduleUrl: found.moduleUrl,
    codeDigest: found.digest,
    ownedTables: [],
    readTables,
    requiresFacts: [],
    providesFacts,
    allowedFunctions: [],
    grouping: 'singleton',
  }
}

export function sessionStorageMaterials(
  options: SessionStorageMaterialsOptions,
): SessionStorageMaterials {
  const readOutputLimitBytes = requireReadOutputLimit(options)
  const participant = module('participant')
  const ordinaryBasis = module('ordinary-basis')
  const record = module('execution-record')
  return {
    participants: [
      guardOf(
        SESSION_RUN_LIVE_GUARD,
        'run-live-guard',
        ['sl_journal', 'sl_state', ...STATE_ITEM_TABLES],
        [SESSION_RUN_LIVE_FACT],
      ),
      guardOf(SESSION_PERMISSION_GUARD, 'permission-current-guard', PERMISSION_CURRENT_TABLES, [
        SESSION_PERMISSION_CURRENT_FACT,
      ]),
      guardOf(SESSION_AUTHORIZATION_GUARD, 'authorization-guard', AUTHORIZATION_CONTEXT_TABLES, []),
      {
        participant: EXECUTION_RECORD_PARTICIPANT,
        protocol: EXECUTION_RECORD_PROTOCOL,
        moduleUrl: record.moduleUrl,
        codeDigest: record.digest,
        ownedTables: [
          ...EXECUTION_RECORD_TABLES,
          ...PREADMISSION_TABLES,
          ...ADMISSION_ATTEMPT_TABLES,
          ...STATE_PART_TABLES,
          ...FACT_BODY_TABLES,
          ...FACT_BLOB_TABLES,
          ...ITEM_TABLES,
        ],
        readTables: [],
        requiresFacts: [],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'singleton',
      },
      {
        participant: SESSION_PARTICIPANT,
        protocol: SESSION_COMMIT_PROTOCOL,
        moduleUrl: participant.moduleUrl,
        codeDigest: participant.digest,
        ownedTables: [
          ...SESSION_TABLES,
          ...COMPACTION_INDEX_TABLES,
          ...CALL_LEFT_TABLES,
          ...FORK_TABLES,
          ...PERMISSION_CURRENT_TABLES,
          ...AUTHORIZATION_CONTEXT_TABLES,
          ...EXECUTION_INDEX_TABLES,
          ...OPERATION_EVIDENCE_TABLES,
          ...STATE_ITEM_TABLES,
          ...ATTEMPT_GRANT_TABLES,
          ...SCOPE_INDEX_TABLES,
          ...SESSION_LIST_TABLES,
          SESSION_LIST_HELD,
          ...SESSION_ARCHIVE_TABLES,
        ],
        readTables: [...EXECUTION_RECORD_INDEX_TABLES, 'sl_blob'],
        requiresFacts: [SESSION_COMMIT_BASIS],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'singleton',
      },
      {
        participant: SESSION_ORDINARY_BASIS,
        protocol: '1',
        moduleUrl: ordinaryBasis.moduleUrl,
        codeDigest: ordinaryBasis.digest,
        ownedTables: [],
        readTables: [],
        requiresFacts: [],
        providesFacts: [SESSION_COMMIT_BASIS],
        allowedFunctions: [],
        grouping: 'singleton',
      },
    ],
    migrations: [
      migrationOf(migrationRef, 'migration', []),
      migrationOf(recordMigrationRef, 'execution-record-migration', []),
      migrationOf(indexMigrationRef, 'execution-index-migration', [migrationRef]),
      migrationOf(evidenceMigrationRef, 'operation-evidence-migration', [indexMigrationRef]),
      migrationOf(stateItemMigrationRef, 'state-item-migration', [evidenceMigrationRef]),
      migrationOf(attemptGrantMigrationRef, 'attempt-grant-migration', [stateItemMigrationRef]),
      migrationOf(PERMISSION_CURRENT_MIGRATION, 'permission-current-migration', [
        attemptGrantMigrationRef,
      ]),
      migrationOf(scopeIndexMigrationRef, 'scope-index-migration', [migrationRef]),
      migrationOf(sessionListMigrationRef, 'session-list-migration', [stateItemMigrationRef]),
      migrationOf(COMPACTION_INDEX_MIGRATION, 'compaction-index-migration', [migrationRef]),
      migrationOf(sessionArchiveMigrationRef, 'session-archive-migration', [
        sessionListMigrationRef,
      ]),
      migrationOf(AUTHORIZATION_CONTEXT_MIGRATION, 'authorization-context-migration', [
        PERMISSION_CURRENT_MIGRATION,
      ]),
      migrationOf(CALL_LEFT_MIGRATION, 'call-left-migration', [migrationRef]),
      migrationOf(FORK_MIGRATION, 'fork-migration', [COMPACTION_INDEX_MIGRATION]),
      migrationOf(sessionStandingMigrationRef, 'session-standing-migration', [
        sessionArchiveMigrationRef,
      ]),
      migrationOf(preadmissionMigrationRef, 'preadmission-migration', [recordMigrationRef]),
      migrationOf(admissionAttemptMigrationRef, 'admission-attempt-migration', [
        recordMigrationRef,
      ]),
      migrationOf(statePartMigrationRef, 'state-part-migration', [recordMigrationRef]),
      migrationOf(factBodyMigrationRef, 'fact-body-migration', [recordMigrationRef]),
      migrationOf(factBlobMigrationRef, 'fact-blob-migration', [
        recordMigrationRef,
        statePartMigrationRef,
        factBodyMigrationRef,
      ]),
      migrationOf(itemMigrationRef, 'item-migration', [factBlobMigrationRef]),
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
        maxOutputBytes: readOutputLimitBytes,
        maxRowsRead: item.maxRowsRead ?? MAX_ROWS_READ,
      }
    }),
  }
}
