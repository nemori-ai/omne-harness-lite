import type { MigrationFragment } from '@omne-harness-lite/storage'
export const sessionRuntimeMigrations: readonly MigrationFragment[] = [
  {
    name: 'local_session_creation',
    migration: {
      async up(db) {
        await db.schema
          .createTable('sr_session_creation')
          .addColumn('operation', 'text', c => c.primaryKey())
          .addColumn('session', 'text', c => c.notNull().unique())
          .addColumn('input', 'text', c => c.notNull())
          .addColumn('semantic', 'text', c => c.notNull())
          .addColumn('published', 'integer', c => c.notNull())
          .execute()
      },
    },
  },
]
