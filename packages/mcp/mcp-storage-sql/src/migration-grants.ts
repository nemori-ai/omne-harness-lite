import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { GRANT_MIGRATION, GRANT_TABLES } from './schema.ts'

const STATEMENTS = [
  'CREATE TABLE mcp_pending (tenant TEXT NOT NULL, state TEXT NOT NULL, grant_key TEXT NOT NULL, row TEXT NOT NULL, PRIMARY KEY(tenant, state))',
  'CREATE TABLE mcp_grants (tenant TEXT NOT NULL, grant_key TEXT NOT NULL, revision INTEGER NOT NULL, row TEXT NOT NULL, PRIMARY KEY(tenant, grant_key))',
  'CREATE TABLE mcp_clients (tenant TEXT NOT NULL, issuer TEXT NOT NULL, row TEXT NOT NULL, PRIMARY KEY(tenant, issuer))',
]

export default {
  ...GRANT_MIGRATION,
  up(port) {
    for (const statement of STATEMENTS) port.execute(statement, [])
  },
  verify(port) {
    for (const table of GRANT_TABLES) port.execute(`SELECT * FROM ${table} LIMIT 0`, [])
    return { kind: 'verified' }
  },
} satisfies MigrationModule
