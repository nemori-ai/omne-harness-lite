import type { MigrationModule } from '@omne-harness/sql-contract/worker'

export const SETTINGS_PREPARATION_MIGRATION = {
  owner: 'settings.persistence',
  id: 'settings-preparation-1',
}
export const SETTINGS_INTENT_TABLES = ['st_governance_intent', 'st_governance_attempt']
export const SETTINGS_STANDING_CUSTODY_TABLE = 'st_intent_standing'
export const SETTINGS_SOURCE_CUSTODY_TABLES = ['st_intent_source_plan', 'st_intent_source']

/** The relations of a prepared operation: its root, its attempts and the custody of each attempt. */
export default {
  ...SETTINGS_PREPARATION_MIGRATION,
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
    port.execute(
      `CREATE TABLE st_intent_standing (
      attempt_id TEXT NOT NULL PRIMARY KEY,
      request_json TEXT NOT NULL,
      reservation_id TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL CHECK (state IN ('planned', 'requested', 'held', 'settled')),
      receipt_json TEXT,
      outcome TEXT CHECK (outcome IN ('committed', 'aborted')),
      FOREIGN KEY (attempt_id) REFERENCES st_governance_attempt(attempt_id),
      CHECK ((state IN ('held', 'settled') AND receipt_json IS NOT NULL)
        OR (state IN ('planned', 'requested') AND receipt_json IS NULL)),
      CHECK ((state = 'settled' AND outcome IS NOT NULL)
        OR (state <> 'settled' AND outcome IS NULL))
    ) WITHOUT ROWID, STRICT`,
      [],
    )
    port.execute(
      `CREATE TABLE st_intent_source_plan (
      attempt_id TEXT NOT NULL PRIMARY KEY,
      request_count INTEGER NOT NULL CHECK (request_count BETWEEN 0 AND 1024),
      request_digest TEXT NOT NULL,
      FOREIGN KEY (attempt_id) REFERENCES st_governance_attempt(attempt_id)
    ) WITHOUT ROWID, STRICT`,
      [],
    )
    port.execute(
      `CREATE TABLE st_intent_source (
      attempt_id TEXT NOT NULL,
      source_key TEXT NOT NULL,
      request_json TEXT NOT NULL,
      reservation_id TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL CHECK (state IN ('planned', 'requested', 'held', 'settled')),
      receipt_json TEXT,
      outcome TEXT CHECK (outcome IN ('committed', 'aborted')),
      PRIMARY KEY (attempt_id, source_key),
      FOREIGN KEY (attempt_id) REFERENCES st_intent_source_plan(attempt_id),
      CHECK ((state IN ('held', 'settled') AND receipt_json IS NOT NULL)
        OR (state IN ('planned', 'requested') AND receipt_json IS NULL)),
      CHECK ((state = 'settled' AND outcome IS NOT NULL)
        OR (state <> 'settled' AND outcome IS NULL))
    ) WITHOUT ROWID, STRICT`,
      [],
    )
  },
  verify(port) {
    port.execute(
      'SELECT operation_key, principal_ref, target_key, operation_id, command_digest, command_json, command_kind, intent_kind, source_key, state, next_attempt, result_json, abort_reason FROM st_governance_intent LIMIT 0',
      [],
    )
    port.execute(
      'SELECT operation_key, attempt, attempt_id, plan_json, basis_digest, basis_json, sql_identity_json, state FROM st_governance_attempt LIMIT 0',
      [],
    )
    port.execute(
      'SELECT attempt_id, request_json, reservation_id, state, receipt_json, outcome FROM st_intent_standing LIMIT 0',
      [],
    )
    port.execute(
      'SELECT attempt_id, request_count, request_digest FROM st_intent_source_plan LIMIT 0',
      [],
    )
    port.execute(
      'SELECT attempt_id, source_key, request_json, reservation_id, state, receipt_json, outcome FROM st_intent_source LIMIT 0',
      [],
    )
    return { kind: 'verified' }
  },
} satisfies MigrationModule
