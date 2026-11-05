import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { MIGRATION, TABLES } from './schema.ts'
export default {
  ...MIGRATION,
  up(port) {
    port.execute(
      'CREATE TABLE al_domain (id INTEGER PRIMARY KEY CHECK (id = 1), record TEXT NOT NULL)',
      [],
    )
    port.execute('CREATE TABLE al_assets (asset_key TEXT PRIMARY KEY, record TEXT NOT NULL)', [])
    port.execute(
      'CREATE TABLE al_versions (version_key TEXT PRIMARY KEY, record TEXT NOT NULL)',
      [],
    )
    port.execute(
      'CREATE TABLE al_holdings (scope_key TEXT NOT NULL, holding_ref TEXT NOT NULL, asset_ref TEXT NOT NULL, capability_key TEXT NOT NULL, state TEXT NOT NULL, record TEXT NOT NULL, PRIMARY KEY (scope_key, holding_ref))',
      [],
    )
    port.execute(
      "CREATE UNIQUE INDEX al_held_capability ON al_holdings(scope_key, capability_key) WHERE state = 'held'",
      [],
    )
  },
  verify(port) {
    for (const table of TABLES) port.execute(`SELECT * FROM ${table} LIMIT 0`, [])
    return { kind: 'verified' }
  },
} satisfies MigrationModule
