// D055: expected physical structure of this owner's current SQLite migrations.
// Keep with the migration; fresh/upgrade positives and damaged-structure negatives verify it.
import type { SnapshotTable } from '@omne-harness-lite/storage'

export const snapshotTables: readonly SnapshotTable[] = [
  {
    name: 'governance_center',
    definition:
      'CREATE TABLE "governance_center" ("slot" text not null primary key, "center_id" text)',
    columns: [
      {
        name: 'slot',
        type: 'TEXT',
        notNull: true,
        primaryKeyPosition: 1,
      },
      {
        name: 'center_id',
        type: 'TEXT',
        notNull: false,
        primaryKeyPosition: 0,
      },
    ],
    indexes: [
      {
        name: 'sqlite_autoindex_governance_center_1',
        unique: true,
        partial: false,
        columns: ['slot'],
        definition: null,
      },
    ],
    foreignKeys: [],
  },
]
