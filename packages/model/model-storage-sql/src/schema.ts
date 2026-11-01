// The four tables of the durable Model call document and their migration. Each column is declared
// once, in `TABLES`: the DDL, the migration check and the row parser all read that list. Every
// table is keyed by tenant first, and every statement that reads or writes it filters on tenant.
import type { MigrationModule, MigrationPort } from '@omne-harness/sql-contract/worker'

/** The participant name that a combination lists for the Model records. */
export const MODEL_PARTICIPANT = 'model'
/** The fact protocol of the participant and of both read handlers. */
export const PROTOCOL = '1'
export const MIGRATION = Object.freeze({ owner: 'model', id: '001-model-records' })

/** `text` and `json` columns hold TEXT; `int` columns hold INTEGER and travel as safe integers. */
export type ColumnKind = 'text' | 'json' | 'int'
export type Column = Readonly<{ name: string; kind: ColumnKind; nullable: boolean }>
export type Table = Readonly<{
  name: string
  columns: readonly Column[]
  primaryKey: readonly string[]
  /** Table constraints after the primary key: UNIQUE and CHECK clauses. */
  constraints: readonly string[]
  indexes: readonly string[]
}>

const column = (name: string, kind: ColumnKind, nullable = false): Column => ({
  name,
  kind,
  nullable,
})

const CALL: Table = {
  name: 'md_call',
  columns: [
    column('tenant', 'text'),
    column('call', 'text'),
    column('row_version', 'int'),
    column('admission', 'text'),
    column('owner', 'json'),
    column('initiator', 'json'),
    column('request', 'json', true),
    column('request_digest', 'text'),
    column('cap_bytes', 'int'),
    column('cap_blocks', 'int'),
    column('cap_attachment', 'int'),
    column('state', 'json'),
    column('execution', 'json', true),
    column('retry', 'json', true),
    column('retry_position', 'json', true),
    column('retry_source', 'json', true),
    column('cursor', 'text'),
    column('snapshot', 'json', true),
    column('paging', 'json'),
    column('cleanup_failure', 'text', true),
    column('pending_operation', 'text', true),
    column('pending_at', 'text', true),
  ],
  primaryKey: ['tenant', 'call'],
  constraints: [
    'CHECK (row_version >= 1)',
    'CHECK ((pending_operation IS NULL) = (pending_at IS NULL))',
  ],
  indexes: [
    'CREATE INDEX md_call_pending_idx ON md_call (tenant, call) WHERE pending_operation IS NOT NULL',
    'CREATE INDEX md_call_held_idx ON md_call (tenant) WHERE request IS NOT NULL',
  ],
}

const DISPATCH: Table = {
  name: 'md_dispatch',
  columns: [
    column('tenant', 'text'),
    column('call', 'text'),
    column('seq', 'int'),
    column('dispatch', 'text'),
    column('record', 'json'),
    column('logical_terminal', 'json', true),
    column('windows', 'json'),
    column('events', 'json'),
    column('next_seq', 'json'),
    column('trims', 'json'),
    column('had_content', 'json'),
    column('diagnostics', 'json'),
  ],
  primaryKey: ['tenant', 'call', 'seq'],
  constraints: ['UNIQUE (tenant, call, dispatch)', 'CHECK (seq >= 0)'],
  indexes: [],
}

const PART: Table = {
  name: 'md_part',
  columns: [
    column('tenant', 'text'),
    column('call', 'text'),
    column('seq', 'int'),
    column('block', 'int'),
    column('part', 'int'),
    column('kind', 'text'),
    column('payload', 'json'),
  ],
  primaryKey: ['tenant', 'call', 'seq', 'block', 'part'],
  constraints: ["CHECK (kind IN ('open', 'append', 'replace', 'seal'))", 'CHECK (part >= 0)'],
  indexes: [],
}

const OPERATION: Table = {
  name: 'md_operation',
  columns: [
    column('tenant', 'text'),
    column('operation', 'text'),
    column('call', 'text'),
    column('method', 'text'),
    column('fingerprint', 'text'),
    column('revision', 'text'),
    column('receipt', 'json'),
  ],
  primaryKey: ['tenant', 'operation'],
  constraints: [],
  indexes: ['CREATE INDEX md_operation_call_idx ON md_operation (tenant, call)'],
}

export const TABLES = Object.freeze({
  call: CALL,
  dispatch: DISPATCH,
  part: PART,
  operation: OPERATION,
})

export const MODEL_TABLES: readonly string[] = Object.values(TABLES).map(table => table.name)

function createTable(table: Table): string {
  const columns = table.columns.map(
    item =>
      `${item.name} ${item.kind === 'int' ? 'INTEGER' : 'TEXT'}${item.nullable ? '' : ' NOT NULL'}`,
  )
  const clauses = [...columns, `PRIMARY KEY (${table.primaryKey.join(', ')})`, ...table.constraints]
  return `CREATE TABLE ${table.name} (${clauses.join(', ')}) STRICT`
}

/** The DDL of migration `001-model-records`, in execution order. */
export const SCHEMA_STATEMENTS: readonly string[] = Object.values(TABLES).flatMap(table => [
  createTable(table),
  ...table.indexes,
])

function verify(port: MigrationPort): ReturnType<MigrationModule['verify']> {
  const found = port.execute(
    `SELECT name FROM sqlite_schema WHERE type = 'table' AND substr(name, 1, 3) = 'md_' LIMIT 100`,
    [],
  )
  const names = new Set(found.rows.map(row => String(row[0])))
  const missing = MODEL_TABLES.filter(name => !names.has(name))
  return missing.length === 0
    ? { kind: 'verified' }
    : { kind: 'failed', diagnostic: `missing tables: ${missing.join(',')}` }
}

/** The migration module of the Model tables. The provider runs it in its atomic migration. */
export const modelMigration: MigrationModule = {
  owner: MIGRATION.owner,
  id: MIGRATION.id,
  up(port) {
    for (const statement of SCHEMA_STATEMENTS) port.execute(statement, [])
  },
  verify,
}
export default modelMigration
