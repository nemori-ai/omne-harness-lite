import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { SUBSCRIPTION_MIGRATION, SUBSCRIPTION_TABLES } from './schema.ts'

const STATEMENTS = [
  'CREATE TABLE mcp_subscriptions (tenant TEXT NOT NULL, sub_key TEXT NOT NULL, revision INTEGER NOT NULL, cursor TEXT, row TEXT NOT NULL, PRIMARY KEY(tenant, sub_key))',
  'CREATE TABLE mcp_occurrences (tenant TEXT NOT NULL, sub_key TEXT NOT NULL, seq INTEGER NOT NULL, kind TEXT NOT NULL, event_id TEXT, received_at TEXT NOT NULL, row TEXT NOT NULL, PRIMARY KEY(tenant, sub_key, seq))',
]

export default {
  ...SUBSCRIPTION_MIGRATION,
  up(port) {
    for (const statement of STATEMENTS) port.execute(statement, [])
  },
  verify(port) {
    for (const table of SUBSCRIPTION_TABLES) port.execute(`SELECT * FROM ${table} LIMIT 0`, [])
    return { kind: 'verified' }
  },
} satisfies MigrationModule
