// The tables of the execution record participant. Every table is keyed by tenant first, and every
// statement of the participant and the read handlers filters on it. The participant never decodes
// the opaque state or answers; the index tables use the words of the Session history index.
export const EXECUTION_RECORD_SCHEMA: readonly string[] = [
  // The publication count of the Agent records of one session: one more per Agent publication.
  `CREATE TABLE er_root (
    tenant TEXT NOT NULL, session TEXT NOT NULL, published INTEGER NOT NULL,
    PRIMARY KEY (tenant, session)) STRICT`,
  // The opaque state of the Agent records of one session, as the provider prepared it.
  `CREATE TABLE er_state (
    tenant TEXT NOT NULL, session TEXT NOT NULL, state TEXT NOT NULL,
    PRIMARY KEY (tenant, session)) STRICT`,
  // The original answer of each operation; the key is unique per tenant.
  `CREATE TABLE er_operation (
    tenant TEXT NOT NULL, operation TEXT NOT NULL, session TEXT NOT NULL, execution TEXT NOT NULL,
    digest TEXT NOT NULL, answer TEXT NOT NULL, published INTEGER NOT NULL,
    PRIMARY KEY (tenant, operation)) STRICT`,
  // The head of each execution (the execution boundary of the same-root index).
  `CREATE TABLE er_execution (
    tenant TEXT NOT NULL, execution TEXT NOT NULL, session TEXT NOT NULL, revision INTEGER NOT NULL,
    receipt TEXT NOT NULL, emitted_through INTEGER NOT NULL, ended TEXT,
    PRIMARY KEY (tenant, execution)) STRICT`,
  `CREATE INDEX er_execution_session_idx ON er_execution (tenant, session, execution)`,
  // Each event: its sequence, original source and Session consequence kinds (fact boundary).
  `CREATE TABLE er_fact_idx (
    tenant TEXT NOT NULL, execution TEXT NOT NULL, sequence INTEGER NOT NULL, session TEXT NOT NULL,
    source TEXT NOT NULL, kinds TEXT NOT NULL,
    PRIMARY KEY (tenant, execution, sequence)) STRICT`,
  // Each input-taken batch, as its event wrote it.
  `CREATE TABLE er_batch_idx (
    tenant TEXT NOT NULL, execution TEXT NOT NULL, sequence INTEGER NOT NULL, session TEXT NOT NULL,
    source TEXT NOT NULL, batch TEXT NOT NULL,
    PRIMARY KEY (tenant, execution, sequence)) STRICT`,
  // The reverse input directory: every original acceptance of an input, in acceptance order.
  `CREATE TABLE er_admission_idx (
    tenant TEXT NOT NULL, session TEXT NOT NULL, input TEXT NOT NULL, ordinal INTEGER NOT NULL,
    execution TEXT NOT NULL, operation TEXT NOT NULL, accepted TEXT NOT NULL, grant_ref TEXT NOT NULL,
    attachment TEXT NOT NULL,
    PRIMARY KEY (tenant, session, input, ordinal)) STRICT`,
]

export const EXECUTION_RECORD_TABLES: readonly string[] = [
  'er_root',
  'er_state',
  'er_operation',
  'er_execution',
  'er_fact_idx',
  'er_batch_idx',
  'er_admission_idx',
]

/**
 * The same-root index: the tables the `session` participant and the root handler read. `er_fact`
 * is created by `execution-record/006-fact-blob`, `er_admission_attempt_idx` by
 * `execution-record/003-admission-attempt`; the readers of these tables require both.
 */
export const EXECUTION_RECORD_INDEX_TABLES: readonly string[] = [
  'er_root',
  'er_execution',
  'er_fact',
  'er_admission_idx',
  'er_admission_attempt_idx',
]

export const EXECUTION_RECORD_MIGRATION = Object.freeze({
  owner: 'execution-record',
  id: '001-execution-record',
})

