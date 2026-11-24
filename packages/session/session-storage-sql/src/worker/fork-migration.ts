// Adds the two tables of a forked session. An existing session needs no backfill: it has no source.
import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { FORK_MIGRATION, FORK_STATEMENTS, FORK_TABLES } from './fork.ts'

const migration: MigrationModule = {
  ...FORK_MIGRATION,
  up(port) {
    for (const statement of FORK_STATEMENTS) port.execute(statement, [])
  },
  verify(port) {
    const found = port.execute('SELECT name FROM sqlite_schema WHERE name IN (?, ?) LIMIT 2', [
      ...FORK_TABLES,
    ])
    return found.rows.length === 2
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: 'the tables of a forked session are missing' }
  },
}
export default migration
