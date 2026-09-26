// D055: expected physical structure of this owner's current SQLite migrations.
// Keep with the migration; fresh/upgrade positives and damaged-structure negatives verify it.
import type { SnapshotTable } from '@omne-harness-lite/storage'

export const snapshotTables: readonly SnapshotTable[] = [
  {
    name: 'kysely_migration',
    definition:
      'CREATE TABLE "kysely_migration" ("name" varchar(255) not null primary key, "timestamp" varchar(255) not null)',
    columns: [
      {
        name: 'name',
        type: 'varchar(255)',
        notNull: true,
        primaryKeyPosition: 1,
      },
      {
        name: 'timestamp',
        type: 'varchar(255)',
        notNull: true,
        primaryKeyPosition: 0,
      },
    ],
    indexes: [
      {
        name: 'sqlite_autoindex_kysely_migration_1',
        unique: true,
        partial: false,
        columns: ['name'],
        definition: null,
      },
    ],
    foreignKeys: [],
  },
  {
    name: 'kysely_migration_lock',
    definition:
      'CREATE TABLE "kysely_migration_lock" ("id" varchar(255) not null primary key, "is_locked" integer default 0 not null)',
    columns: [
      {
        name: 'id',
        type: 'varchar(255)',
        notNull: true,
        primaryKeyPosition: 1,
      },
      {
        name: 'is_locked',
        type: 'INTEGER',
        notNull: true,
        primaryKeyPosition: 0,
      },
    ],
    indexes: [
      {
        name: 'sqlite_autoindex_kysely_migration_lock_1',
        unique: true,
        partial: false,
        columns: ['id'],
        definition: null,
      },
    ],
    foreignKeys: [],
  },
]
