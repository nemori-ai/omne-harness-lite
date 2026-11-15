export const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE tl_domain (
    tenant TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, revision TEXT NOT NULL,
    PRIMARY KEY (tenant, kind, name)) STRICT`,
  `CREATE TABLE tl_record (
    tenant TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, key TEXT NOT NULL,
    record BLOB NOT NULL, fixed BLOB, PRIMARY KEY (tenant, kind, name, key)) STRICT`,
  `CREATE TABLE tl_body_chunk (
    tenant TEXT NOT NULL, call TEXT NOT NULL, body TEXT NOT NULL, seq INTEGER NOT NULL,
    data BLOB NOT NULL, PRIMARY KEY (tenant, call, body, seq)) STRICT`,
  `CREATE TABLE tl_body_manifest (
    tenant TEXT NOT NULL, call TEXT NOT NULL, body TEXT NOT NULL, chunks INTEGER NOT NULL,
    bytes INTEGER NOT NULL, digest TEXT NOT NULL, PRIMARY KEY (tenant, call, body)) STRICT`,
  `CREATE TABLE tl_due (
    tenant TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, key TEXT NOT NULL,
    due_at TEXT NOT NULL, PRIMARY KEY (tenant, kind, name, key)) STRICT`,
  `CREATE INDEX tl_due_by_instant ON tl_due (tenant, due_at)`,
]

export const TOOL_TABLES: readonly string[] = [
  'tl_domain',
  'tl_record',
  'tl_body_chunk',
  'tl_body_manifest',
  'tl_due',
]

export const PARTICIPANT = 'tool'

export const MIGRATION = Object.freeze({ owner: 'tool', id: 'r6-001-tool-ledger-body-due' })

export const PENDING_STATEMENTS: readonly string[] = [
  `CREATE TABLE tl_pending (
    tenant TEXT NOT NULL, call TEXT NOT NULL, PRIMARY KEY (tenant, call)) STRICT, WITHOUT ROWID`,
]

export const PENDING_TABLES: readonly string[] = ['tl_pending']

export const PENDING_MIGRATION = Object.freeze({ owner: 'tool', id: 'r6-002-tool-pending' })
export const PROTOCOL = '1'

export const LEDGER_READ_HANDLER = 'tool.ledger.read'
export const BODY_READ_HANDLER = 'tool.body.read'
export const DUE_READ_HANDLER = 'tool.due.read'
export const PENDING_READ_HANDLER = 'tool.ledger.pending'

export const BODY_READ_CHUNKS = 64
export const DUE_READ_ENTRIES = 1_000

export const LEDGER_READ_ROWS = 100_000
export const READ_OUTPUT_BYTES = 4_194_304
