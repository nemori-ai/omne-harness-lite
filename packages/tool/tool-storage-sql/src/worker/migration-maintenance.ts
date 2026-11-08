import type { MigrationModule } from '@omne-harness/sql-contract/worker'

export const MAINTENANCE_MIGRATION = { owner: 'tool', id: '003-tool-material-maintenance' }
export const MAINTENANCE_TABLES = ['tl_material_maintenance']

const migration: MigrationModule = {
  ...MAINTENANCE_MIGRATION,
  up(port) {
    port.execute(
      `CREATE TABLE tl_material_maintenance (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant TEXT NOT NULL, call TEXT NOT NULL,
      hint TEXT NOT NULL CHECK (hint IN ('unknown','none','ready','due')),
      due_at TEXT,
      CHECK ((hint = 'due' AND due_at IS NOT NULL) OR (hint != 'due' AND due_at IS NULL)),
      UNIQUE (tenant, call)) STRICT`,
      [],
    )
    port.execute(
      'CREATE INDEX tl_maintenance_order ON tl_material_maintenance (tenant, sequence)',
      [],
    )
    port.execute(
      "CREATE INDEX tl_maintenance_active ON tl_material_maintenance (tenant, sequence) WHERE hint != 'none'",
      [],
    )
    port.execute(
      `INSERT INTO tl_material_maintenance (tenant, call, hint, due_at)
      SELECT d.tenant, d.name,
        CASE WHEN h.record IS NULL THEN 'unknown' ELSE json_extract(h.record, '$.hint.kind') END,
        json_extract(h.record, '$.hint.at')
      FROM tl_domain d LEFT JOIN tl_record h
        ON h.tenant = d.tenant AND h.kind = d.kind AND h.name = d.name
        AND h.key = 'material-maintenance-hint'
      WHERE d.kind = 'call' ORDER BY d.tenant, d.name`,
      [],
    )
  },
  verify(port) {
    const found = port.execute(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'tl_material_maintenance' LIMIT 1",
      [],
    )
    return found.rows.length === 1
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: 'missing material maintenance table' }
  },
}
export default migration
