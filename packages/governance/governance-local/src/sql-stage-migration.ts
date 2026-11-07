import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { GOVERNANCE_OWNER, GOVERNANCE_TABLES } from './migration.ts'

export const GOVERNANCE_STAGE_MIGRATION = { owner: GOVERNANCE_OWNER, id: 'governance-sql-stage-1' }
export const GOVERNANCE_SQL_TABLES = [...GOVERNANCE_TABLES, 'gc_sql_stage']
export default {
  ...GOVERNANCE_STAGE_MIGRATION,
  up(port) {
    port.execute(
      `CREATE TABLE gc_sql_stage (
      scope_key TEXT NOT NULL,
      command_owner TEXT NOT NULL,
      principal_ref TEXT NOT NULL,
      operation_id TEXT NOT NULL,
      stage TEXT NOT NULL CHECK (stage IN ('standing-prepare','standing-held','submit','apply','seal','standing-seal','standing-settled')),
      envelope_json TEXT NOT NULL CHECK (length(CAST(envelope_json AS BLOB)) <= 4194304),
      input_digest TEXT NOT NULL,
      PRIMARY KEY (scope_key,command_owner,principal_ref,operation_id,stage),
      FOREIGN KEY (scope_key,command_owner,principal_ref,operation_id)
        REFERENCES gc_operation(scope_key,command_owner,principal_ref,operation_id)
    ) WITHOUT ROWID, STRICT`,
      [],
    )
  },
  verify(port) {
    port.execute(
      'SELECT scope_key,command_owner,principal_ref,operation_id,stage,envelope_json,input_digest FROM gc_sql_stage LIMIT 0',
      [],
    )
    return { kind: 'verified' }
  },
} satisfies MigrationModule
