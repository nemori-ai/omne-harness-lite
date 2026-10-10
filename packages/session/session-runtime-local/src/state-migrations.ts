import type { MigrationFragment } from '@omne-harness-lite/storage'
export const sessionStateMigrations: readonly MigrationFragment[] = [
  {
    name: 'local_session_state',
    migration: {
      async up(db) {
        await db.schema
          .createTable('sr_session_state')
          .addColumn('session', 'text', c => c.primaryKey())
          .addColumn('tenant', 'text', c => c.notNull())
          .addColumn('revision', 'text', c => c.notNull())
          .addColumn('lifecycle', 'text', c => c.notNull())
          .addColumn('run', 'text')
          .addColumn('run_state', 'text')
          .addColumn('attempt', 'text')
          .addColumn('execution_generation', 'text')
          .execute()
        await db.schema
          .createTable('sr_run_seen')
          .addColumn('session', 'text', c => c.notNull())
          .addColumn('run', 'text', c => c.notNull())
          .addPrimaryKeyConstraint('sr_run_seen_pkey', ['session', 'run'])
          .addForeignKeyConstraint(
            'sr_run_seen_session',
            ['session'],
            'sr_session_state',
            ['session'],
            fk => fk.onDelete('restrict'),
          )
          .execute()
        await db.schema
          .createTable('sr_pending_input')
          .addColumn('session', 'text', c => c.notNull())
          .addColumn('position', 'text', c => c.notNull())
          .addColumn('position_length', 'integer', c => c.notNull())
          .addColumn('operation', 'text', c => c.notNull())
          .addColumn('semantic', 'text', c => c.notNull())
          .addColumn('reserved_run', 'text')
          .addPrimaryKeyConstraint('sr_pending_input_pkey', ['session', 'position'])
          .addUniqueConstraint('sr_pending_input_operation', ['session', 'operation'])
          .addForeignKeyConstraint(
            'sr_pending_input_session',
            ['session'],
            'sr_session_state',
            ['session'],
            fk => fk.onDelete('restrict'),
          )
          .execute()
      },
    },
  },
  {
    name: 'local_session_work_index',
    migration: {
      async up(db) {
        await db.schema
          .createIndex('sr_session_work_scope')
          .on('sr_session_state')
          .columns(['tenant', 'lifecycle', 'session'])
          .execute()
      },
    },
  },
]
