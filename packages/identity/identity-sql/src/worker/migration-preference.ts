import type { MigrationModule } from '@omne-harness/sql-contract/worker'

const migration: MigrationModule = {
  owner: 'identity',
  id: '004-preference',
  up(port) {
    port.execute(
      `CREATE TABLE id_account_preference (
      account TEXT NOT NULL, name TEXT NOT NULL, value TEXT, revision INTEGER NOT NULL,
      PRIMARY KEY (account, name)) STRICT`,
      [],
    )
  },
  verify(port) {
    port.execute('SELECT 1 FROM id_account_preference LIMIT 1', [])
    return { kind: 'verified' }
  },
}
export default migration