// The preadmission records of the execution record provider (M-GENERATION SaveIntent, Commit and
// Lookup): one record per handoff H, saved before the provider answers. `entry` (Ki) is unique per
// tenant when present; SQLite and PostgreSQL both keep NULLs distinct in a unique index, so a record
// without Ki takes no Ki slot. `session` and `execution` may be absent: a first invoke may have no
// Run yet, and the table infers none. `intent` and `outcome` are opaque canonical JSON.
export const PREADMISSION_SCHEMA: readonly string[] = [
  `CREATE TABLE er_preadmission (
    tenant TEXT NOT NULL, handoff TEXT NOT NULL, entry TEXT, session TEXT, execution TEXT,
    intent TEXT NOT NULL, intent_digest TEXT NOT NULL, outcome TEXT, outcome_digest TEXT,
    PRIMARY KEY (tenant, handoff)) STRICT`,
  `CREATE UNIQUE INDEX er_preadmission_entry_idx ON er_preadmission (tenant, entry)`,
]

export const PREADMISSION_TABLES: readonly string[] = ['er_preadmission']

export const PREADMISSION_MIGRATION = Object.freeze({
  owner: 'execution-record',
  id: '002-preadmission',
})

// The original attempt of one admission (the SE15 whose advance the acceptance was granted under),
// in a table beside `er_admission_idx` with the same key. `grant_ref` keeps the Agent's own receipt
// of the acceptance and does not name an attempt, so a Run with more than one SE15 cannot prove the
// original one from the admission row. The sqlite-provider migration port does not let `ALTER TABLE
// ADD COLUMN` through on a STRICT table (the check SQLite runs after it uses `pragma_quick_check`),
// so the attempt is a table, as the operation evidence is. A legacy row, or one by a writer that
// names no attempt, has no row here and the reader answers `unavailable` for it instead of guessing.
export const ADMISSION_ATTEMPT_SCHEMA: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS er_admission_attempt_idx (
    tenant TEXT NOT NULL, session TEXT NOT NULL, input TEXT NOT NULL, ordinal INTEGER NOT NULL,
    attempt TEXT NOT NULL,
    PRIMARY KEY (tenant, session, input, ordinal)) STRICT`,
]

export const ADMISSION_ATTEMPT_TABLES: readonly string[] = ['er_admission_attempt_idx']

export const ADMISSION_ATTEMPT_MIGRATION = Object.freeze({
  owner: 'execution-record',
  id: '003-admission-attempt',
})

// The Agent records of one session split into parts (session-adapters K-8): the provider names each
// part and writes only the parts a publication changed, so a write does not grow with the number of
// executions of the session. A part is opaque, as `er_state.state` is. `published` is the
// publication count of the write that last wrote the part, so a reader that holds the parts of an
// earlier count reads only the parts written after it. A dropped part stays as a row whose state is
// NULL, for the same reader. `er_state` keeps the whole state of a writer that does not split it.
export const STATE_PART_SCHEMA: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS er_state_part (
    tenant TEXT NOT NULL, session TEXT NOT NULL, part TEXT NOT NULL, state TEXT,
    published INTEGER NOT NULL,
    PRIMARY KEY (tenant, session, part)) STRICT`,
]

export const STATE_PART_TABLES: readonly string[] = ['er_state_part']

export const STATE_PART_MIGRATION = Object.freeze({
  owner: 'execution-record',
  id: '004-state-parts',
})

