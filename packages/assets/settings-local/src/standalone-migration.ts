import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { STANDALONE_MIGRATION } from './standalone-schema.ts'
export default {
  ...STANDALONE_MIGRATION,
  up(port) {
    port.execute(
      'CREATE TABLE st_targets (target_key TEXT PRIMARY KEY, scope_ref TEXT NOT NULL, record TEXT NOT NULL) STRICT',
      [],
    )
    port.execute('CREATE INDEX st_targets_scope ON st_targets(scope_ref, target_key)', [])
    port.execute(
      'CREATE TABLE st_definitions (definition_key TEXT PRIMARY KEY, digest TEXT NOT NULL) STRICT',
      [],
    )
  },
  verify(port) {
    const count = port.execute(
      "SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('st_targets', 'st_definitions') LIMIT 1",
      [],
    ).rows[0]?.[0]
    return count === 2n
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: 'settings_targets_tables_missing' }
  },
} satisfies MigrationModule
