import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { REPRESENTATIONS } from './schema.ts'

export default {
  ...REPRESENTATIONS,
  up(port) {
    port.execute(
      'CREATE TABLE md_representations (key TEXT NOT NULL, definition TEXT NOT NULL, revision TEXT NOT NULL, record TEXT NOT NULL, PRIMARY KEY(key, definition, revision))',
      [],
    )
  },
  verify(port) {
    port.execute('SELECT * FROM md_representations LIMIT 0', [])
    return { kind: 'verified' }
  },
} satisfies MigrationModule
