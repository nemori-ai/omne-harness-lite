import type { MigrationFragment } from '@omne-harness-lite/storage'

export const evaluationInputMigrations: readonly MigrationFragment[] = [
  {
    name: 'evaluation_input_head',
    migration: {
      async up(db) {
        await db.schema
          .createTable('evaluation_input_head')
          .ifNotExists()
          .addColumn('store_key', 'text', c => c.notNull())
          .addColumn('revision', 'text', c => c.notNull())
          .addColumn('factory_manifest', 'text', c => c.notNull())
          .addPrimaryKeyConstraint('evaluation_input_head_pkey', ['store_key'])
          .execute()
      },
    },
  },
  {
    name: 'evaluation_input_asset',
    migration: {
      async up(db) {
        await db.schema
          .createTable('evaluation_input_asset')
          .ifNotExists()
          .addColumn('store_key', 'text', c => c.notNull())
          .addColumn('asset_id', 'text', c => c.notNull())
          .addColumn('metadata', 'text', c => c.notNull())
          .addColumn('draft', 'text')
          .addPrimaryKeyConstraint('evaluation_input_asset_pkey', ['store_key', 'asset_id'])
          .execute()
      },
    },
  },
  {
    name: 'evaluation_input_version',
    migration: {
      async up(db) {
        await db.schema
          .createTable('evaluation_input_version')
          .ifNotExists()
          .addColumn('store_key', 'text', c => c.notNull())
          .addColumn('asset_id', 'text', c => c.notNull())
          .addColumn('version_position', 'text', c => c.notNull())
          .addColumn('version', 'text', c => c.notNull())
          .addPrimaryKeyConstraint('evaluation_input_version_pkey', [
            'store_key',
            'asset_id',
            'version_position',
          ])
          .addForeignKeyConstraint(
            'evaluation_input_version_asset_fk',
            ['store_key', 'asset_id'],
            'evaluation_input_asset',
            ['store_key', 'asset_id'],
            fk => fk.onDelete('restrict'),
          )
          .execute()
      },
    },
  },
  {
    name: 'evaluation_input_scope',
    migration: {
      async up(db) {
        await db.schema
          .createTable('evaluation_input_scope')
          .ifNotExists()
          .addColumn('store_key', 'text', c => c.notNull())
          .addColumn('layer', 'text', c => c.notNull())
          .addColumn('scope_key', 'text', c => c.notNull())
          .addColumn('holdings', 'text', c => c.notNull())
          .addPrimaryKeyConstraint('evaluation_input_scope_pkey', [
            'store_key',
            'layer',
            'scope_key',
          ])
          .execute()
      },
    },
  },
  {
    name: 'evaluation_input_recipe',
    migration: {
      async up(db) {
        await db.schema
          .createTable('evaluation_input_recipe')
          .ifNotExists()
          .addColumn('store_key', 'text', c => c.notNull())
          .addColumn('session', 'text', c => c.notNull())
          .addColumn('tenant', 'text', c => c.notNull())
          .addColumn('standing_at_creation', 'text', c => c.notNull())
          .addColumn('root_definition', 'text', c => c.notNull())
          .addColumn('session_assignments', 'text')
          .addColumn('workspace', 'text')
          .addColumn('source_at_creation', 'text', c => c.notNull())
          .addPrimaryKeyConstraint('evaluation_input_recipe_pkey', ['store_key', 'session'])
          .execute()
      },
    },
  },
]
