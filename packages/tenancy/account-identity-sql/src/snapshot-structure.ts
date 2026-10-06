// D055: expected physical structure of this owner's current SQLite migrations.
// Keep with the migration; fresh/upgrade positives and damaged-structure negatives verify it.
import type { SnapshotTable } from '@omne-harness-lite/storage'

export const snapshotTables: readonly SnapshotTable[] = [
  {
    name: 'account',
    definition:
      'CREATE TABLE "account" ("account_id" text not null primary key, "login_identifier" text not null, "credential_material" text not null, "activated" boolean not null, "produced_at" bigint not null, "retention_deadline" bigint not null, "expired_at" bigint, "credential_revision" bigint default 0 not null)',
    columns: [
      {
        name: 'account_id',
        type: 'TEXT',
        notNull: true,
        primaryKeyPosition: 1,
      },
      {
        name: 'login_identifier',
        type: 'TEXT',
        notNull: true,
        primaryKeyPosition: 0,
      },
      {
        name: 'credential_material',
        type: 'TEXT',
        notNull: true,
        primaryKeyPosition: 0,
      },
      {
        name: 'activated',
        type: 'boolean',
        notNull: true,
        primaryKeyPosition: 0,
      },
      {
        name: 'produced_at',
        type: 'bigint',
        notNull: true,
        primaryKeyPosition: 0,
      },
      {
        name: 'retention_deadline',
        type: 'bigint',
        notNull: true,
        primaryKeyPosition: 0,
      },
      {
        name: 'expired_at',
        type: 'bigint',
        notNull: false,
        primaryKeyPosition: 0,
      },
      {
        name: 'credential_revision',
        type: 'bigint',
        notNull: true,
        primaryKeyPosition: 0,
      },
    ],
    indexes: [
      {
        name: 'account_login_identifier_unique',
        unique: true,
        partial: false,
        columns: ['login_identifier'],
        definition:
          'CREATE UNIQUE INDEX "account_login_identifier_unique" on "account" ("login_identifier")',
      },
      {
        name: 'sqlite_autoindex_account_1',
        unique: true,
        partial: false,
        columns: ['account_id'],
        definition: null,
      },
    ],
    foreignKeys: [],
  },
  {
    name: 'login_state',
    definition:
      'CREATE TABLE "login_state" ("login_state_id" text not null primary key, "account_id" text not null, "issued_at" bigint not null, "revoked" boolean not null, "credential_revision" bigint default 0 not null, "last_activity_at" bigint default 0 not null)',
    columns: [
      {
        name: 'login_state_id',
        type: 'TEXT',
        notNull: true,
        primaryKeyPosition: 1,
      },
      {
        name: 'account_id',
        type: 'TEXT',
        notNull: true,
        primaryKeyPosition: 0,
      },
      {
        name: 'issued_at',
        type: 'bigint',
        notNull: true,
        primaryKeyPosition: 0,
      },
      {
        name: 'revoked',
        type: 'boolean',
        notNull: true,
        primaryKeyPosition: 0,
      },
      {
        name: 'credential_revision',
        type: 'bigint',
        notNull: true,
        primaryKeyPosition: 0,
      },
      {
        name: 'last_activity_at',
        type: 'bigint',
        notNull: true,
        primaryKeyPosition: 0,
      },
    ],
    indexes: [
      {
        name: 'login_state_account_id_index',
        unique: false,
        partial: false,
        columns: ['account_id'],
        definition: 'CREATE INDEX "login_state_account_id_index" on "login_state" ("account_id")',
      },
      {
        name: 'sqlite_autoindex_login_state_1',
        unique: true,
        partial: false,
        columns: ['login_state_id'],
        definition: null,
      },
    ],
    foreignKeys: [],
  },
]
