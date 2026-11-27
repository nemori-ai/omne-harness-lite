import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { MIGRATION, TABLES } from './schema.ts'

const STATEMENTS = [
  'CREATE TABLE mcp_catalogs (tenant TEXT NOT NULL, account TEXT NOT NULL, holding TEXT NOT NULL, kind TEXT NOT NULL, revision INTEGER NOT NULL, record TEXT NOT NULL, PRIMARY KEY(tenant, account, holding, kind))',
  'CREATE TABLE mcp_continuations (tenant TEXT NOT NULL, checkpoint TEXT NOT NULL, PRIMARY KEY(tenant, checkpoint))',
  'CREATE TABLE mcp_tasks (tenant TEXT NOT NULL, principal TEXT NOT NULL, holding TEXT NOT NULL, task TEXT NOT NULL, account TEXT NOT NULL, state TEXT NOT NULL, round INTEGER NOT NULL, row TEXT NOT NULL, PRIMARY KEY(tenant, principal, holding, task, account))',
]

export default {
  ...MIGRATION,
  up(port) {
    for (const statement of STATEMENTS) port.execute(statement, [])
  },
  verify(port) {
    for (const table of TABLES) port.execute(`SELECT * FROM ${table} LIMIT 0`, [])
    return { kind: 'verified' }
  },
} satisfies MigrationModule
