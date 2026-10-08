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
  {
    name: 'local_session_coordination',
    migration: {
      async up(db) {
        await db.schema
          .createTable('sr_run_grant')
          .addColumn('session', 'text', c => c.notNull())
          .addColumn('run', 'text', c => c.notNull())
          .addColumn('grant', 'text', c => c.notNull())
          .addPrimaryKeyConstraint('sr_run_grant_pk', ['session', 'run'])
          .execute()
        await db.schema
          .createTable('sr_coordination_step')
          .addColumn('session', 'text', c => c.notNull())
          .addColumn('step_key', 'text', c => c.notNull())
          .addColumn('semantic', 'text', c => c.notNull())
          .addColumn('receipt', 'text', c => c.notNull())
          .addPrimaryKeyConstraint('sr_coordination_step_pk', ['session', 'step_key'])
          .execute()
      },
    },
  },
]
