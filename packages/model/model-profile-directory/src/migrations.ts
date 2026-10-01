import type { MigrationFragment } from '@omne-harness-lite/storage'

/** Four directory-owned facts. Never removes rows or configuration history. */
export const modelProfileDirectoryMigrations: readonly MigrationFragment[] = [
  {
    name: 'model_profile_directory_v3',
    migration: {
      async up(db) {
        await db.schema
          .createTable('model_profile')
          .addColumn('scope_layer', 'text', c => c.notNull())
          .addColumn('organization_id', 'text', c => c.notNull())
          .addColumn('account_id', 'text', c => c.notNull())
          .addColumn('route_name', 'text', c => c.notNull())
          .addColumn('profile_json', 'text', c => c.notNull())
          .addPrimaryKeyConstraint('model_profile_pkey', [
            'scope_layer',
            'organization_id',
            'account_id',
            'route_name',
          ])
          .execute()
        await db.schema
          .createTable('model_profile_configuration')
          .addColumn('scope_layer', 'text', c => c.notNull())
          .addColumn('organization_id', 'text', c => c.notNull())
          .addColumn('account_id', 'text', c => c.notNull())
          .addColumn('route_name', 'text', c => c.notNull())
          .addColumn('revision', 'text', c => c.notNull())
          .addColumn('values_json', 'text', c => c.notNull())
          .addPrimaryKeyConstraint('model_profile_configuration_pkey', [
            'scope_layer',
            'organization_id',
            'account_id',
            'route_name',
            'revision',
          ])
          .execute()
        await db.schema
          .createTable('model_manifest_state')
          .addColumn('id', 'integer', c => c.primaryKey())
          .addColumn('ordinal_json', 'text', c => c.notNull())
          .addColumn('dispositions_json', 'text', c => c.notNull())
          .execute()
        await db
          .insertInto('model_manifest_state')
          .values({ id: 1, ordinal_json: '0', dispositions_json: '[]' })
          .execute()
        await db.schema
          .createTable('model_credential_binding')
          .addColumn('organization_id', 'text', c => c.notNull())
          .addColumn('account_id', 'text', c => c.notNull())
          .addColumn('credential_ref', 'text', c => c.notNull())
          .addColumn('bound_at', 'text', c => c.notNull())
          .addPrimaryKeyConstraint('model_credential_binding_pkey', [
            'organization_id',
            'account_id',
          ])
          .execute()
      },
    },
  },
]
