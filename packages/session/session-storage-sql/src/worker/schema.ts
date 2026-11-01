// The tables of the Session log. Every table is keyed by tenant first, and every statement of the
// participant and the read handlers filters on it. Positions are 64-bit integers (read as BigInt).
// The first five tables are authoritative; the rest are derived in the same commit.
export const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE sl_journal (
    tenant TEXT NOT NULL, session TEXT NOT NULL, tail INTEGER NOT NULL, commit_seq INTEGER NOT NULL,
    epoch TEXT NOT NULL, PRIMARY KEY (tenant, session)) STRICT`,
  `CREATE TABLE sl_entry (
    tenant TEXT NOT NULL, session TEXT NOT NULL, position INTEGER NOT NULL, revision INTEGER NOT NULL,
    kind TEXT NOT NULL, entry TEXT NOT NULL, bytes INTEGER NOT NULL,
    PRIMARY KEY (tenant, session, position)) STRICT`,
  `CREATE INDEX sl_kind_idx ON sl_entry (tenant, session, kind, position)`,
  `CREATE TABLE sl_operation (
    tenant TEXT NOT NULL, session TEXT NOT NULL, operation TEXT NOT NULL, input_digest TEXT NOT NULL,
    form TEXT NOT NULL, revision INTEGER, receipt TEXT NOT NULL, result TEXT NOT NULL,
    PRIMARY KEY (tenant, session, operation)) STRICT`,
  `CREATE INDEX sl_operation_revision_idx ON sl_operation (tenant, session, revision)`,
  `CREATE TABLE sl_state (
    tenant TEXT NOT NULL, session TEXT NOT NULL, snapshot TEXT NOT NULL, covered INTEGER NOT NULL,
    PRIMARY KEY (tenant, session)) STRICT`,
  `CREATE TABLE sl_input (
    tenant TEXT NOT NULL, session TEXT NOT NULL, input TEXT NOT NULL, value TEXT NOT NULL,
    PRIMARY KEY (tenant, session, input)) STRICT`,
  `CREATE TABLE sl_model_view (
    tenant TEXT NOT NULL, session TEXT NOT NULL, epoch TEXT NOT NULL, seq INTEGER NOT NULL,
    entry TEXT NOT NULL, bytes INTEGER NOT NULL, prefix_digest TEXT NOT NULL, message TEXT NOT NULL,
    PRIMARY KEY (tenant, session, epoch, seq)) STRICT`,
  `CREATE TABLE sl_annotation_idx (
    tenant TEXT NOT NULL, session TEXT NOT NULL, target INTEGER NOT NULL, position INTEGER NOT NULL,
    PRIMARY KEY (tenant, session, target, position)) STRICT`,
  `CREATE TABLE sl_pending_idx (
    tenant TEXT NOT NULL, reason TEXT NOT NULL, session TEXT NOT NULL,
    PRIMARY KEY (tenant, reason, session)) STRICT`,
  `CREATE TABLE sl_resident_idx (
    resident_key TEXT NOT NULL, tenant TEXT NOT NULL, session TEXT NOT NULL, capability TEXT NOT NULL,
    shape TEXT NOT NULL, PRIMARY KEY (resident_key, tenant, session, capability)) STRICT`,
  `CREATE TABLE sl_released_scope_idx (
    tenant TEXT NOT NULL, session TEXT NOT NULL, scope TEXT NOT NULL, data TEXT NOT NULL,
    PRIMARY KEY (tenant, session, scope)) STRICT`,
]

export const SESSION_TABLES: readonly string[] = [
  'sl_journal',
  'sl_entry',
  'sl_operation',
  'sl_state',
  'sl_input',
  'sl_model_view',
  'sl_annotation_idx',
  'sl_pending_idx',
  'sl_resident_idx',
  'sl_released_scope_idx',
]

export const MIGRATION = Object.freeze({ owner: 'session', id: '001-session-log' })
export const PROTOCOL = '1'

// The execution index, derived from SE13 in the commit that writes it: the session, the Run and
// the position of the SE13 entry of each execution. An execution is unique within its tenant.
export const EXECUTION_INDEX_STATEMENTS: readonly string[] = [
  `CREATE TABLE sl_execution_idx (
    tenant TEXT NOT NULL, execution TEXT NOT NULL, session TEXT NOT NULL, run TEXT NOT NULL,
    position INTEGER NOT NULL, PRIMARY KEY (tenant, execution)) STRICT`,
]

export const EXECUTION_INDEX_TABLES: readonly string[] = ['sl_execution_idx']

export const EXECUTION_INDEX_MIGRATION = Object.freeze({
  owner: 'session',
  id: '002-execution-index',
})
