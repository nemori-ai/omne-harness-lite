import { randomUUID } from 'node:crypto'
import { narrow, type AtomicStorage, type ReadTx } from '@omne-harness-lite/storage'
import type { LocalStateStorage } from '@omne-harness-lite/client-local-state'
import type { Row, PhysicalReading, StatePersistence } from './state-data.ts'
interface Database {
  client_local_state: Row
  sqlite_master: { name: string; type: string }
}
export async function initialize(storage: AtomicStorage): Promise<void> {
  await storage.atomic(unit =>
    unit.mutate(async tx => {
      const db = narrow<Database>(tx)
      await db.schema
        .createTable('client_local_state')
        .addColumn('singleton', 'integer', col => col.primaryKey())
        .addColumn('format_version', 'integer', col => col.notNull())
        .addColumn('store_id', 'text', col => col.notNull())
        .addColumn('revision', 'integer', col => col.notNull())
        .addColumn('operation_id', 'text')
        .addColumn('value_json', 'text', col => col.notNull())
        .execute()
      await db
        .insertInto('client_local_state')
        .values({
          singleton: 1,
          format_version: 1,
          store_id: randomUUID(),
          revision: 0,
          operation_id: null,
          value_json: 'null',
        })
        .execute()
    }),
  )
}

async function inspect(tx: ReadTx): Promise<PhysicalReading> {
  const db = narrow<Database>(tx)
  const objects = await db
    .selectFrom('sqlite_master')
    .select(['name', 'type'])
    .where('name', 'not like', 'sqlite_%')
    .execute()
  if (
    objects.length !== 1 ||
    objects[0]?.name !== 'client_local_state' ||
    objects[0].type !== 'table'
  )
    return { kind: 'invalid-layout', emptyCatalog: objects.length === 0 }
  // selectAll avoids converting a discoverably damaged layout into a missing-column defect.
  const rows = await db.selectFrom('client_local_state').selectAll().execute()
  return { kind: 'rows', rows }
}
export function createStatePersistence(storage: LocalStateStorage): StatePersistence {
  return {
    read: work => storage.read(tx => work({ inspect: () => inspect(tx) })),
    atomic: work =>
      storage.atomic(unit =>
        unit.mutate(tx =>
          work({
            inspect: () => inspect(tx),
            replace: async row => {
              await narrow<Database>(tx)
                .updateTable('client_local_state')
                .set(row)
                .where('singleton', '=', 1)
                .execute()
            },
          }),
        ),
      ),
    close: () => storage.close(),
  }
}
