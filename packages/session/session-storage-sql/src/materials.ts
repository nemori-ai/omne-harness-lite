import {
  PERMISSION_CURRENT_MIGRATION,
  PERMISSION_CURRENT_TABLES,
} from './worker/permission-current-schema.ts'
import { SESSION_PERMISSION_CURRENT_FACT, SESSION_PERMISSION_GUARD } from './permission-current.ts'
import {
  SESSION_ORDINARY_BASIS,
  SESSION_COMMIT_BASIS,
  SESSION_COMMIT_RESULT,
  SESSION_COMMIT_PROTOCOL,
} from './commit-basis.ts'
// The static materials of the Session storage: two participants (`session` and `execution-record`),
// their ten migrations (four of `session`: the log, the execution index, the operation evidence
// table and the snapshot chunks; six of `execution-record`: its records, the preadmission records,
// the original attempt of an admission, the state parts, the fact bodies, and the fact family with
// the content blocks that replaces the state parts and the fact bodies) and their
// read handlers, as the SQL storage contract describes them
// (sql-contract SPEC 4). The `session` participant reads the same-root index tables of
// `execution-record` (sql-contract SPEC 4.1: a read table of another participant of the same
// combination). The application
// aggregates these with the materials of the other owners into one catalog and declares the
// combination; this member never builds a catalog, a Cordis service or a domain registration.
import { createHash } from 'node:crypto'
import { SESSION_EXECUTION_CURRENT_FACT, SESSION_EXECUTION_GUARD } from './execution-current.ts'
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
/**
 * What a reader of the same-root index requires: the Session log, the grants of its attempts
 * (`session/005`), `er_fact` and the attempts of the admissions.
 */
const indexMigrations = [
  migrationRef,
  attemptGrantMigrationRef,
  recordMigrationRef,
  admissionAttemptMigrationRef,
  factBlobMigrationRef,
]
/** What a read of the Agent fact family requires: the session gate reads `sl_journal`. */
const factMigrations = [migrationRef, recordMigrationRef, factBlobMigrationRef]

/**
 * What the application decides when it builds the materials. There is no default: the limit is an
 * assembly parameter, and the member holds no value of its own (SPEC K-1). A long session must not
 * fail at a small limit, because the Session snapshot that `session.work` hands out whole grows with
 * every round (session SPEC SN-1); the release picks the value. The provider refuses a handler
 * above its `maxReadResultBytes`, and every read reserves this amount of `globalReadResultBytes`, so
 * an assembly sets both to at least this value (sqlite-provider SPEC 12.1).
 */
export type SessionStorageMaterialsOptions = Readonly<{
  /** The `maxOutputBytes` of every read handler of this member: a positive safe integer. */
  readOutputLimitBytes: number
}>

/** Rejects a limit that is not a positive safe integer, so a wrong assembly fails where it builds. */
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
  /** The protocol of the participant the handler reads for; the Session protocol by default. */
  protocol?: string
  /** The migrations whose tables the handler reads; the Session migration by default. */
  migrations?: readonly Readonly<{ owner: string; id: string }>[]
  /** The rows one read may read; `MAX_ROWS_READ` by default. */
  maxRowsRead?: number
}>

/** The rows one read of a handler may read, unless the handler names its own bound. */
const MAX_ROWS_READ = 2000
/**
 * The rows one `session.work` read may read: at most 1000 index rows, and the snapshot rows. A
 * snapshot of 20 MiB (the recommended output limit) is about 1300 full chunks of 16 KiB and a few
 * small ones, so the row bound does not stop a snapshot that the byte bound lets through (R2-D292).
 */
const WORK_ROWS_READ = 4000

