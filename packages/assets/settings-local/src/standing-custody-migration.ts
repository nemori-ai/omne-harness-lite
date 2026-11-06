import type { MigrationModule } from '@omne-harness/sql-contract/worker'

export const SETTINGS_STANDING_CUSTODY_MIGRATION = {
  owner: 'settings.persistence',
  id: 'settings-standing-custody-1',
}
export const SETTINGS_STANDING_CUSTODY_TABLE = 'st_intent_standing'

export default {
  ...SETTINGS_STANDING_CUSTODY_MIGRATION,
  up(port) {
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
  },
  verify(port) {
    port.execute(
      'SELECT attempt_id, request_json, reservation_id, state, receipt_json, outcome FROM st_intent_standing LIMIT 0',
      [],
    )
    return { kind: 'verified' }
  },
} satisfies MigrationModule
