import type { MigrationFragment } from '@omne-harness-lite/storage'

export const toolOriginalIssueMigrations: readonly MigrationFragment[] = [
  {
    name: 'tool_original_issue',
    migration: {
      async up(db) {
        await db.schema
          .createTable('tool_original_issue')
          .addColumn('tenant', 'text', c => c.notNull())
          .addColumn('session', 'text', c => c.notNull())
          .addColumn('call', 'text', c => c.notNull())
          .addColumn('identity', 'text', c => c.notNull())
          .addColumn('intent', 'text', c => c.notNull())
          .addColumn('claim', 'text', c => c.notNull())
          .addColumn('consumed', 'integer', c => c.notNull())
          .addPrimaryKeyConstraint('tool_original_issue_pk', ['tenant', 'session', 'call'])
          .execute()
      },
    },
  },
]
