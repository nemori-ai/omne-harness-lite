import { sql } from 'kysely'
import type { MigrationFragment } from '@omne-harness-lite/storage'
export const assemblyManifestMigrations: readonly MigrationFragment[] = [
  {
    name: 'assembly_manifest',
    migration: {
      async up(db) {
        await db.schema
          .createTable('assembly_manifest_record')
          .ifNotExists()
          .addColumn('session', 'text', c => c.notNull())
          .addColumn('seq', 'integer', c => c.notNull())
          .addColumn('evaluation_kind', 'text', c => c.notNull())
          .addColumn('evaluation_ref', 'text', c => c.notNull())
          .addColumn('owned_ref', 'text')
          .addColumn('content', 'text', c => c.notNull())
          .addPrimaryKeyConstraint('assembly_manifest_record_pkey', ['session', 'seq'])
          .addCheckConstraint(
            'assembly_manifest_record_kind_check',
            sql`evaluation_kind IN ('given', 'mint', 'reuse')`,
          )
          .addCheckConstraint(
            'assembly_manifest_record_owner_check',
            sql`(evaluation_kind = 'reuse' AND owned_ref IS NULL) OR (evaluation_kind IN ('given', 'mint') AND owned_ref IS NOT NULL AND owned_ref = evaluation_ref)`,
          )
          .execute()
        await db.schema
          .createIndex('assembly_manifest_record_owned_ref_unique')
          .ifNotExists()
          .on('assembly_manifest_record')
          .column('owned_ref')
          .unique()
          .execute()
        await db.schema
          .createTable('assembly_manifest_table')
          .ifNotExists()
          .addColumn('session', 'text', c => c.notNull())
          .addColumn('seq', 'integer', c => c.notNull())
          .addColumn('category', 'text', c => c.notNull())
          .addColumn('filled_at', 'integer', c => c.notNull())
          .addColumn('composition', 'text', c => c.notNull())
          .addPrimaryKeyConstraint('assembly_manifest_table_pkey', ['session', 'seq', 'category'])
          .addForeignKeyConstraint(
            'assembly_manifest_table_record_fk',
            ['session', 'seq'],
            'assembly_manifest_record',
            ['session', 'seq'],
            c => c.onDelete('restrict'),
          )
          .execute()
        await db.schema
          .createIndex('assembly_manifest_table_filled_unique')
          .ifNotExists()
          .on('assembly_manifest_table')
          .columns(['session', 'category', 'filled_at'])
          .unique()
          .execute()
      },
    },
  },
]
