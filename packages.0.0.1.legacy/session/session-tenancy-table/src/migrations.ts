import type { MigrationFragment } from '@omne-harness-lite/storage'

export const sessionTenancyMigrations: readonly MigrationFragment[] = [
  {
    name: 'session_tenancy',
    migration: {
      async up(db) {
        await db.schema
          .createTable('session_tenancy')
          .ifNotExists()
          .addColumn('session', 'text', column => column.notNull())
          .addColumn('tenant', 'text', column => column.notNull())
          .addPrimaryKeyConstraint('session_tenancy_pkey', ['session'])
          .execute()
      },
    },
  },
]
