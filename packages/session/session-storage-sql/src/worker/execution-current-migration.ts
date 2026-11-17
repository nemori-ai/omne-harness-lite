import type { MigrationModule } from '@omne-harness/sql-contract/worker'

export const EXECUTION_CURRENT_MIGRATION = Object.freeze({
  owner: 'execution-record',
  id: '007-current-projection',
})
export const EXECUTION_CURRENT_TABLES = ['er_current_head', 'er_current', 'er_ordered'] as const
const migration: MigrationModule = {
  ...EXECUTION_CURRENT_MIGRATION,
  up(port) {
    port.execute(
      `CREATE TABLE er_current_head (
      tenant TEXT NOT NULL, session TEXT NOT NULL, execution TEXT NOT NULL,
      covered INTEGER NOT NULL, revision INTEGER NOT NULL,
      PRIMARY KEY (tenant, execution)) STRICT, WITHOUT ROWID`,
      [],
    )
    port.execute(
      'CREATE INDEX er_current_changed ON er_current_head (tenant, session, covered)',
      [],
    )
    port.execute(
      `CREATE TABLE er_current (
      tenant TEXT NOT NULL, session TEXT NOT NULL, execution TEXT NOT NULL,
      path TEXT NOT NULL, value BLOB NOT NULL, active INTEGER NOT NULL CHECK (active IN (0, 1)),
      PRIMARY KEY (tenant, execution, path)) STRICT, WITHOUT ROWID`,
      [],
    )
    port.execute(
      'CREATE INDEX er_current_active ON er_current (tenant, execution, active, path)',
      [],
    )
    port.execute(
      `CREATE TABLE er_ordered (
      tenant TEXT NOT NULL, session TEXT NOT NULL, execution TEXT NOT NULL,
      collection TEXT NOT NULL, position INTEGER NOT NULL, pub INTEGER NOT NULL, ord INTEGER NOT NULL,
      PRIMARY KEY (tenant, execution, collection, position)) STRICT, WITHOUT ROWID`,
      [],
    )
  },
  verify(port) {
    const found = port.execute(
      "SELECT name FROM sqlite_schema WHERE name IN ('er_current_head', 'er_current', 'er_current_active', 'er_current_changed', 'er_ordered')",
      [],
    )
    return found.rows.length === 5
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: 'missing current execution projection tables' }
  },
}
export default migration
