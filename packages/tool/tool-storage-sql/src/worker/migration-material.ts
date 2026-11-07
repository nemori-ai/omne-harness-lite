import type { MigrationModule } from '@omne-harness/sql-contract/worker'

export const MATERIAL_MIGRATION = { owner: 'tool', id: '002-tool-materials' }
export const MATERIAL_TABLES = ['tl_material', 'tl_material_chunk']

const migration: MigrationModule = {
  ...MATERIAL_MIGRATION,
  up(port) {
    port.execute(
      `CREATE TABLE tl_material (
      tenant TEXT NOT NULL, call TEXT NOT NULL, material TEXT NOT NULL,
      operation TEXT NOT NULL, digest TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('preparing','sealed','deleting','deleted')),
      descriptor TEXT, delete_operation TEXT, delete_digest TEXT, receipt TEXT,
      PRIMARY KEY (tenant, call, material)) STRICT`,
      [],
    )
    port.execute(
      `CREATE TABLE tl_material_chunk (
      tenant TEXT NOT NULL, call TEXT NOT NULL, material TEXT NOT NULL,
      idx INTEGER NOT NULL, data BLOB NOT NULL,
      PRIMARY KEY (tenant, call, material, idx)) STRICT`,
      [],
    )
  },
  verify(port) {
    const found = port.execute(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN ('tl_material','tl_material_chunk') LIMIT 2",
      [],
    )
    return found.rows.length === 2
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: 'missing material tables' }
  },
}
export default migration
