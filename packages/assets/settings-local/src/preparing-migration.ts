import type { MigrationModule } from '@omne-harness/sql-contract/worker'

export const SETTINGS_PREPARING_MIGRATION = {
  owner: 'settings.persistence',
  id: 'settings-preparing-1',
}

export default {
  ...SETTINGS_PREPARING_MIGRATION,
  up(port) {
    const roots = port.execute('SELECT operation_key FROM st_governance_intent LIMIT 1', []).rows
    const attempts = port.execute('SELECT attempt_id FROM st_governance_attempt LIMIT 1', []).rows
    if (roots.length || attempts.length)
      throw new Error('Settings intent bootstrap requires empty unpublished intent relations')
    port.execute('DROP TABLE st_governance_attempt', [])
    port.execute(
      `CREATE TABLE st_governance_attempt (
        operation_key TEXT NOT NULL,
        attempt INTEGER NOT NULL CHECK (attempt BETWEEN 1 AND 64),
        attempt_id TEXT NOT NULL UNIQUE,
        plan_json TEXT NOT NULL,
        basis_digest TEXT,
        basis_json TEXT,
        sql_identity_json TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('preparing', 'prepared', 'submitted', 'committed', 'aborted')),
        PRIMARY KEY (operation_key, attempt),
        FOREIGN KEY (operation_key) REFERENCES st_governance_intent(operation_key),
        CHECK ((basis_digest IS NULL) = (basis_json IS NULL)),
        CHECK (state <> 'preparing' OR basis_json IS NULL),
        CHECK (state NOT IN ('prepared', 'submitted', 'committed') OR basis_json IS NOT NULL)
      ) WITHOUT ROWID, STRICT`,
      [],
    )
    port.execute(
      "CREATE UNIQUE INDEX st_governance_one_live_attempt ON st_governance_attempt(operation_key) WHERE state IN ('preparing', 'prepared', 'submitted')",
      [],
    )
  },
  verify(port) {
    port.execute('SELECT plan_json, basis_json FROM st_governance_attempt LIMIT 0', [])
    return { kind: 'verified' }
  },
} satisfies MigrationModule
