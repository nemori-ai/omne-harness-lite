import type { MigrationFragment } from '@omne-harness-lite/storage'

export const hostEnvironmentMigrations: readonly MigrationFragment[] = [
  {
    name: 'host_environment_resources',
    migration: {
      async up(db) {
        await db.schema
          .createTable('host_environment_resources')
          .addColumn('provider', 'text', column => column.notNull())
          .addColumn('resource_key', 'text', column => column.notNull())
          .addColumn('scope', 'text', column => column.notNull())
          .addColumn('generation', 'text', column => column.notNull())
          .addColumn('receipt', 'text', column => column.notNull())
          .addColumn('data', 'text', column => column.notNull())
          .addPrimaryKeyConstraint('host_environment_resources_pk', ['provider', 'resource_key'])
          .execute()
      },
    },
  },
]
