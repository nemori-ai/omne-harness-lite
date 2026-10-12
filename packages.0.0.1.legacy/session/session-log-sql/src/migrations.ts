import type { MigrationFragment } from '@omne-harness-lite/storage'

/** Owned journal tables. Assemblies compose these fragments before admitting consumers. */
export const sessionLogMigrations: readonly MigrationFragment[] = [
  {
    name: 'session_log_journal',
    migration: {
      async up(db) {
        await db.schema
          .createTable('sl_journal')
          .addColumn('session', 'text', c => c.notNull())
          .addColumn('tenant', 'text', c => c.notNull())
          .addColumn('generation', 'text', c => c.notNull())
          .addColumn('tail', 'text', c => c.notNull())
          .addPrimaryKeyConstraint('sl_journal_pkey', ['session'])
          .execute()
        await db.schema
          .createTable('sl_entry')
          .addColumn('session', 'text', c => c.notNull())
          .addColumn('position', 'text', c => c.notNull())
          .addColumn('position_length', 'integer', c => c.notNull())
          .addColumn('batch', 'text', c => c.notNull())
          .addColumn('dedupe_key', 'text')
          .addColumn('value', 'text', c => c.notNull())
          .addPrimaryKeyConstraint('sl_entry_pkey', ['session', 'position'])
          .addForeignKeyConstraint(
            'sl_entry_journal_fk',
            ['session'],
            'sl_journal',
            ['session'],
            fk => fk.onDelete('restrict'),
          )
          .execute()
        await db.schema
          .createIndex('sl_entry_dedupe_unique')
          .unique()
          .on('sl_entry')
          .columns(['session', 'dedupe_key'])
          .execute()
        await db.schema
          .createIndex('sl_entry_order')
          .on('sl_entry')
          .columns(['session', 'position_length', 'position'])
          .execute()
        await db.schema
          .createIndex('sl_entry_batch')
          .on('sl_entry')
          .columns(['session', 'batch'])
          .execute()
        await db.schema
          .createTable('sl_read_key')
          .addColumn('session', 'text', c => c.notNull())
          .addColumn('key', 'text', c => c.notNull())
          .addColumn('position', 'text', c => c.notNull())
          .addColumn('position_length', 'integer', c => c.notNull())
          .addPrimaryKeyConstraint('sl_read_key_pkey', ['session', 'key', 'position'])
          .addForeignKeyConstraint(
            'sl_read_key_entry_fk',
            ['session', 'position'],
            'sl_entry',
            ['session', 'position'],
            fk => fk.onDelete('restrict'),
          )
          .execute()
        await db.schema
          .createTable('sl_attempt')
          .addColumn('session', 'text', c => c.notNull())
          .addColumn('run', 'text', c => c.notNull())
          .addColumn('attempt', 'text', c => c.notNull())
          .addPrimaryKeyConstraint('sl_attempt_pkey', ['session', 'run'])
          .addForeignKeyConstraint(
            'sl_attempt_journal_fk',
            ['session'],
            'sl_journal',
            ['session'],
            fk => fk.onDelete('restrict'),
          )
          .execute()
      },
    },
  },
]
