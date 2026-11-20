import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { ADOPTIONS_MIGRATION, ADOPTIONS_TABLE, READINGS_TABLE } from './schema.ts'

/** The readings of each tenant's sources and the keys that point at them. A third migration. */
export default {
  ...ADOPTIONS_MIGRATION,
  up(port) {
    port.execute(
      `CREATE TABLE ${READINGS_TABLE} (workspace TEXT NOT NULL, tenant TEXT NOT NULL, revision INTEGER NOT NULL, instance TEXT NOT NULL, packages TEXT NOT NULL, PRIMARY KEY(workspace, tenant, revision))`,
      [],
    )
    port.execute(
      `CREATE TABLE ${ADOPTIONS_TABLE} (workspace TEXT NOT NULL, tenant TEXT NOT NULL, key TEXT NOT NULL, instance TEXT NOT NULL, revision INTEGER NOT NULL, fresh INTEGER NOT NULL, reason TEXT, PRIMARY KEY(workspace, tenant, key))`,
      [],
    )
  },
  verify(port) {
    for (const table of [READINGS_TABLE, ADOPTIONS_TABLE])
      port.execute(`SELECT * FROM ${table} LIMIT 0`, [])
    return { kind: 'verified' }
  },
} satisfies MigrationModule
