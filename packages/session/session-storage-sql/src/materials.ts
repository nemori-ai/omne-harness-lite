// The static materials of the Session storage: two participants (`session` and `execution-record`),
// their eight migrations (three of `session`: the log, the execution index and the operation
// evidence table; five of `execution-record`: its records, the preadmission records, the
// original attempt of an admission, the state parts and the fact bodies) and their
// read handlers, as the SQL storage contract describes them
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
  ADMISSION_ATTEMPT_MIGRATION,
  ADMISSION_ATTEMPT_TABLES,
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
}>

export const HANDLERS: readonly Handler[] = [
  {
    handler: 'session.work',
    file: 'read-work',
    // The snapshot with the history index of its pending inputs (history-index.ts).
    tables: ['sl_journal', 'sl_state', 'sl_entry', ...EXECUTION_RECORD_INDEX_TABLES],
    // It reads `er_admission_attempt_idx`, which the third migration of `execution-record` creates.
    migrations: [migrationRef, recordMigrationRef, admissionAttemptMigrationRef],
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
    tables: ['sl_journal', 'sl_entry', ...EXECUTION_RECORD_INDEX_TABLES],
    migrations: [migrationRef, recordMigrationRef, admissionAttemptMigrationRef],
  },
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
    handler: 'execution-record.parts',
    file: 'read-execution-parts',
    tables: ['er_root', 'er_state', ...STATE_PART_TABLES],
    protocol: EXECUTION_RECORD_PROTOCOL,
    migrations: [recordMigrationRef, statePartMigrationRef],
  },
  {
    handler: 'execution-record.operation',
    file: 'read-execution-operation',
    tables: ['er_operation'],
    protocol: EXECUTION_RECORD_PROTOCOL,
    migrations: [recordMigrationRef],
  },
  {
    // Path P of C-WORKCACHE: the facts of one execution after a sequence, from the append-only rows.
    handler: 'execution-record.execution-facts',
    file: 'read-execution-facts',
    tables: ['er_execution', 'er_fact_idx', ...FACT_BODY_TABLES],
    protocol: EXECUTION_RECORD_PROTOCOL,
    migrations: [recordMigrationRef, factBodyMigrationRef],
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
  const participant = module('participant')
  const record = module('execution-record')
  const migration = module('migration')
  const recordMigration = module('execution-record-migration')
  const indexMigration = module('execution-index-migration')
  const evidenceMigration = module('operation-evidence-migration')
  const preadmissionMigration = module('preadmission-migration')
  const admissionAttemptMigration = module('admission-attempt-migration')
  const statePartMigration = module('state-part-migration')
  const factBodyMigration = module('fact-body-migration')
  return {
    participants: [
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
        ],
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
        ownedTables: [...SESSION_TABLES, ...EXECUTION_INDEX_TABLES, ...OPERATION_EVIDENCE_TABLES],
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
      {
        ...evidenceMigrationRef,
        moduleUrl: evidenceMigration.moduleUrl,
        checksum: evidenceMigration.digest,
        requires: [indexMigrationRef],
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
        maxRowsRead: 2000,
      }
    }),
  }
}
