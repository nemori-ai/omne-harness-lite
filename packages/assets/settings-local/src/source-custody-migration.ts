import type { MigrationModule } from '@omne-harness/sql-contract/worker'
export const SETTINGS_SOURCE_CUSTODY_MIGRATION = {
  owner: 'settings.persistence',
  id: 'settings-source-custody-1',
}
export const SETTINGS_SOURCE_CUSTODY_TABLES = ['st_intent_source_plan', 'st_intent_source']
export default {
  ...SETTINGS_SOURCE_CUSTODY_MIGRATION,
  up(port) {
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
