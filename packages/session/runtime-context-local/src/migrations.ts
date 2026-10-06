import type { MigrationFragment } from '@omne-harness-lite/storage'

/** The assembly composes these owner tables with its other migration fragments. */
export const runtimeContextMigrations: readonly MigrationFragment[] = [
  {
    name: 'runtime_context_projection',
    migration: {
      async up(db) {
        await db.schema
          .createTable('rc_projection_meta')
          .addColumn('tenant', 'text', c => c.notNull())
          .addColumn('session', 'text', c => c.notNull())
          .addColumn('fold_version', 'text', c => c.notNull())
          .addColumn('projection_revision', 'text', c => c.notNull())
          .addColumn('applied_tail', 'text', c => c.notNull())
          .addColumn('registration_revision', 'text', c => c.notNull())
          .addColumn('initialization_revision', 'text', c => c.notNull())
          .addColumn('seed', 'text')
          .addPrimaryKeyConstraint('rc_projection_meta_pk', ['tenant', 'session'])
          .execute()
        await db.schema
          .createTable('rc_projection_entries')
          .addColumn('tenant', 'text', c => c.notNull())
          .addColumn('session', 'text', c => c.notNull())
          .addColumn('key', 'text', c => c.notNull())
          .addColumn('registration', 'text', c => c.notNull())
          .addColumn('content', 'text')
          .addPrimaryKeyConstraint('rc_projection_entries_pk', ['tenant', 'session', 'key'])
          .addForeignKeyConstraint(
            'rc_projection_entries_scope_fk',
            ['tenant', 'session'],
            'rc_projection_meta',
            ['tenant', 'session'],
            fk => fk.onDelete('restrict'),
          )
          .execute()
      },
    },
  },
]
