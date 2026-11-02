// The tables of the Tool storage. Every table is keyed by tenant first, and every statement of the
// participant and the read handlers filters on it, so rows of another tenant are never read even
// in a store that holds them by mistake. The ledger tables keep the records of the ToolLedgerStore
// domains; the custody tables keep originals by chunk and seal each one with a manifest. Custody
// rows never touch `tl_domain`: they move no ledger domain revision.
export const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE tl_domain (
    tenant TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, revision TEXT NOT NULL,
    PRIMARY KEY (tenant, kind, name)) STRICT`,
  `CREATE TABLE tl_record (
    tenant TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, key TEXT NOT NULL,
    record TEXT NOT NULL, PRIMARY KEY (tenant, kind, name, key)) STRICT`,
  `CREATE TABLE tl_chunk (
    tenant TEXT NOT NULL, call TEXT NOT NULL, operation TEXT NOT NULL, idx INTEGER NOT NULL,
    data BLOB NOT NULL, PRIMARY KEY (tenant, call, operation, idx)) STRICT`,
  `CREATE TABLE tl_manifest (
    tenant TEXT NOT NULL, call TEXT NOT NULL, operation TEXT NOT NULL, kind TEXT NOT NULL,
    digest TEXT NOT NULL, bytes INTEGER NOT NULL, chunks INTEGER NOT NULL, sha256 TEXT NOT NULL,
    seal TEXT NOT NULL, answer TEXT NOT NULL, PRIMARY KEY (tenant, call, operation)) STRICT`,
]

export const TOOL_TABLES: readonly string[] = ['tl_domain', 'tl_record', 'tl_chunk', 'tl_manifest']

/** The participant name: the one writer of every `tl_` table. */
export const PARTICIPANT = 'tool'

export const MIGRATION = Object.freeze({ owner: 'tool', id: '001-tool-ledger-custody' })
export const PROTOCOL = '1'

export const LEDGER_READ_HANDLER = 'tool.ledger.read'
export const MANIFEST_READ_HANDLER = 'tool.custody.manifest'
export const CHUNK_READ_HANDLER = 'tool.custody.chunk'

/** The most rows one ledger domain read returns; a larger domain is refused, never truncated. */
export const LEDGER_READ_ROWS = 100_000
/** The output bound of every handler: the provider's initial `maxReadResultBytes`. */
export const READ_OUTPUT_BYTES = 4_194_304
