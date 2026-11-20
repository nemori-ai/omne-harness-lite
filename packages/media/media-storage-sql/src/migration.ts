import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { MIGRATION, TABLES } from './schema.ts'

const STATEMENTS = [
  'CREATE TABLE md_objects (key TEXT PRIMARY KEY, state TEXT NOT NULL, digest TEXT, expires_at INTEGER, record TEXT NOT NULL)',
  "CREATE UNIQUE INDEX md_objects_live ON md_objects(digest) WHERE state IN ('staged', 'held')",
  'CREATE INDEX md_objects_expiry ON md_objects(state, expires_at)',
  'CREATE TABLE md_holds (key TEXT NOT NULL, owner TEXT NOT NULL, work TEXT NOT NULL, position TEXT NOT NULL, purpose TEXT NOT NULL, PRIMARY KEY(key, owner, work, position, purpose))',
  'CREATE TABLE md_uploads (upload TEXT PRIMARY KEY, key TEXT NOT NULL)',
  'CREATE INDEX md_uploads_key ON md_uploads(key)',
]

export default {
  ...MIGRATION,
  up(port) {
    for (const statement of STATEMENTS) port.execute(statement, [])
  },
  verify(port) {
    for (const table of TABLES) port.execute(`SELECT * FROM ${table} LIMIT 0`, [])
    return { kind: 'verified' }
  },
} satisfies MigrationModule
