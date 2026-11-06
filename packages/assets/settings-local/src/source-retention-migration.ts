import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { SOURCE_RETENTION_MIGRATION } from './source-retention-schema.ts'

export default {
  ...SOURCE_RETENTION_MIGRATION,
  up(port) {
    port.execute(
      `CREATE TABLE st_source_gate (
      source_key TEXT NOT NULL PRIMARY KEY,
      source_json TEXT NOT NULL,
      pending_key TEXT,
      pending_json TEXT,
      CHECK ((pending_key IS NULL AND pending_json IS NULL)
        OR (pending_key IS NOT NULL AND pending_json IS NOT NULL))
    ) WITHOUT ROWID, STRICT`,
      [],
    )
    port.execute(
      `CREATE INDEX st_source_pending ON st_source_gate(source_key)
      WHERE pending_key IS NOT NULL`,
      [],
    )
    port.execute(
      `CREATE TABLE st_source_reservation (
      reservation_key TEXT NOT NULL PRIMARY KEY,
      source_key TEXT NOT NULL,
      request_json TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('held', 'settled')),
      outcome TEXT CHECK (outcome IN ('committed', 'aborted')),
      FOREIGN KEY (source_key) REFERENCES st_source_gate(source_key),
      CHECK ((state = 'held' AND outcome IS NULL)
        OR (state = 'settled' AND outcome IS NOT NULL))
    ) WITHOUT ROWID, STRICT`,
      [],
    )
    port.execute(
      `CREATE INDEX st_source_held ON st_source_reservation(source_key, reservation_key)
      WHERE state = 'held'`,
      [],
    )
    port.execute(
      `CREATE INDEX st_source_recovery ON st_source_reservation(reservation_key)
      WHERE state = 'held'`,
      [],
    )
  },
  verify(port) {
    port.execute(
      'SELECT source_key, source_json, pending_key, pending_json FROM st_source_gate LIMIT 0',
      [],
    )
    port.execute(
      'SELECT reservation_key, source_key, request_json, snapshot_json, state, outcome FROM st_source_reservation LIMIT 0',
      [],
    )
    return { kind: 'verified' }
  },
} satisfies MigrationModule
