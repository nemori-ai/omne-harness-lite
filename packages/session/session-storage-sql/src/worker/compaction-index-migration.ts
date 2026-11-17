import type { MigrationModule } from '@omne-harness/sql-contract/worker'

export const COMPACTION_INDEX_MIGRATION = { owner: 'session', id: '009-compaction-index' } as const
export const COMPACTION_INDEX_TABLES = [
  'sl_compaction_head',
  'sl_message_call',
  'sl_message_pairing',
  'sl_compaction_input',
  'sl_compaction_call',
  'sl_compaction_result',
] as const
const indices = ['sl_model_view_entry_idx', 'sl_compaction_open_call_idx'] as const
const migration: MigrationModule = {
  ...COMPACTION_INDEX_MIGRATION,
  up(port) {
    port.execute(
      'CREATE INDEX sl_model_view_entry_idx ON sl_model_view (tenant, session, epoch, entry)',
      [],
    )
    port.execute(
      `CREATE TABLE sl_compaction_head (
      tenant TEXT NOT NULL, session TEXT NOT NULL, covered INTEGER NOT NULL,
      origin TEXT NOT NULL, protection TEXT NOT NULL, last_user TEXT,
      PRIMARY KEY (tenant, session)) STRICT, WITHOUT ROWID`,
      [],
    )
    port.execute(
      `CREATE TABLE sl_message_call (
      tenant TEXT NOT NULL, session TEXT NOT NULL, call_id TEXT NOT NULL, entry TEXT NOT NULL,
      PRIMARY KEY (tenant, session, call_id)) STRICT, WITHOUT ROWID`,
      [],
    )
    port.execute(
      `CREATE TABLE sl_message_pairing (
      tenant TEXT NOT NULL, session TEXT NOT NULL, result TEXT NOT NULL, call_entry TEXT,
      PRIMARY KEY (tenant, session, result)) STRICT, WITHOUT ROWID`,
      [],
    )
    port.execute(
      `CREATE TABLE sl_compaction_input (
      tenant TEXT NOT NULL, session TEXT NOT NULL, input TEXT NOT NULL, entry TEXT NOT NULL,
      PRIMARY KEY (tenant, session, input)) STRICT, WITHOUT ROWID`,
      [],
    )
    port.execute(
      `CREATE TABLE sl_compaction_call (
      tenant TEXT NOT NULL, session TEXT NOT NULL, consumption TEXT NOT NULL,
      registered TEXT NOT NULL, association TEXT, bound INTEGER NOT NULL,
      results INTEGER NOT NULL, pending INTEGER NOT NULL, open INTEGER NOT NULL,
      PRIMARY KEY (tenant, session, consumption)) STRICT, WITHOUT ROWID`,
      [],
    )
    port.execute(
      `CREATE INDEX sl_compaction_open_call_idx
      ON sl_compaction_call (tenant, session, consumption) WHERE open = 1`,
      [],
    )
    port.execute(
      `CREATE TABLE sl_compaction_result (
      tenant TEXT NOT NULL, session TEXT NOT NULL, consumption TEXT NOT NULL,
      version TEXT NOT NULL, processed INTEGER NOT NULL,
      PRIMARY KEY (tenant, session, consumption, version)) STRICT, WITHOUT ROWID`,
      [],
    )
  },
  verify(port) {
    const rows = port.execute(
      "SELECT name FROM sqlite_schema WHERE type = 'index' AND name IN (?, ?) LIMIT 2",
      indices,
    )
    const tables = port.execute(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN (?, ?, ?, ?, ?, ?) LIMIT 6",
      COMPACTION_INDEX_TABLES,
    )
    return rows.rows.length === 2 && tables.rows.length === 6
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: 'the compaction indices are missing' }
  },
}
export default migration