// The body of each fact row (C-WORKCACHE design §5.2, path P): the normalized consequences and the
// deferred control evidence the same publication wrote into its interpretation notes, in a table
// beside `er_fact_idx` with the same key, so an interpreter reads the events after its progress
// from append-only rows instead of the records of the whole execution. NULL `consequences` means
// not decided; NULL `control` means not a deferred control fact. A fact row of a writer that
// writes no body (or of a publication before this table) has no row here. A table, not columns,
// for the reason `er_admission_attempt_idx` gives.
export const FACT_BODY_SCHEMA: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS er_fact_body (
    tenant TEXT NOT NULL, execution TEXT NOT NULL, sequence INTEGER NOT NULL, session TEXT NOT NULL,
    consequences TEXT, control TEXT,
    PRIMARY KEY (tenant, execution, sequence)) STRICT`,
]

export const FACT_BODY_TABLES: readonly string[] = ['er_fact_body']

export const FACT_BODY_MIGRATION = Object.freeze({
  owner: 'execution-record',
  id: '005-fact-body',
})

// The Agent facts as the second append-only family of the session log (R2-D292), and the content
// blocks of the tenant (TB-04). Migration `execution-record/006-fact-blob` drops the tables the
// facts replace: the whole and partitioned opaque state (`er_state`, `er_state_part`) and the
// three event tables that `er_fact` merges (`er_fact_idx`, `er_fact_body`, `er_batch_idx`). It
// recreates `er_operation` without the `answer` column: an answer is derived from the batch of
// the operation and is not stored. 0.0.x moves no old data: the records of a session published
// before this migration are gone, and its reads answer `missing`.
//
// `er_fact` is one row per fact. `pub` is the publication of the batch (the session's
// `er_root.published` after the write) and `ord` its place in the batch. The row at `ord = 0` is
// the envelope of the batch and the only row that names the operation (`op`); every other row has
// `op` NULL. `eseq` is the event sequence of a fact that is an event, NULL otherwise; `kinds` is
// the JSON array of its Session consequence kinds (empty for a fact that is not an event), and
// `event` the JSON of its event projection (source, consequences, control, batch), which Session
// reads (K-5). `body` is the JSON of the fact, opaque to this member. The primary key is the second
// gate of a concurrent write: a write that passed the count check at a position another write took
// collides here and rolls back.
export const FACT_BLOB_SCHEMA: readonly string[] = [
  'DROP TABLE IF EXISTS er_state',
  'DROP TABLE IF EXISTS er_state_part',
  'DROP TABLE IF EXISTS er_fact_body',
  'DROP TABLE IF EXISTS er_fact_idx',
  'DROP TABLE IF EXISTS er_batch_idx',
  'DROP TABLE IF EXISTS er_operation',
  `CREATE TABLE er_operation (
    tenant TEXT NOT NULL, operation TEXT NOT NULL, session TEXT NOT NULL, execution TEXT NOT NULL,
    digest TEXT NOT NULL, published INTEGER NOT NULL,
    PRIMARY KEY (tenant, operation)) STRICT`,
  `CREATE TABLE er_fact (
    tenant TEXT NOT NULL, session TEXT NOT NULL, pub INTEGER NOT NULL, ord INTEGER NOT NULL,
    execution TEXT NOT NULL, kind TEXT NOT NULL, eseq INTEGER, op TEXT, kinds TEXT NOT NULL,
    event BLOB, body BLOB NOT NULL,
    CHECK (pub > 0 AND ord >= 0),
    CHECK ((ord = 0) = (op IS NOT NULL)),
    CHECK ((eseq IS NULL) = (event IS NULL)),
    PRIMARY KEY (tenant, session, pub, ord)) STRICT, WITHOUT ROWID`,
  // The events of one execution in sequence order; a sequence is written once.
  'CREATE UNIQUE INDEX er_fact_event ON er_fact (tenant, execution, eseq) WHERE eseq IS NOT NULL',
  // One batch per operation: only the envelope row names it.
  'CREATE UNIQUE INDEX er_fact_operation ON er_fact (tenant, op) WHERE ord = 0',
  // The facts of one execution in publication order, for the cold start of an open execution.
  'CREATE INDEX er_fact_execution ON er_fact (tenant, execution, pub, ord)',
  // One content block of the tenant by its digest (TB-04): stored once per tenant, never per
  // session, and never shared across tenants. `size` is the UTF-8 byte count of `payload`.
  `CREATE TABLE sl_blob (
    tenant TEXT NOT NULL, digest TEXT NOT NULL, media TEXT NOT NULL, size INTEGER NOT NULL,
    payload BLOB NOT NULL,
    PRIMARY KEY (tenant, digest)) STRICT, WITHOUT ROWID`,
]

/** The tables of `execution-record/006-fact-blob`. */
export const FACT_BLOB_TABLES: readonly string[] = ['er_fact', 'sl_blob']

/**
 * The tables that `execution-record/006-fact-blob` drops. The participant still owns their names:
 * the migrations before it create them on a fresh database, and the migration port lets a
 * migration drop only the tables of its owner. No statement of the participant or of a read
 * handler touches them.
 */
export const RETIRED_TABLES: readonly string[] = [
  'er_state',
  'er_state_part',
  'er_fact_idx',
  'er_fact_body',
  'er_batch_idx',
]

export const FACT_BLOB_MIGRATION = Object.freeze({
  owner: 'execution-record',
  id: '006-fact-blob',
})
