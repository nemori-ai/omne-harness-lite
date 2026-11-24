// The dispatch facts: one row per real dispatch, written with the dispatch record and kept after
// the call is cleaned up. It has its own migration, so the first migration stays byte for byte.
import type { MigrationModule, MigrationPort } from '@omne-harness/sql-contract/worker'
import type { Column, ColumnKind, Table } from './schema.ts'

export const FACT_MIGRATION = Object.freeze({ owner: 'model', id: '002-dispatch-facts' })

const column = (name: string, kind: ColumnKind, nullable = false): Column => ({
  name,
  kind,
  nullable,
})

/** `prepared` is the prepared moment in milliseconds ISO form, so text order is time order. */
export const DISPATCH_FACT: Table = {
  name: 'md_dispatch_fact',
  columns: [
    column('tenant', 'text'),
    column('call', 'text'),
    column('seq', 'int'),
    column('dispatch', 'text'),
    column('prepared', 'text', true),
    column('consumer_owner', 'text'),
    column('consumer_work', 'text'),
    column('profile', 'json', true),
    column('context_window', 'json', true),
    column('fact', 'json'),
  ],
  primaryKey: ['tenant', 'call', 'seq'],
  constraints: ['CHECK (seq >= 0)'],
  indexes: [
    'CREATE INDEX md_dispatch_fact_prepared_idx ON md_dispatch_fact (tenant, prepared)',
    'CREATE INDEX md_dispatch_fact_consumer_idx ON md_dispatch_fact (tenant, consumer_owner, consumer_work)',
  ],
}

const SQL_TYPE: Readonly<Record<ColumnKind, string>> = {
  text: 'TEXT',
  json: 'BLOB',
  int: 'INTEGER',
}

const columns = DISPATCH_FACT.columns.map(
  item => `${item.name} ${SQL_TYPE[item.kind]}${item.nullable ? '' : ' NOT NULL'}`,
)

export const FACT_SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE ${DISPATCH_FACT.name} (${[
    ...columns,
    `PRIMARY KEY (${DISPATCH_FACT.primaryKey.join(', ')})`,
    ...DISPATCH_FACT.constraints,
  ].join(', ')}) STRICT`,
  ...DISPATCH_FACT.indexes,
]

function verify(port: MigrationPort): ReturnType<MigrationModule['verify']> {
  const found = port.execute(
    `SELECT name FROM sqlite_schema WHERE type = 'table' AND name = '${DISPATCH_FACT.name}' LIMIT 1`,
    [],
  )
  return found.rows.length === 1
    ? { kind: 'verified' }
    : { kind: 'failed', diagnostic: `missing tables: ${DISPATCH_FACT.name}` }
}

export const dispatchFactsMigration: MigrationModule = {
  owner: FACT_MIGRATION.owner,
  id: FACT_MIGRATION.id,
  up(port) {
    for (const statement of FACT_SCHEMA_STATEMENTS) port.execute(statement, [])
  },
  verify,
}
export default dispatchFactsMigration
