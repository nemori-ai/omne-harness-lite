import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { SOURCES_MIGRATION, SOURCES_TABLE } from './schema.ts'

/** One count for each workspace and tenant. A migration that ran is never edited: this is a second one. */
export default {
  ...SOURCES_MIGRATION,
  up(port) {
    port.execute(
      `CREATE TABLE ${SOURCES_TABLE} (workspace TEXT NOT NULL, tenant TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(workspace, tenant))`,
      [],
    )
  },
  verify(port) {
    port.execute(`SELECT * FROM ${SOURCES_TABLE} LIMIT 0`, [])
    return { kind: 'verified' }
  },
} satisfies MigrationModule
