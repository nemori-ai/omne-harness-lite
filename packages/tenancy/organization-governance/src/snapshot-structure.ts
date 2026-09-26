// D055: expected physical structure of this owner's current SQLite migrations.
// Keep with the migration; fresh/upgrade positives and damaged-structure negatives verify it.
import type { SnapshotTable } from '@omne-harness-lite/storage'

export const snapshotTables: readonly SnapshotTable[] = [
  {
    name: 'organization',
    definition:
      'CREATE TABLE "organization" ("organization_id" text not null, "kind" text not null, "parent" text, "owner_account" text, "created_at" bigint not null, constraint "organization_pkey" primary key ("organization_id"), constraint "organization_owner_account_fk" foreign key ("owner_account") references "account" ("account_id") on delete restrict)',
    columns: [
      {
        name: 'organization_id',
        type: 'TEXT',
        notNull: true,
        primaryKeyPosition: 1,
      },
      {
        name: 'kind',
        type: 'TEXT',
        notNull: true,
        primaryKeyPosition: 0,
      },
      {
        name: 'parent',
        type: 'TEXT',
        notNull: false,
        primaryKeyPosition: 0,
      },
      {
        name: 'owner_account',
        type: 'TEXT',
        notNull: false,
        primaryKeyPosition: 0,
      },
      {
        name: 'created_at',
        type: 'bigint',
        notNull: true,
        primaryKeyPosition: 0,
      },
    ],
    indexes: [
      {
        name: 'organization_owner_account_unique',
        unique: true,
        partial: false,
        columns: ['owner_account'],
        definition:
          'CREATE UNIQUE INDEX "organization_owner_account_unique" on "organization" ("owner_account")',
      },
      {
        name: 'sqlite_autoindex_organization_1',
        unique: true,
        partial: false,
        columns: ['organization_id'],
        definition: null,
      },
    ],
    foreignKeys: [
      {
        table: 'account',
        from: ['owner_account'],
        to: ['account_id'],
        onUpdate: 'NO ACTION',
        onDelete: 'RESTRICT',
      },
    ],
  },
  {
    name: 'membership',
    definition:
      'CREATE TABLE "membership" ("organization_id" text not null, "account_id" text not null, "effective" integer not null, "role" text not null, constraint "membership_pkey" primary key ("organization_id", "account_id"))',
    columns: [
      {
        name: 'organization_id',
        type: 'TEXT',
        notNull: true,
        primaryKeyPosition: 1,
      },
      {
        name: 'account_id',
        type: 'TEXT',
        notNull: true,
        primaryKeyPosition: 2,
      },
      {
        name: 'effective',
        type: 'INTEGER',
        notNull: true,
        primaryKeyPosition: 0,
      },
      {
        name: 'role',
        type: 'TEXT',
        notNull: true,
        primaryKeyPosition: 0,
      },
    ],
    indexes: [
      {
        name: 'sqlite_autoindex_membership_1',
        unique: true,
        partial: false,
        columns: ['organization_id', 'account_id'],
        definition: null,
      },
    ],
    foreignKeys: [],
  },
  {
    name: 'invitation',
    definition:
      'CREATE TABLE "invitation" ("invitation_id" text not null, "issuer_organization" text not null, "invited_account" text not null, "role" text not null, "issued_at" bigint not null, "expires_at" bigint not null, "settled" text, constraint "invitation_pkey" primary key ("invitation_id"))',
    columns: [
      {
        name: 'invitation_id',
        type: 'TEXT',
        notNull: true,
        primaryKeyPosition: 1,
      },
      {
        name: 'issuer_organization',
        type: 'TEXT',
        notNull: true,
        primaryKeyPosition: 0,
      },
      {
        name: 'invited_account',
        type: 'TEXT',
        notNull: true,
        primaryKeyPosition: 0,
      },
      {
        name: 'role',
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
        name: 'expires_at',
        type: 'bigint',
        notNull: true,
        primaryKeyPosition: 0,
      },
      {
        name: 'settled',
        type: 'TEXT',
        notNull: false,
        primaryKeyPosition: 0,
      },
    ],
    indexes: [
      {
        name: 'sqlite_autoindex_invitation_1',
        unique: true,
        partial: false,
        columns: ['invitation_id'],
        definition: null,
      },
    ],
    foreignKeys: [],
  },
  {
    name: 'affiliation_request',
    definition:
      'CREATE TABLE "affiliation_request" ("affiliation_request_id" text not null, "initiator" text not null, "recipient" text not null, "direction" text not null, "issued_at" bigint not null, "expires_at" bigint not null, "settled" text, constraint "affiliation_request_pkey" primary key ("affiliation_request_id"))',
    columns: [
      {
        name: 'affiliation_request_id',
        type: 'TEXT',
        notNull: true,
        primaryKeyPosition: 1,
      },
      {
        name: 'initiator',
        type: 'TEXT',
        notNull: true,
        primaryKeyPosition: 0,
      },
      {
        name: 'recipient',
        type: 'TEXT',
        notNull: true,
        primaryKeyPosition: 0,
      },
      {
        name: 'direction',
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
        name: 'expires_at',
        type: 'bigint',
        notNull: true,
        primaryKeyPosition: 0,
      },
      {
        name: 'settled',
        type: 'TEXT',
        notNull: false,
        primaryKeyPosition: 0,
      },
    ],
    indexes: [
      {
        name: 'sqlite_autoindex_affiliation_request_1',
        unique: true,
        partial: false,
        columns: ['affiliation_request_id'],
        definition: null,
      },
    ],
    foreignKeys: [],
  },
  {
    name: 'current_tenant_selection',
    definition:
      'CREATE TABLE "current_tenant_selection" ("login_state_id" text not null, "organization_id" text not null, "account_id" text not null, constraint "current_tenant_selection_pkey" primary key ("login_state_id"))',
    columns: [
      {
        name: 'login_state_id',
        type: 'TEXT',
        notNull: true,
        primaryKeyPosition: 1,
      },
      {
        name: 'organization_id',
        type: 'TEXT',
        notNull: true,
        primaryKeyPosition: 0,
      },
      {
        name: 'account_id',
        type: 'TEXT',
        notNull: true,
        primaryKeyPosition: 0,
      },
    ],
    indexes: [
      {
        name: 'sqlite_autoindex_current_tenant_selection_1',
        unique: true,
        partial: false,
        columns: ['login_state_id'],
        definition: null,
      },
    ],
    foreignKeys: [],
  },
  {
    name: 'team_creation_key',
    definition:
      'CREATE TABLE "team_creation_key" ("creator_account" text not null, "creation_key" text not null, "organization_id" text not null, "registered_at" bigint not null, constraint "team_creation_key_pkey" primary key ("creator_account", "creation_key"))',
    columns: [
      {
        name: 'creator_account',
        type: 'TEXT',
        notNull: true,
        primaryKeyPosition: 1,
      },
      {
        name: 'creation_key',
        type: 'TEXT',
        notNull: true,
        primaryKeyPosition: 2,
      },
      {
        name: 'organization_id',
        type: 'TEXT',
        notNull: true,
        primaryKeyPosition: 0,
      },
      {
        name: 'registered_at',
        type: 'bigint',
        notNull: true,
        primaryKeyPosition: 0,
      },
    ],
    indexes: [
      {
        name: 'sqlite_autoindex_team_creation_key_1',
        unique: true,
        partial: false,
        columns: ['creator_account', 'creation_key'],
        definition: null,
      },
    ],
    foreignKeys: [],
  },
]
