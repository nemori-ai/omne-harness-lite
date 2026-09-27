import { sql } from 'kysely'
import type { MigrationFragment } from '@omne-harness-lite/storage'

/** Replica-only fragments. Append the source column without assigning a source to old rows. */
export const replicaMigrations: readonly MigrationFragment[] = Object.freeze([
  {
    name: 'credential_custodian_replica',
    migration: {
      async up(db) {
        await db.schema
          .createTable('credential_custodian_replica')
          .addColumn('tenant_organization', 'text', c => c.notNull())
          .addColumn('tenant_account', 'text', c => c.notNull())
          .addColumn('login_state', 'text', c => c.notNull())
          .addColumn('stored_at', 'bigint', c => c.notNull())
          .addColumn('sealed_body', sql`bytea`, c => c.notNull())
          .addPrimaryKeyConstraint('credential_custodian_replica_pkey', [
            'tenant_organization',
            'tenant_account',
          ])
          .execute()
        await db.schema
          .createIndex('credential_custodian_replica_login_state_idx')
          .on('credential_custodian_replica')
          .column('login_state')
          .execute()
      },
    },
  },
  {
    name: 'credential_custodian_replica_source_ref',
    migration: {
      async up(db) {
        await db.schema
          .alterTable('credential_custodian_replica')
          .addColumn('source_ref', 'text')
          .execute()
      },
    },
  },
])
