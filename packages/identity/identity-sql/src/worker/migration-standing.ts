import type { MigrationModule } from '@omne-harness/sql-contract/worker'

const migration: MigrationModule = {
  owner: 'identity',
  id: '003-standing',
  up(port) {
    port.execute(
      `CREATE TABLE id_standing_reservation (
      reservation_id TEXT NOT NULL PRIMARY KEY, operation_ref TEXT NOT NULL UNIQUE,
      binding TEXT NOT NULL, required TEXT NOT NULL, organization TEXT NOT NULL,
      account TEXT NOT NULL, state TEXT NOT NULL, terminal TEXT) STRICT`,
      [],
    )
    port.execute(
      `CREATE TABLE id_membership_intent (
      sequence INTEGER PRIMARY KEY, operation_id TEXT NOT NULL UNIQUE, facts TEXT NOT NULL,
      organization TEXT, account TEXT, state TEXT NOT NULL, response TEXT,
      attempt INTEGER NOT NULL, now_key TEXT) STRICT`,
      [],
    )
  },
  verify(port) {
    port.execute('SELECT 1 FROM id_standing_reservation LIMIT 1', [])
    port.execute('SELECT 1 FROM id_membership_intent LIMIT 1', [])
    return { kind: 'verified' }
  },
}
export default migration
