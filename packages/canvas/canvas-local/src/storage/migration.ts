import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { MIGRATION, TABLES } from './schema.ts'

/** All three tables at once: the head of a canvas, its items, its piles. One reference has one item on a canvas. */
const STATEMENTS = [
  'CREATE TABLE canvas_head (tenant TEXT NOT NULL, canvas TEXT NOT NULL, revision INTEGER NOT NULL, next_rank INTEGER NOT NULL, PRIMARY KEY (tenant, canvas))',
  'CREATE TABLE canvas_item (tenant TEXT NOT NULL, canvas TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL, ref TEXT NOT NULL, state TEXT NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL, width INTEGER, height INTEGER, rank INTEGER NOT NULL, pile TEXT, locked INTEGER NOT NULL, by_kind TEXT NOT NULL, by_session TEXT, changed_at TEXT NOT NULL, PRIMARY KEY (tenant, canvas, id), UNIQUE (tenant, canvas, kind, ref))',
  'CREATE TABLE canvas_pile (tenant TEXT NOT NULL, canvas TEXT NOT NULL, id TEXT NOT NULL, name TEXT, x INTEGER NOT NULL, y INTEGER NOT NULL, by_kind TEXT NOT NULL, by_session TEXT, changed_at TEXT NOT NULL, PRIMARY KEY (tenant, canvas, id))',
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
