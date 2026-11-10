import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { STANDALONE_PUBLICATION_MIGRATION } from './standalone-schema.ts'
export default {
  ...STANDALONE_PUBLICATION_MIGRATION,
  up(port) {
    port.execute(
      `CREATE TABLE st_target_publication (
      target_key TEXT PRIMARY KEY REFERENCES st_targets(target_key),
      publisher_ref TEXT NOT NULL CHECK(length(publisher_ref) > 0),
      definition_id TEXT NOT NULL CHECK(length(definition_id) > 0),
      publication_version TEXT NOT NULL CHECK(length(publication_version) > 0)
    ) STRICT, WITHOUT ROWID`,
      [],
    )
  },
  verify(port) {
    const count = port.execute(
      "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='st_target_publication'",
      [],
    ).rows[0]?.[0]
    return count === 1n
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: 'settings_target_publication_missing' }
  },
} satisfies MigrationModule
