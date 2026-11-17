export const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE sl_journal (
    tenant TEXT NOT NULL, session TEXT NOT NULL, tail INTEGER NOT NULL, commit_seq INTEGER NOT NULL,
    epoch TEXT NOT NULL, PRIMARY KEY (tenant, session)) STRICT`,
  `CREATE TABLE sl_entry (
    tenant TEXT NOT NULL, session TEXT NOT NULL, position INTEGER NOT NULL, revision INTEGER NOT NULL,
    kind TEXT NOT NULL, entry BLOB NOT NULL, bytes INTEGER NOT NULL,
    PRIMARY KEY (tenant, session, position)) STRICT`,
  `CREATE INDEX sl_kind_idx ON sl_entry (tenant, session, kind, position)`,
  `CREATE TABLE sl_operation (
    tenant TEXT NOT NULL, session TEXT NOT NULL, operation TEXT NOT NULL, input_digest TEXT NOT NULL,
    form TEXT NOT NULL, revision INTEGER, receipt BLOB NOT NULL, result BLOB NOT NULL,
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

export const OPERATION_EVIDENCE_STATEMENTS: readonly string[] = [
  `CREATE TABLE sl_operation_evidence (
    tenant TEXT NOT NULL, session TEXT NOT NULL, operation TEXT NOT NULL, evidence TEXT NOT NULL,
    PRIMARY KEY (tenant, session, operation)) STRICT`,
]

export const OPERATION_EVIDENCE_TABLES: readonly string[] = ['sl_operation_evidence']

export const OPERATION_EVIDENCE_MIGRATION = Object.freeze({
  owner: 'session',
  id: '003-operation-evidence',
})

export const STATE_ITEM_STATEMENTS: readonly string[] = [
  `CREATE TABLE sl_state_item (
    tenant TEXT NOT NULL, session TEXT NOT NULL, path TEXT NOT NULL, seq INTEGER NOT NULL,
    value BLOB NOT NULL, PRIMARY KEY (tenant, session, path, seq)) STRICT, WITHOUT ROWID`,
]

export const STATE_ITEM_TABLES: readonly string[] = ['sl_state_item']

export const STATE_ITEM_MIGRATION = Object.freeze({
  owner: 'session',
  id: '004-state-items',
})

export const ATTEMPT_GRANT_STATEMENTS: readonly string[] = [
  `CREATE TABLE sl_attempt_grant (
    tenant TEXT NOT NULL, session TEXT NOT NULL, attempt TEXT NOT NULL, position INTEGER NOT NULL,
    grant TEXT NOT NULL, PRIMARY KEY (tenant, session, attempt)) STRICT`,
  `CREATE INDEX sl_attempt_grant_position_idx ON sl_attempt_grant (tenant, session, position)`,
]

export const ATTEMPT_GRANT_TABLES: readonly string[] = ['sl_attempt_grant']

export const SCOPE_INDEX_STATEMENTS: readonly string[] = [
  `CREATE TABLE sl_scope_idx (
    tenant TEXT NOT NULL, scope TEXT NOT NULL, session TEXT NOT NULL, generation TEXT NOT NULL,
    PRIMARY KEY (tenant, scope)) STRICT`,
]

export const SCOPE_INDEX_TABLES: readonly string[] = ['sl_scope_idx']

export const SCOPE_INDEX_MIGRATION = Object.freeze({ owner: 'session', id: '007-scope-index' })

export const SESSION_LIST_STATEMENTS: readonly string[] = [
  `CREATE TABLE sl_commit_time (
    tenant TEXT NOT NULL, session TEXT NOT NULL, commit_seq INTEGER NOT NULL, at TEXT,
    PRIMARY KEY (tenant, session, commit_seq)) STRICT`,
  `CREATE TABLE sl_session_list (
    tenant TEXT NOT NULL, session TEXT NOT NULL, created_at TEXT, last_activity_at TEXT,
    lifecycle TEXT NOT NULL, title TEXT, version INTEGER NOT NULL,
    PRIMARY KEY (tenant, session)) STRICT`,
  `CREATE INDEX sl_session_list_activity_idx
    ON sl_session_list (tenant, last_activity_at DESC, session)`,
]

export const SESSION_LIST_TABLES: readonly string[] = ['sl_commit_time', 'sl_session_list']

export const SESSION_LIST_MIGRATION = Object.freeze({ owner: 'session', id: '008-session-list' })

export const SESSION_LIST_SCAN_ROWS = 1000

export const SESSION_ARCHIVE_STATEMENTS: readonly string[] = [
  `CREATE TABLE sl_session_archive (
    tenant TEXT NOT NULL, session TEXT NOT NULL, archived_at TEXT, archived_by TEXT,
    PRIMARY KEY (tenant, session)) STRICT`,
  `CREATE INDEX sl_session_archive_idx
    ON sl_session_archive (tenant, archived_at DESC, session)`,
]

export const SESSION_ARCHIVE_TABLES: readonly string[] = ['sl_session_archive']

export const SESSION_ARCHIVE_MIGRATION = Object.freeze({
  owner: 'session',
  id: '010-session-archive',
})

export const ATTEMPT_GRANT_MIGRATION = Object.freeze({
  owner: 'session',
  id: '005-attempt-grant',
})
