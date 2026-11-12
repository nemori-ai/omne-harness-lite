// 待办标记表的迁移模块。提供者在原子迁移里、在 001 的 Tool 表之后执行它。
import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { PENDING_MIGRATION, PENDING_STATEMENTS, PENDING_TABLES } from './schema.ts'

const migration: MigrationModule = {
  owner: PENDING_MIGRATION.owner,
  id: PENDING_MIGRATION.id,
  up(port) {
    for (const statement of PENDING_STATEMENTS) port.execute(statement, [])
  },
  verify(port) {
    const found = port.execute(
      `SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'tl_pending' LIMIT 1`,
      [],
    )
    const names = new Set(found.rows.map(row => String(row[0])))
    const missing = PENDING_TABLES.filter(name => !names.has(name))
    return missing.length === 0
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: `missing tables: ${missing.join(',')}` }
  },
}
export default migration
