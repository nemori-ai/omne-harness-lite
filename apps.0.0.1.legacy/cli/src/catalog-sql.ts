import { randomUUID } from 'node:crypto'
import { narrow, type AtomicStorage, type ReadTx } from '@omne-harness-lite/storage'
import { CliCatalogFailure, type CatalogPolicy, type CatalogSnapshot } from './catalog-types.ts'
import { decode } from './catalog-values.ts'
import { checkedTenantBinding } from './state-layout-values.ts'

export interface CatalogDatabase {
  cli_catalog_meta: {
    singleton: number
    format_version: number
    store_id: string
    revision: number
    operation_id: string | null
    selected_json: string | null
  }
  cli_catalog_centers: { center_id: string; name: string; profile_json: string }
  cli_catalog_creations: {
    request_key: string
    request_json: string
    status: string
    result_json: string | null
  }
}
const catalogColumns = {
  cli_catalog_meta: [
    'singleton',
    'format_version',
    'store_id',
    'revision',
    'operation_id',
    'selected_json',
  ],
  cli_catalog_centers: ['center_id', 'name', 'profile_json'],
  cli_catalog_creations: ['request_key', 'request_json', 'status', 'result_json'],
}
/** The emptiness and validation belong to one snapshot during competing startup. */
export async function catalogReady(
  storage: AtomicStorage,
  policy: CatalogPolicy,
): Promise<boolean> {
  return storage.read(async tx => {
    const tables = await tx.db.introspection.getTables()
    if (tables.length === 0) return false
    if (tables.length !== Object.keys(catalogColumns).length)
      throw new CliCatalogFailure('invalid-record')
    for (const [name, columns] of Object.entries(catalogColumns)) {
      const table = tables.find(table => table.name === name)
      if (
        table === undefined ||
        JSON.stringify(table.columns.map(column => column.name)) !== JSON.stringify(columns)
      )
        throw new CliCatalogFailure('invalid-record')
    }
    await readCatalogSnapshot(tx, policy)
    return true
  })
}
export async function initializeCatalog(storage: AtomicStorage): Promise<void> {
  await storage.atomic(unit =>
    unit.mutate(async tx => {
      const db = narrow<CatalogDatabase>(tx)
      await db.schema
        .createTable('cli_catalog_meta')
        .addColumn('singleton', 'integer', c => c.primaryKey())
        .addColumn('format_version', 'integer', c => c.notNull())
        .addColumn('store_id', 'text', c => c.notNull())
        .addColumn('revision', 'integer', c => c.notNull())
        .addColumn('operation_id', 'text')
        .addColumn('selected_json', 'text')
        .execute()
      await db.schema
        .createTable('cli_catalog_centers')
        .addColumn('center_id', 'text', c => c.primaryKey())
        .addColumn('name', 'text', c => c.notNull().unique())
        .addColumn('profile_json', 'text', c => c.notNull())
        .execute()
      await db.schema
        .createTable('cli_catalog_creations')
        .addColumn('request_key', 'text', c => c.primaryKey())
        .addColumn('request_json', 'text', c => c.notNull())
        .addColumn('status', 'text', c => c.notNull())
        .addColumn('result_json', 'text')
        .execute()
      await db
        .insertInto('cli_catalog_meta')
        .values({
          singleton: 1,
          format_version: 1,
          store_id: randomUUID(),
          revision: 0,
          operation_id: null,
          selected_json: null,
        })
        .execute()
    }),
  )
}
export async function readCatalogSnapshot(
  tx: ReadTx,
  policy: CatalogPolicy,
): Promise<CatalogSnapshot> {
  const rows = await narrow<CatalogDatabase>(tx)
    .selectFrom('cli_catalog_meta')
    .selectAll()
    .limit(2)
    .execute()
  const row = rows[0]
  if (rows.length !== 1 || row === undefined || row.singleton !== 1)
    throw new CliCatalogFailure('invalid-record')
  if (row.format_version !== 1) throw new CliCatalogFailure('unsupported-format')
  checkSelectionPosition(row)
  if (row.operation_id !== null && typeof row.operation_id !== 'string')
    throw new CliCatalogFailure('invalid-record')
  return {
    storeId: row.store_id,
    revision: row.revision,
    operationId: row.operation_id,
    selected:
      row.selected_json === null ? null : decode(row.selected_json, checkedTenantBinding, policy),
  }
}

function checkSelectionPosition(row: CatalogDatabase['cli_catalog_meta']): void {
  if (
    typeof row.store_id !== 'string' ||
    row.store_id.length === 0 ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 0
  )
    throw new CliCatalogFailure('invalid-record')
}
