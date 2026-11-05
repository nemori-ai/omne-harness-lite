import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { MIGRATION, TABLES } from './schema.ts'

export default {
  ...MIGRATION,
  up(port) {
    port.execute('CREATE TABLE st_states (target_key TEXT PRIMARY KEY, record TEXT NOT NULL)', [])
    port.execute(
      'CREATE TABLE st_operations (operation_key TEXT PRIMARY KEY, record TEXT NOT NULL)',
      [],
    )
    port.execute(
      'CREATE TABLE st_changes (target_key TEXT NOT NULL, revision INTEGER NOT NULL, operation_id TEXT NOT NULL, kind TEXT NOT NULL, item_id TEXT, source_id TEXT, PRIMARY KEY (target_key, revision))',
      [],
    )
  },
  verify(port) {
    for (const table of TABLES) port.execute(`SELECT * FROM ${table} LIMIT 0`, [])
    return { kind: 'verified' }
  },
} satisfies MigrationModule
