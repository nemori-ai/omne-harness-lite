// 迁移登记的只读读取（R-U2）。登记表是 Kysely `Migrator` 自己的：表名、列与排序键取证自 kysely 0.29.6
// `dist/migration/migrator.js`——`DEFAULT_MIGRATION_TABLE = 'kysely_migration'`，列 `name`（主键）、`timestamp`（ISO 串）；
// `#getExecutedMigrations` 按 timestamp 升序、同 timestamp 按 name 的 localeCompare 排——这里照抄同一排序，读到的就是执行次序。
import { DEFAULT_MIGRATION_TABLE } from 'kysely/migration'
import type { UntypedDb } from '@omne-harness-lite/storage'

export const MIGRATION_REGISTRY_TABLE: string = DEFAULT_MIGRATION_TABLE

interface RegistryRow {
  readonly name: string
  readonly timestamp: string
}

/** 在调用方给的（只读）事务里读登记，按执行次序返回名字。表是否存在由调用方先判，这里不以「读表报错」推断「没有」。 */
export async function readMigrationRegistry(db: UntypedDb): Promise<string[]> {
  const rows = (await db
    .selectFrom(MIGRATION_REGISTRY_TABLE)
    .select(['name', 'timestamp'])
    .execute()) as RegistryRow[]
  return rows
    .toSorted((a, b) =>
      a.timestamp === b.timestamp
        ? a.name.localeCompare(b.name)
        : new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    )
    .map(row => row.name)
}
