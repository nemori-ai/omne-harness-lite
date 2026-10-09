import type { MigrationFragment } from '@omne-harness-lite/storage'
export const sessionRuntimeMigrations: readonly MigrationFragment[] = [
  {
    name: 'local_session_tool_result',
    migration: {
      async up(db) {
        await db.schema
          .createTable('sr_tool_result')
          .addColumn('session', 'text', c => c.notNull())
          .addColumn('call', 'text', c => c.notNull())
          .addColumn('result_key', 'text', c => c.notNull())
          .addColumn('record', 'text', c => c.notNull())
          .addPrimaryKeyConstraint('sr_tool_result_pk', ['session', 'call'])
          .execute()
      },
    },
  },
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
  {
    name: 'local_session_call_preparation',
    migration: {
      async up(db) {
        await db.schema
          .createTable('sr_call_preparation')
          .addColumn('session', 'text', c => c.notNull())
          .addColumn('call', 'text', c => c.notNull())
          .addColumn('preparation', 'text', c => c.notNull())
          .addPrimaryKeyConstraint('sr_call_preparation_pk', ['session', 'call'])
          .execute()
      },
    },
  },
  {
    name: 'local_session_model_issue',
    migration: {
      async up(db) {
        await db.schema
          .createTable('sr_model_issue')
          .addColumn('session', 'text', c => c.notNull())
          .addColumn('call', 'text', c => c.notNull())
          .addColumn('dispatch', 'text', c => c.notNull())
          .addColumn('source_generation', 'text', c => c.notNull())
          .addColumn('source_tail', 'text', c => c.notNull())
          .addColumn('issue', 'text', c => c.notNull())
          .addPrimaryKeyConstraint('sr_model_issue_pk', ['session', 'call', 'dispatch'])
          .execute()
        await db.schema
          .createIndex('sr_model_issue_source')
          .on('sr_model_issue')
          .columns(['session', 'source_generation', 'source_tail'])
          .execute()
      },
    },
  },
  {
    name: 'local_session_model_result_custody',
    migration: {
      async up(db) {
        await db.schema
          .createTable('sr_model_result')
          .addColumn('session', 'text', c => c.notNull())
          .addColumn('call', 'text', c => c.notNull())
          .addColumn('result_key', 'text', c => c.notNull())
          .addColumn('response', 'text', c => c.notNull())
          .addColumn('record', 'text', c => c.notNull())
          .addPrimaryKeyConstraint('sr_model_result_pk', ['session', 'call', 'result_key'])
          .addUniqueConstraint('sr_model_result_response', ['session', 'call', 'response'])
          .execute()
      },
    },
  },
  {
    name: 'local_session_result_adoption',
    migration: {
      async up(db) {
        await db.schema
          .createTable('sr_result_adoption')
          .addColumn('session', 'text', c => c.notNull())
          .addColumn('call', 'text', c => c.notNull())
          .addColumn('response', 'text', c => c.notNull())
          .addColumn('result_key', 'text', c => c.notNull())
          .addColumn('step_key', 'text', c => c.notNull())
          .addPrimaryKeyConstraint('sr_result_adoption_pk', ['session', 'call', 'response'])
          .execute()
      },
    },
  },
  {
    name: 'local_session_tool_issue',
    migration: {
      async up(db) {
        await db.schema
          .createTable('sr_tool_issue')
          .addColumn('session', 'text', c => c.notNull())
          .addColumn('call', 'text', c => c.notNull())
          .addColumn('identity', 'text', c => c.notNull())
          .addColumn('preparation', 'text', c => c.notNull())
          .addPrimaryKeyConstraint('sr_tool_issue_pk', ['session', 'call'])
          .execute()
      },
    },
  },
]
