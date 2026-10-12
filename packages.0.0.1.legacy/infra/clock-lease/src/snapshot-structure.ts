// D055: expected physical structure of this owner's current SQLite migrations.
// Keep with the migration; fresh/upgrade positives and damaged-structure negatives verify it.
import type { SnapshotTable } from '@omne-harness-lite/storage'

export const snapshotTables: readonly SnapshotTable[] = [
  {
    name: 'clock_lease',
    definition:
      'CREATE TABLE "clock_lease" ("id" integer primary key check (id = 1), "lease_until" bigint not null, "written_at" bigint not null)',
    columns: [
      {
        name: 'id',
        type: 'INTEGER',
        notNull: false,
        primaryKeyPosition: 1,
      },
      {
        name: 'lease_until',
        type: 'bigint',
        notNull: true,
        primaryKeyPosition: 0,
      },
      {
        name: 'written_at',
        type: 'bigint',
        notNull: true,
        primaryKeyPosition: 0,
      },
    ],
    indexes: [],
    foreignKeys: [],
  },
]
