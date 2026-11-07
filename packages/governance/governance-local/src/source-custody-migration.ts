import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { GOVERNANCE_OWNER } from './migration.ts'
import { GOVERNANCE_SQL_TABLES } from './sql-stage-migration.ts'

export const GOVERNANCE_SOURCE_MIGRATION = {
  owner: GOVERNANCE_OWNER,
  id: 'governance-source-custody-1',
}
export const GOVERNANCE_CUSTODY_TABLES = [
  ...GOVERNANCE_SQL_TABLES,
  'gc_permission_source',
  'gc_sql_stage_upgrade',
]
const columns =
  'scope_key,command_owner,principal_ref,operation_id,stage,envelope_json,input_digest'
function stageTable(name: 'gc_sql_stage' | 'gc_sql_stage_upgrade') {
  return `CREATE TABLE ${name} (
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
  ) WITHOUT ROWID, STRICT`
}
export default {
  ...GOVERNANCE_SOURCE_MIGRATION,
  up(port) {
    port.execute(
      `CREATE TABLE gc_permission_source (
      scope_key TEXT NOT NULL,
      command_owner TEXT NOT NULL CHECK (command_owner='internal.capture'),
      principal_ref TEXT NOT NULL,
      operation_id TEXT NOT NULL,
      receipt_json TEXT,
      PRIMARY KEY (scope_key,command_owner,principal_ref,operation_id),
      FOREIGN KEY (scope_key,command_owner,principal_ref,operation_id)
        REFERENCES gc_operation(scope_key,command_owner,principal_ref,operation_id)
    ) WITHOUT ROWID, STRICT`,
      [],
    )
    port.execute(
      `CREATE INDEX gc_permission_source_pending
      ON gc_permission_source(scope_key,command_owner,principal_ref,operation_id)
      WHERE receipt_json IS NULL OR json_extract(receipt_json, '$.kind') IS NOT 'settled'`,
      [],
    )
    port.execute(stageTable('gc_sql_stage_upgrade'), [])
    port.execute(
      `INSERT INTO gc_sql_stage_upgrade (${columns}) SELECT ${columns} FROM gc_sql_stage`,
      [],
    )
    port.execute('DROP TABLE gc_sql_stage', [])
    port.execute(stageTable('gc_sql_stage'), [])
    port.execute(
      `INSERT INTO gc_sql_stage (${columns}) SELECT ${columns} FROM gc_sql_stage_upgrade`,
      [],
    )
    port.execute('DROP TABLE gc_sql_stage_upgrade', [])
  },
  verify(port) {
    port.execute(
      `SELECT receipt_json FROM gc_permission_source INDEXED BY gc_permission_source_pending
      WHERE receipt_json IS NULL OR json_extract(receipt_json, '$.kind') IS NOT 'settled' LIMIT 0`,
      [],
    )
    port.execute(`SELECT ${columns} FROM gc_sql_stage LIMIT 0`, [])
    return { kind: 'verified' }
  },
} satisfies MigrationModule
