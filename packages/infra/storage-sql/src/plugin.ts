// storage-sql 插件：config 校验 → 打开句柄 + 启动 ping → 跑迁移 → provide('storage')；撤除：关准入 → 等在途 → 关句柄。
import type { Context } from '@deepseek-ai/cordis'
import { Migrator, type MigrationProvider } from 'kysely/migration'
import { z } from 'zod'
import { definePlugin } from '@omne-harness-lite/kernel-basis'
import { SqlStorage, ping, type DialectHandles } from './provider.ts'
import { openSqlite } from './sqlite/index.ts'
import { openPostgres } from './postgres/index.ts'

export const STORAGE_SERVICE = 'storage' as const

const migrationProvider = z.custom<MigrationProvider>(
  value =>
    typeof value === 'object' &&
    value !== null &&
    typeof (value as MigrationProvider).getMigrations === 'function',
  'migrations must be a Kysely MigrationProvider',
)

export const StorageSqlConfig = z.discriminatedUnion('dialect', [
  z.object({
    dialect: z.literal('sqlite'),
    file: z
      .string()
      .min(1)
      .refine(
        f => f !== ':memory:' && !f.startsWith('file::memory:'),
        'in-memory sqlite is not allowed (D-026)',
      ),
    migrations: migrationProvider.optional(),
  }),
  z.object({
    dialect: z.literal('postgres'),
    connectionString: z.string().min(1),
    migrations: migrationProvider.optional(),
  }),
])
export type StorageSqlConfig = z.infer<typeof StorageSqlConfig>

export async function openStorage(config: StorageSqlConfig): Promise<SqlStorage> {
  const handles: DialectHandles =
    config.dialect === 'sqlite'
      ? openSqlite({ file: config.file })
      : openPostgres({ connectionString: config.connectionString })
  try {
    await ping(handles.writeDb)
    await ping(handles.readDb)
    if (config.migrations !== undefined) {
      const migrator = new Migrator({ db: handles.writeDb, provider: config.migrations })
      const { error } = await migrator.migrateToLatest()
      if (error !== undefined) throw error
    }
  } catch (error) {
    await handles.writeDb.destroy().catch(() => undefined)
    await handles.readDb.destroy().catch(() => undefined)
    throw error
  }
  return new SqlStorage(handles)
}

export const storageSqlPlugin = definePlugin<StorageSqlConfig>({
  name: 'storage-sql',
  Config: StorageSqlConfig,
  async apply(ctx: Context, config) {
    const storage = await openStorage(config)
    try {
      // 启动期（await 期间）fiber 已被 dispose 时 effect 抛 INACTIVE_EFFECT：资源没有归宿，自己关掉再抛
      ctx.effect(() => () => storage.close())
    } catch (error) {
      await storage.close()
      throw error
    }
    ctx.provide(STORAGE_SERVICE, storage)
  },
})
