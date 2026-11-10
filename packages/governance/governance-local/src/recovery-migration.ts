import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { GOVERNANCE_OWNER } from './migration.ts'

export const GOVERNANCE_RECOVERY_MIGRATION = {
  owner: GOVERNANCE_OWNER,
  id: 'governance-recovery-index-1',
}
export default {
  ...GOVERNANCE_RECOVERY_MIGRATION,
  up(port) {
    port.execute(
      `CREATE INDEX gc_operation_recovery
       ON gc_operation(scope_key, command_owner, principal_ref, operation_id)
       WHERE state IN ('accepted','submitted')
          OR (held_json IS NOT NULL AND json_extract(held_json, '$.kind') IS NOT 'settled')`,
      [],
    )
  },
  verify(port) {
    port.execute(
      `SELECT operation_id FROM gc_operation INDEXED BY gc_operation_recovery
       WHERE state IN ('accepted','submitted')
          OR (held_json IS NOT NULL AND json_extract(held_json, '$.kind') IS NOT 'settled')
       LIMIT 0`,
      [],
    )
    return { kind: 'verified' }
  },
} satisfies MigrationModule