export const HANDLERS: readonly Handler[] = [
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
    tables: PERMISSION_CURRENT_TABLES,
    migrations: [PERMISSION_CURRENT_MIGRATION],
    maxRowsRead: 2,
  },
  {
    handler: 'session.work',
    file: 'read-work',
    // The snapshot with the history index of its pending inputs (history-index.ts).
    tables: [
      'sl_journal',
      'sl_state',
      ...STATE_ITEM_TABLES,
      'sl_entry',
      ...ATTEMPT_GRANT_TABLES,
      ...EXECUTION_RECORD_INDEX_TABLES,
    ],
    // It reads the snapshot chunks (`session/004`), the attempt grants (`session/005`),
    // `er_admission_attempt_idx` (`execution-record/003`) and `er_fact` (`/006`).
    migrations: [stateItemMigrationRef, ...indexMigrations],
    maxRowsRead: WORK_ROWS_READ,
  },
  {
    // The version check of the work cache (SPEC RT-04): two point reads, no snapshot row.
    handler: 'session.work-version',
    file: 'read-work-version',
    tables: ['sl_journal', 'er_root'],
    migrations: [migrationRef, recordMigrationRef],
  },
  {
    // The index of a snapshot the work cache folded (SPEC RT-04): the tables of `session.work`
    // without the snapshot row, answered only at the version the cache folded to.
    handler: 'session.work-index',
    file: 'read-work-index',
    tables: ['sl_journal', 'sl_entry', ...ATTEMPT_GRANT_TABLES, ...EXECUTION_RECORD_INDEX_TABLES],
    migrations: indexMigrations,
  },
  {
    // The basis a committed batch was reduced on (SPEC RT-04): its index and reads, read at the
    // position before the batch and the same publication count.
    handler: 'session.work-reads',
    file: 'read-work-reads',
    tables: ['sl_journal', 'sl_entry', ...ATTEMPT_GRANT_TABLES, ...EXECUTION_RECORD_INDEX_TABLES],
    migrations: indexMigrations,
  },
  {
    // The ownership of a session and the evidence that created it (D-AUTH r4 4.1): the journal row
    // and the entries of the first batch, no snapshot row.
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
    // The batches of the fact family of one session after a publication (incremental read).
    handler: 'execution-record.facts',
    file: 'read-execution-batches',
    tables: ['sl_journal', 'er_root', 'er_fact'],
    protocol: EXECUTION_RECORD_PROTOCOL,
    migrations: factMigrations,
  },
  {
    // The open executions of one session (cold start).
    handler: 'execution-record.open-executions',
    file: 'read-execution-open',
    tables: ['sl_journal', 'er_root', 'er_fact', 'er_execution'],
    protocol: EXECUTION_RECORD_PROTOCOL,
    migrations: factMigrations,
  },
  {
    // The events of one execution after a sequence, by the event index.
    handler: 'execution-record.events',
    file: 'read-execution-events',
    tables: ['sl_journal', 'er_root', 'er_fact', 'er_execution'],
    protocol: EXECUTION_RECORD_PROTOCOL,
    migrations: factMigrations,
  },
  {
    // The operation key and the facts of its batch.
    handler: 'execution-record.operation',
    file: 'read-execution-operation',
    tables: ['er_operation', 'er_fact'],
    protocol: EXECUTION_RECORD_PROTOCOL,
    migrations: [recordMigrationRef, factBlobMigrationRef],
  },
  {
    // One content block of the tenant by its digest.
    handler: 'execution-record.blob',
    file: 'read-blob',
    tables: ['sl_blob'],
    protocol: EXECUTION_RECORD_PROTOCOL,
    migrations: [factBlobMigrationRef],
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

/**
 * Reads the module files once and returns the descriptors with their digests. The read output limit
 * is required; a missing or invalid one throws before any file is read.
 */
export function sessionStorageMaterials(
  options: SessionStorageMaterialsOptions,
): SessionStorageMaterials {
  const readOutputLimitBytes = requireReadOutputLimit(options)
  const permissionMigration = module('permission-current-migration')
  const permissionGuard = module('permission-current-guard')
  const executionGuard = module('execution-current-guard')
  const participant = module('participant')
  const ordinaryBasis = module('ordinary-basis')
  const record = module('execution-record')
  const migration = module('migration')
  const recordMigration = module('execution-record-migration')
  const indexMigration = module('execution-index-migration')
  const evidenceMigration = module('operation-evidence-migration')
  const stateItemMigration = module('state-item-migration')
  const attemptGrantMigration = module('attempt-grant-migration')
  const preadmissionMigration = module('preadmission-migration')
  const admissionAttemptMigration = module('admission-attempt-migration')
  const statePartMigration = module('state-part-migration')
  const factBodyMigration = module('fact-body-migration')
  const factBlobMigration = module('fact-blob-migration')
  return {
    participants: [
      {
        participant: SESSION_EXECUTION_GUARD,
        protocol: '1',
        moduleUrl: executionGuard.moduleUrl,
        codeDigest: executionGuard.digest,
        ownedTables: [],
        readTables: ['er_execution'],
        requiresFacts: [],
        providesFacts: [SESSION_EXECUTION_CURRENT_FACT],
        allowedFunctions: [],
        grouping: 'singleton',
      },
      {
        participant: SESSION_PERMISSION_GUARD,
        protocol: '1',
        moduleUrl: permissionGuard.moduleUrl,
        codeDigest: permissionGuard.digest,
        ownedTables: [],
        readTables: PERMISSION_CURRENT_TABLES,
        requiresFacts: [],
        providesFacts: [SESSION_PERMISSION_CURRENT_FACT],
        allowedFunctions: [],
        grouping: 'singleton',
      },
      {
        participant: EXECUTION_RECORD_PARTICIPANT,
        protocol: EXECUTION_RECORD_PROTOCOL,
        moduleUrl: record.moduleUrl,
        codeDigest: record.digest,
        // The tables of 001, 004 and 005 that 006 drops stay owned (RETIRED_TABLES): a fresh
        // database runs those migrations first, and a migration drops only its owner's tables.
        ownedTables: [
          ...EXECUTION_RECORD_TABLES,
          ...PREADMISSION_TABLES,
          ...ADMISSION_ATTEMPT_TABLES,
          ...STATE_PART_TABLES,
          ...FACT_BODY_TABLES,
          ...FACT_BLOB_TABLES,
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
          ...PERMISSION_CURRENT_TABLES,
          ...EXECUTION_INDEX_TABLES,
          ...OPERATION_EVIDENCE_TABLES,
          ...STATE_ITEM_TABLES,
          ...ATTEMPT_GRANT_TABLES,
        ],
        readTables: EXECUTION_RECORD_INDEX_TABLES,
        requiresFacts: [SESSION_COMMIT_BASIS],
        providesFacts: [SESSION_COMMIT_RESULT],
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
      {
        ...evidenceMigrationRef,
        moduleUrl: evidenceMigration.moduleUrl,
        checksum: evidenceMigration.digest,
        requires: [indexMigrationRef],
      },
      {
        ...stateItemMigrationRef,
        moduleUrl: stateItemMigration.moduleUrl,
        checksum: stateItemMigration.digest,
        requires: [evidenceMigrationRef],
      },
      {
        ...attemptGrantMigrationRef,
        moduleUrl: attemptGrantMigration.moduleUrl,
        checksum: attemptGrantMigration.digest,
        requires: [stateItemMigrationRef],
      },
      {
        ...PERMISSION_CURRENT_MIGRATION,
        moduleUrl: permissionMigration.moduleUrl,
        checksum: permissionMigration.digest,
        requires: [attemptGrantMigrationRef],
      },
      {
        ...preadmissionMigrationRef,
        moduleUrl: preadmissionMigration.moduleUrl,
        checksum: preadmissionMigration.digest,
        requires: [recordMigrationRef],
      },
      {
        ...admissionAttemptMigrationRef,
        moduleUrl: admissionAttemptMigration.moduleUrl,
        checksum: admissionAttemptMigration.digest,
        requires: [recordMigrationRef],
      },
      {
        ...statePartMigrationRef,
        moduleUrl: statePartMigration.moduleUrl,
        checksum: statePartMigration.digest,
        requires: [recordMigrationRef],
      },
      {
        ...factBodyMigrationRef,
        moduleUrl: factBodyMigration.moduleUrl,
        checksum: factBodyMigration.digest,
        requires: [recordMigrationRef],
      },
      {
        // It drops the tables of 001, 004 and 005, so it runs after them.
        ...factBlobMigrationRef,
        moduleUrl: factBlobMigration.moduleUrl,
        checksum: factBlobMigration.digest,
        requires: [recordMigrationRef, statePartMigrationRef, factBodyMigrationRef],
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
        maxOutputBytes: readOutputLimitBytes,
        maxRowsRead: item.maxRowsRead ?? MAX_ROWS_READ,
      }
    }),
  }
}
