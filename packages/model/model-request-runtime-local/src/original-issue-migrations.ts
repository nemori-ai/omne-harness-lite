import type { MigrationFragment } from '@omne-harness-lite/storage'
/** Private model execution ownership, composed with the log migration on one AtomicStorage. */
export const originalIssueMigrations: readonly MigrationFragment[] = [
  {
    name: 'model_original_issue_1',
    migration: {
      async up(db) {
        await db.schema
          .createTable('mr_original_issue')
          .addColumn('session', 'text', column => column.notNull())
          .addColumn('call', 'text', column => column.notNull())
          .addColumn('dispatch', 'text', column => column.notNull())
          .addColumn('tenant', 'text', column => column.notNull())
          .addColumn('owner_generation', 'text', column => column.notNull())
          .addColumn('original_position', 'text', column => column.notNull())
          .addColumn('value', 'text', column => column.notNull())
          .addPrimaryKeyConstraint('mr_original_issue_pkey', ['session', 'call', 'dispatch'])
          .execute()
      },
    },
  },
]
