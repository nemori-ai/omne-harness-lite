import type { MigrationModule } from '@omne-harness/sql-contract/worker'
export const MODEL_PROVENANCE_MIGRATION = { owner: 'session', id: '015-model-provenance' } as const
export const MODEL_PROVENANCE_TABLE = 'sl_model_provenance'
const migration: MigrationModule = {
  ...MODEL_PROVENANCE_MIGRATION,
  up(port) {
    port.execute(
      'CREATE TABLE sl_model_provenance (tenant TEXT NOT NULL, session TEXT NOT NULL, epoch TEXT NOT NULL, entry TEXT NOT NULL, provenance TEXT, PRIMARY KEY (tenant,session,epoch,entry)) STRICT, WITHOUT ROWID',
      [],
    )
  },
  verify(port) {
    return port.execute('SELECT name FROM sqlite_schema WHERE name = ?', [MODEL_PROVENANCE_TABLE])
      .rows.length === 1
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: 'model provenance index is absent' }
  },
}
export default migration
