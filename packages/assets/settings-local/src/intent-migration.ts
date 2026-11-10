import type { MigrationModule } from '@omne-harness/sql-contract/worker'

export const SETTINGS_INTENT_MIGRATION = {
  owner: 'settings.persistence',
  id: 'settings-intent-attempt-1',
}
export const SETTINGS_INTENT_TABLES = ['st_governance_intent', 'st_governance_attempt']

export default {
  ...SETTINGS_INTENT_MIGRATION,
  up(port) {
    port.execute(
      `CREATE TABLE st_governance_intent (
      operation_key TEXT NOT NULL PRIMARY KEY,
      principal_ref TEXT NOT NULL,
      target_key TEXT NOT NULL,
      operation_id TEXT NOT NULL,
      command_digest TEXT NOT NULL,
      command_json TEXT NOT NULL,
      command_kind TEXT NOT NULL CHECK (command_kind IN ('change', 'rebase')),
      intent_kind TEXT NOT NULL CHECK (intent_kind IN ('target-change', 'source-update')),
      source_key TEXT,
      state TEXT NOT NULL CHECK (state IN ('open', 'committed', 'aborted')),
      next_attempt INTEGER NOT NULL CHECK (next_attempt BETWEEN 1 AND 65),
      result_json TEXT,
      abort_reason TEXT CHECK (abort_reason IN ('cancelled', 'sealed', 'forbidden', 'revision_conflict', 'definition_changed', 'locked', 'incompatible')),
      UNIQUE (principal_ref, target_key, operation_id),
      CHECK ((intent_kind = 'target-change' AND source_key IS NULL)
        OR (intent_kind = 'source-update' AND source_key IS NOT NULL)),
      CHECK ((state = 'committed' AND result_json IS NOT NULL)
        OR (state <> 'committed' AND result_json IS NULL)),
      CHECK ((state = 'aborted' AND abort_reason IS NOT NULL)
        OR (state <> 'aborted' AND abort_reason IS NULL))
    ) WITHOUT ROWID, STRICT`,
      [],
    )
    port.execute(
      "CREATE INDEX st_governance_pending ON st_governance_intent(operation_key) WHERE state = 'open'",
      [],
    )
    port.execute(
      `CREATE TABLE st_governance_attempt (
      operation_key TEXT NOT NULL,
      attempt INTEGER NOT NULL CHECK (attempt BETWEEN 1 AND 64),
      attempt_id TEXT NOT NULL UNIQUE,
      basis_digest TEXT NOT NULL,
      basis_json TEXT NOT NULL,
      sql_identity_json TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('prepared', 'submitted', 'committed', 'aborted')),
      PRIMARY KEY (operation_key, attempt),
      FOREIGN KEY (operation_key) REFERENCES st_governance_intent(operation_key)
    ) WITHOUT ROWID, STRICT`,
      [],
    )
    port.execute(
      "CREATE UNIQUE INDEX st_governance_one_live_attempt ON st_governance_attempt(operation_key) WHERE state IN ('prepared', 'submitted')",
      [],
    )
  },
  verify(port) {
    port.execute(
      'SELECT operation_key, principal_ref, target_key, operation_id, command_digest, command_json, command_kind, intent_kind, source_key, state, next_attempt, result_json, abort_reason FROM st_governance_intent LIMIT 0',
      [],
    )
    port.execute(
      'SELECT operation_key, attempt, attempt_id, basis_digest, basis_json, sql_identity_json, state FROM st_governance_attempt LIMIT 0',
      [],
    )
    return { kind: 'verified' }
  },
} satisfies MigrationModule
