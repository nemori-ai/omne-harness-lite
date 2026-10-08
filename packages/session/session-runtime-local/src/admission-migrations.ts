import { randomUUID } from 'node:crypto'
import type { MigrationFragment } from '@omne-harness-lite/storage'

/** Compose on the root admission storage before opening its trusted owner. */
export const admissionMigrations: readonly MigrationFragment[] = [
  {
    name: 'local_session_admission',
    migration: {
      async up(db) {
        await db.schema
          .createTable('sr_admission_meta')
          .addColumn('slot', 'integer', c => c.primaryKey())
          .addColumn('format', 'integer', c => c.notNull())
          .addColumn('root', 'text', c => c.notNull())
          .addColumn('sequence', 'text', c => c.notNull())
          .execute()
        await db
          .insertInto('sr_admission_meta')
          .values({ slot: 1, format: 1, root: randomUUID(), sequence: '0' })
          .execute()
        await db.schema
          .createTable('sr_admission_login')
          .addColumn('key', 'text', c => c.primaryKey())
          .addColumn('source', 'text', c => c.notNull())
          .addColumn('state', 'text', c => c.notNull())
          .execute()
        await db.schema
          .createTable('sr_admission_member')
          .addColumn('key', 'text', c => c.primaryKey())
          .addColumn('binding', 'text', c => c.notNull())
          .addColumn('state', 'text', c => c.notNull())
          .execute()
        await db.schema
          .createTable('sr_admission_ticket')
          .addColumn('id', 'text', c => c.primaryKey())
          .addColumn('login_key', 'text', c => c.notNull())
          .addColumn('member_key', 'text')
          .addColumn('request_key', 'text', c => c.notNull().unique())
          .addColumn('sequence', 'text', c => c.notNull())
          .addColumn('sequence_length', 'integer', c => c.notNull())
          .addColumn('target', 'text', c => c.notNull())
          .addColumn('state', 'text', c => c.notNull())
          .addForeignKeyConstraint(
            'sr_admission_ticket_login',
            ['login_key'],
            'sr_admission_login',
            ['key'],
            fk => fk.onDelete('restrict'),
          )
          .execute()
        await db.schema
          .createIndex('sr_admission_ticket_order')
          .on('sr_admission_ticket')
          .columns(['login_key', 'sequence_length', 'sequence'])
          .execute()
      },
    },
  },
]
/** Compose in each actual tenant runtime storage with log and state migrations. */
export const admissionUseMigrations: readonly MigrationFragment[] = [
  {
    name: 'local_session_admission_use',
    migration: {
      async up(db) {
        await db.schema
          .createTable('sr_admission_use')
          .addColumn('root', 'text', c => c.notNull())
          .addColumn('ticket', 'text', c => c.notNull())
          .addColumn('binding', 'text', c => c.notNull())
          .addColumn('receipt', 'text', c => c.notNull())
          .addPrimaryKeyConstraint('sr_admission_use_pkey', ['root', 'ticket'])
          .execute()
      },
    },
  },
]
