// The tables of the Tool storage. Every table is keyed by tenant first, and every statement of the
// participant and the read handlers filters on it, so rows of another tenant are never read even
// in a store that holds them by mistake. The ledger tables keep the records of the ToolLedgerStore
// domains; the body tables keep the immutable chunks and the manifest of each body. Body rows
// never touch `tl_domain`: they move no ledger domain revision.
export const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE tl_domain (
    tenant TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, revision TEXT NOT NULL,
    PRIMARY KEY (tenant, kind, name)) STRICT`,
  `CREATE TABLE tl_record (
    tenant TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, key TEXT NOT NULL,
    record TEXT NOT NULL, PRIMARY KEY (tenant, kind, name, key)) STRICT`,
  // The body store: immutable chunks of one body and the one manifest that seals them.
  `CREATE TABLE tl_body_chunk (
    tenant TEXT NOT NULL, call TEXT NOT NULL, body TEXT NOT NULL, seq INTEGER NOT NULL,
    data BLOB NOT NULL, PRIMARY KEY (tenant, call, body, seq)) STRICT`,
  `CREATE TABLE tl_body_manifest (
    tenant TEXT NOT NULL, call TEXT NOT NULL, body TEXT NOT NULL, chunks INTEGER NOT NULL,
    bytes INTEGER NOT NULL, digest TEXT NOT NULL, PRIMARY KEY (tenant, call, body)) STRICT`,
  // The due index of the ledger: one entry per scheduled key of a domain, read by tenant and instant.
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

/** The participant name: the one writer of every `tl_` table. */
export const PARTICIPANT = 'tool'

/**
 * The r6 baseline. A database migrated under the pre-r6 baseline (`001-tool-ledger-custody`)
 * holds a marker this catalog does not list, so the provider quarantines it instead of migrating.
 */
export const MIGRATION = Object.freeze({ owner: 'tool', id: 'r6-001-tool-ledger-body-due' })
export const PROTOCOL = '1'

export const LEDGER_READ_HANDLER = 'tool.ledger.read'
export const BODY_READ_HANDLER = 'tool.body.read'
export const DUE_READ_HANDLER = 'tool.due.read'

/** The most chunks one body read returns; the adapter reads a longer range in several reads. */
export const BODY_READ_CHUNKS = 64
/** The most due entries one read returns. */
export const DUE_READ_ENTRIES = 1_000

/** The most rows one ledger domain read returns; a larger domain is refused, never truncated. */
export const LEDGER_READ_ROWS = 100_000
/** The output bound of every handler: the provider's initial `maxReadResultBytes`. */
export const READ_OUTPUT_BYTES = 4_194_304
