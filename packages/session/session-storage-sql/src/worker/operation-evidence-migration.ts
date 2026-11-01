// The migration module of the access evidence table of the Session operations. The provider runs it
// in its atomic migration, after the execution index.
import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import {
  OPERATION_EVIDENCE_MIGRATION,
  OPERATION_EVIDENCE_STATEMENTS,
  OPERATION_EVIDENCE_TABLES,
} from './schema.ts'

const migration: MigrationModule = {
  owner: OPERATION_EVIDENCE_MIGRATION.owner,
  id: OPERATION_EVIDENCE_MIGRATION.id,
  up(port) {
    for (const statement of OPERATION_EVIDENCE_STATEMENTS) port.execute(statement, [])
  },
  verify(port) {
    const found = port.execute(
      `SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'sl_operation_evidence' LIMIT 1`,
      [],
    )
    const names = new Set(found.rows.map(row => String(row[0])))
    const missing = OPERATION_EVIDENCE_TABLES.filter(name => !names.has(name))
    return missing.length === 0
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: `missing tables: ${missing.join(',')}` }
  },
}
export default migration
