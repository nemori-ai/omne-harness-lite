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

/** The same-root index: the tables the `session` participant and the root handler read. */
export const EXECUTION_RECORD_INDEX_TABLES: readonly string[] = [
  'er_root',
  'er_execution',
  'er_fact_idx',
  'er_batch_idx',
  'er_admission_idx',
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
