// Provider tables of one domain file (SPEC 5.1, 5.3) and the schema check of the grouping gate
// (SPEC 4.5, layer "schema").
import type { DatabaseSync } from 'node:sqlite'
import type { ParticipantDescriptor } from '@omne-harness/sql-contract'

export const PROVIDER_SCHEMA = `
create table _sql_domain(
  singleton integer primary key check (singleton = 1),
  transaction_domain text not null,
  scope text not null
);
create table _sql_generation(
  singleton integer primary key check (singleton = 1),
  generation integer not null
);
create table _sql_migration(
  owner text not null,
  id text not null,
  checksum text not null,
  primary key (owner, id)
);
create table _sql_registration(
  combination_version text primary key,
  manifest_digest text not null,
  participants text not null
);
create table _sql_receipt(
  operation text not null,
  operation_key text not null,
  kind text not null,
  input_digest text not null,
  receipt text not null,
  primary key (operation, operation_key)
);
`

const DEFERRED_FK = /deferrable\s+initially\s+deferred/i
const TIME_DEFAULT = /current_(time|date|timestamp)/i

/**
 * Participants whose tables break the grouping gate: a deferred foreign key, or a default value
 * that reads the clock. They are handled as singletons in this provider generation. Temporary
 * tables are not in `sqlite_schema`, and the participant authorizer refuses to create them.
 */
export function findSingletons(
  db: DatabaseSync,
  participants: readonly ParticipantDescriptor[],
): string[] {
  const found: string[] = []
  const select = db.prepare('select sql from sqlite_schema where tbl_name = ? and sql is not null')
  for (const participant of participants) {
    const broken = participant.ownedTables.some(table =>
      (select.all(table) as { sql: string }[]).some(
        row => DEFERRED_FK.test(row.sql) || TIME_DEFAULT.test(row.sql),
      ),
    )
    if (broken) found.push(participant.participant)
  }
  return found.sort()
}
