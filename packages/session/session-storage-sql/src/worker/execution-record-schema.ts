export const EXECUTION_RECORD_SCHEMA: readonly string[] = [
  `CREATE TABLE er_root (
    tenant TEXT NOT NULL, session TEXT NOT NULL, published INTEGER NOT NULL,
    PRIMARY KEY (tenant, session)) STRICT`,
  `CREATE TABLE er_state (
    tenant TEXT NOT NULL, session TEXT NOT NULL, state TEXT NOT NULL,
    PRIMARY KEY (tenant, session)) STRICT`,
  `CREATE TABLE er_operation (
    tenant TEXT NOT NULL, operation TEXT NOT NULL, session TEXT NOT NULL, execution TEXT NOT NULL,
    digest TEXT NOT NULL, answer TEXT NOT NULL, published INTEGER NOT NULL,
    PRIMARY KEY (tenant, operation)) STRICT`,
  `CREATE TABLE er_execution (
    tenant TEXT NOT NULL, execution TEXT NOT NULL, session TEXT NOT NULL, revision INTEGER NOT NULL,
    receipt TEXT NOT NULL, emitted_through INTEGER NOT NULL, ended TEXT,
    acknowledged INTEGER NOT NULL DEFAULT 0, settled INTEGER, settled_by TEXT,
    PRIMARY KEY (tenant, execution)) STRICT`,
  `CREATE INDEX er_execution_session_idx ON er_execution (tenant, session, execution)`,
  `CREATE TABLE er_fact_idx (
    tenant TEXT NOT NULL, execution TEXT NOT NULL, sequence INTEGER NOT NULL, session TEXT NOT NULL,
    source TEXT NOT NULL, kinds TEXT NOT NULL,
    PRIMARY KEY (tenant, execution, sequence)) STRICT`,
  `CREATE TABLE er_batch_idx (
    tenant TEXT NOT NULL, execution TEXT NOT NULL, sequence INTEGER NOT NULL, session TEXT NOT NULL,
    source TEXT NOT NULL, batch TEXT NOT NULL,
    PRIMARY KEY (tenant, execution, sequence)) STRICT`,
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
  'CREATE UNIQUE INDEX er_fact_event ON er_fact (tenant, execution, eseq) WHERE eseq IS NOT NULL',
  'CREATE UNIQUE INDEX er_fact_operation ON er_fact (tenant, op) WHERE ord = 0',
  'CREATE INDEX er_fact_execution ON er_fact (tenant, execution, pub, ord)',
  `CREATE TABLE sl_blob (
    tenant TEXT NOT NULL, digest TEXT NOT NULL, media TEXT NOT NULL, size INTEGER NOT NULL,
    payload BLOB NOT NULL,
    PRIMARY KEY (tenant, digest)) STRICT, WITHOUT ROWID`,
]

export const FACT_BLOB_TABLES: readonly string[] = ['er_fact', 'sl_blob']

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

// One row per item of an execution view by original key: the open rows are what a cold load reads,
// the closed rows the closed index; a publish opens a key once and changes only an open row.
export const ITEM_SCHEMA: readonly string[] = [
  `CREATE TABLE er_item (
    tenant TEXT NOT NULL, execution TEXT NOT NULL, family TEXT NOT NULL, item TEXT NOT NULL,
    open INTEGER NOT NULL, pub INTEGER NOT NULL, body BLOB NOT NULL,
    CHECK (open IN (0, 1) AND pub > 0),
    PRIMARY KEY (tenant, execution, family, item)) STRICT, WITHOUT ROWID`,
  'CREATE INDEX er_item_open ON er_item (tenant, execution, family, item) WHERE open = 1',
  `CREATE TABLE er_item_content (
    tenant TEXT NOT NULL, execution TEXT NOT NULL, family TEXT NOT NULL, item TEXT NOT NULL,
    payload BLOB NOT NULL,
    PRIMARY KEY (tenant, execution, family, item)) STRICT, WITHOUT ROWID`,
]

export const ITEM_TABLES: readonly string[] = ['er_item', 'er_item_content']

export const ITEM_MIGRATION = Object.freeze({
  owner: 'execution-record',
  id: '007-item',
})
