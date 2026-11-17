import type { MigrationModule } from '@omne-harness/sql-contract/worker'

const migration: MigrationModule = {
  owner: 'context.compaction.tasks',
  id: '001-tasks',
  up(port) {
    port.execute(
      `CREATE TABLE cc_task (
      task_key TEXT PRIMARY KEY, authority TEXT NOT NULL, tenant TEXT NOT NULL,
      task TEXT NOT NULL, request_digest TEXT NOT NULL, revision TEXT NOT NULL,
      live INTEGER NOT NULL, reference TEXT NOT NULL, record TEXT NOT NULL,
      UNIQUE(authority, tenant, task)
    )`,
      [],
    )
    port.execute('CREATE INDEX cc_task_live ON cc_task(authority, live, task_key)', [])
    port.execute(
      `CREATE TABLE cc_content (
      tenant TEXT NOT NULL, digest TEXT NOT NULL, part INTEGER NOT NULL, payload TEXT NOT NULL,
      PRIMARY KEY(tenant, digest, part)
    )`,
      [],
    )
  },
  verify(port) {
    port.execute(
      'SELECT task_key, authority, tenant, task, request_digest, revision, live, reference, record FROM cc_task LIMIT 1',
      [],
    )
    port.execute('SELECT tenant, digest, part, payload FROM cc_content LIMIT 1', [])
    return { kind: 'verified' }
  },
}
export default migration
