import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { GOVERNANCE_OWNER } from './migration.ts'
import { GOVERNANCE_CUSTODY_TABLES } from './source-custody-migration.ts'

export const GOVERNANCE_EXTERNAL_WRITE_MIGRATION = {
  owner: GOVERNANCE_OWNER,
  id: 'governance-external-write-1',
}
const tables = [
  {
    name: 'gc_operation',
    backup: 'gc_external_operation_upgrade',
    columns:
      'scope_key,command_owner,principal_ref,operation_id,request_digest,request_json,accepted_epoch,sql_identity_json,execution_json,held_json,state,result_json',
    create: `CREATE TABLE gc_operation (
    scope_key TEXT NOT NULL,
    command_owner TEXT NOT NULL CHECK (command_owner IN ('contribute','withdraw','adopt','internal.bootstrap','internal.close','internal.capture','internal.external-write')),
    principal_ref TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    request_digest TEXT NOT NULL,
    request_json TEXT NOT NULL,
    accepted_epoch TEXT NOT NULL,
    sql_identity_json TEXT NOT NULL,
    execution_json TEXT,
    held_json TEXT,
    state TEXT NOT NULL CHECK (state IN ('accepted','submitted','committed','aborted')),
    result_json TEXT,
    PRIMARY KEY (scope_key, command_owner, principal_ref, operation_id),
    FOREIGN KEY (scope_key) REFERENCES gc_scope(scope_key),
    CHECK ((state IN ('committed','aborted') AND result_json IS NOT NULL)
      OR (state IN ('accepted','submitted') AND result_json IS NULL)),
    CHECK (state NOT IN ('submitted','committed') OR execution_json IS NOT NULL),
    CHECK (state <> 'accepted' OR execution_json IS NULL)
  ) WITHOUT ROWID, STRICT`,
  },
  {
    name: 'gc_sql_stage',
    backup: 'gc_external_stage_upgrade',
    columns: 'scope_key,command_owner,principal_ref,operation_id,stage,envelope_json,input_digest',
    create: `CREATE TABLE gc_sql_stage (
    scope_key TEXT NOT NULL,
    command_owner TEXT NOT NULL,
    principal_ref TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    stage TEXT NOT NULL CHECK (stage IN ('standing-prepare','standing-held','submit','apply','seal','standing-seal','standing-settled','source-held','source-settled')),
    envelope_json TEXT NOT NULL CHECK (length(CAST(envelope_json AS BLOB)) <= 4194304),
    input_digest TEXT NOT NULL,
    PRIMARY KEY (scope_key,command_owner,principal_ref,operation_id,stage),
    FOREIGN KEY (scope_key,command_owner,principal_ref,operation_id)
      REFERENCES gc_operation(scope_key,command_owner,principal_ref,operation_id)
  ) WITHOUT ROWID, STRICT`,
  },
  {
    name: 'gc_permission_source',
    backup: 'gc_external_source_upgrade',
    columns: 'scope_key,command_owner,principal_ref,operation_id,receipt_json',
    create: `CREATE TABLE gc_permission_source (
      scope_key TEXT NOT NULL,
      command_owner TEXT NOT NULL CHECK (command_owner IN ('internal.capture','internal.external-write')),
      principal_ref TEXT NOT NULL,
      operation_id TEXT NOT NULL,
      receipt_json TEXT,
      PRIMARY KEY (scope_key,command_owner,principal_ref,operation_id),
      FOREIGN KEY (scope_key,command_owner,principal_ref,operation_id)
        REFERENCES gc_operation(scope_key,command_owner,principal_ref,operation_id)
    ) WITHOUT ROWID, STRICT`,
  },
] as const
const indexes = [
  `CREATE INDEX gc_operation_pending ON gc_operation(scope_key, command_owner, principal_ref, operation_id)
    WHERE state IN ('accepted','submitted')`,
  `CREATE INDEX gc_operation_recovery
       ON gc_operation(scope_key, command_owner, principal_ref, operation_id)
       WHERE state IN ('accepted','submitted')
          OR (held_json IS NOT NULL AND json_extract(held_json, '$.kind') IS NOT 'settled')`,
  `CREATE INDEX gc_permission_source_pending
      ON gc_permission_source(scope_key,command_owner,principal_ref,operation_id)
      WHERE receipt_json IS NULL OR json_extract(receipt_json, '$.kind') IS NOT 'settled'`,
]
export const GOVERNANCE_EXTERNAL_WRITE_TABLES = [
  ...GOVERNANCE_CUSTODY_TABLES,
  ...tables.map(table => table.backup),
]

export default {
  ...GOVERNANCE_EXTERNAL_WRITE_MIGRATION,
  up(port) {
    // Backups have no foreign keys, so children can be removed before their parent.
    for (const table of tables)
      port.execute(`CREATE TABLE ${table.backup} AS SELECT ${table.columns} FROM ${table.name}`, [])
    for (const table of [...tables].reverse()) port.execute(`DROP TABLE ${table.name}`, [])
    for (const table of tables) {
      port.execute(table.create, [])
      port.execute(
        `INSERT INTO ${table.name} (${table.columns}) SELECT ${table.columns} FROM ${table.backup}`,
        [],
      )
    }
    for (const index of indexes) port.execute(index, [])
    for (const table of tables) port.execute(`DROP TABLE ${table.backup}`, [])
  },
  verify(port) {
    for (const table of tables)
      port.execute(`SELECT ${table.columns} FROM ${table.name} LIMIT 0`, [])
    port.execute(
      "SELECT operation_id FROM gc_operation INDEXED BY gc_operation_pending WHERE state IN ('accepted','submitted') LIMIT 0",
      [],
    )
    port.execute(
      "SELECT operation_id FROM gc_operation INDEXED BY gc_operation_recovery WHERE state IN ('accepted','submitted') OR (held_json IS NOT NULL AND json_extract(held_json, '$.kind') IS NOT 'settled') LIMIT 0",
      [],
    )
    port.execute(
      "SELECT receipt_json FROM gc_permission_source INDEXED BY gc_permission_source_pending WHERE receipt_json IS NULL OR json_extract(receipt_json, '$.kind') IS NOT 'settled' LIMIT 0",
      [],
    )
    return { kind: 'verified' }
  },
} satisfies MigrationModule
