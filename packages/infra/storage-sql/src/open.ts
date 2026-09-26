// 打开一个存储实例：不开守卫 ⇒ 打开 → ping → 迁移；开了守卫 ⇒ 属主路径 ①～⑧（upgrade/owner.ts）。
import { Migrator } from 'kysely/migration'
import { z } from 'zod'
import { StorageSqlConfig } from './config.ts'
import { SqlStorage, ping, type DialectHandles } from './provider.ts'
import { openSqlite } from './sqlite/index.ts'
import { SqliteOwnerSite } from './sqlite/owner.ts'
import { assertProductionStoragePath } from './sqlite/protection.ts'
import { openPostgres } from './postgres/index.ts'
import { PostgresOwnerSite } from './postgres/owner.ts'
import { openOwnedStorage, type StorageSqlLogger, type UpgradeHooks } from './upgrade/owner.ts'

export interface OpenStorageOptions {
  /** 恢复时的 warn 等诊断记录；插件传 `ctx.logger`。 */
  readonly logger?: StorageSqlLogger
}

function openHandles(config: StorageSqlConfig): DialectHandles {
  return config.dialect === 'sqlite'
    ? openSqlite({ file: config.file, synchronous: config.synchronous ?? 'normal' })
    : openPostgres({ connectionString: config.connectionString })
}

/**
 * 打开一个存储实例（插件体与测试夹具共用）。config 在这里再核一遍，直接调用者同样受「带迁移必须显式给 `upgrade`」约束。
 * 失败即抛出：config 错误、打开或 ping 失败、迁移失败，以及属主路径各阶段的 `StorageStartupFailure`。
 */
export function openStorage(
  config: StorageSqlConfig,
  options: OpenStorageOptions = {},
): Promise<SqlStorage> {
  return openStorageWithHooks(config, options, {})
}

/** 包内测试用：在属主路径的各个时点截住。 */
export async function openStorageWithHooks(
  config: StorageSqlConfig,
  options: OpenStorageOptions,
  hooks: UpgradeHooks,
): Promise<SqlStorage> {
  const parsed = StorageSqlConfig.safeParse(config)
  if (!parsed.success)
    throw new Error(`invalid storage-sql config: ${z.prettifyError(parsed.error)}`)
  const valid = parsed.data
  if (valid.dialect === 'sqlite') assertProductionStoragePath(valid.file)
  if (valid.migrations !== undefined && valid.upgrade !== undefined && valid.upgrade !== false) {
    return openOwnedStorage({
      site:
        valid.dialect === 'sqlite'
          ? new SqliteOwnerSite(valid.file, options.logger, hooks)
          : new PostgresOwnerSite(valid.connectionString),
      guard: valid.upgrade.guard,
      checks: valid.upgrade.checks,
      migrations: valid.migrations,
      openHandles: () => openHandles(valid),
      hooks,
      ...(valid.dialect === 'sqlite' && valid.maintenance !== undefined
        ? {
            maintenance: { ...valid.maintenance, sourceFile: valid.file },
          }
        : {}),
      ...(options.logger === undefined ? {} : { logger: options.logger }),
    })
  }

  const handles = openHandles(valid)
  try {
    await ping(handles.writeDb)
    await ping(handles.readDb)
    if (valid.migrations !== undefined) {
      const migrator = new Migrator({ db: handles.writeDb, provider: valid.migrations })
      const { error } = await migrator.migrateToLatest()
      if (error !== undefined) throw error
    }
  } catch (error) {
    await handles.writeDb.destroy().catch(() => undefined)
    await handles.readDb.destroy().catch(() => undefined)
    throw error
  }
  return new SqlStorage(handles, undefined, options.logger)
}
