import {
  AssemblyLifetimeService,
  startAssemblyWork,
} from '@omne-harness-lite/assembly-lifecycle/cordis'
// storage-sql 插件：config 校验 → 打开（开了升级守卫时走属主路径①～⑦）→ provide('storage')；
// 撤除（一个 effect）：守卫置为已撤、关准入 → 等在途 → 关句柄 → 恢复未确认的快照 → 放排他。
import type { Context } from '@deepseek-ai/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { StorageSqlConfig } from './config.ts'
import { openStorage } from './open.ts'
import type { SqlStorage } from './provider.ts'
import { SqlStorageService } from './service.ts'

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 撤除收尾的失败内核不上抛（basis effect-disposal-concurrent-not-ordered）：在这里记 error，装配经 guard.pending() 回头看磁盘。 */
async function closeLogged(ctx: Context, storage: SqlStorage): Promise<void> {
  try {
    await storage.close()
  } catch (error) {
    ctx.logger.error('storage-sql: dispose failed: %s', describe(error))
  }
}

export const storageSqlPlugin = definePlugin<StorageSqlConfig>({
  name: 'storage-sql',
  Config: StorageSqlConfig,
  async apply(ctx: Context, config) {
    const storage = await openStorage(config, { logger: ctx.logger })
    try {
      // 启动期（await 期间）fiber 已被 dispose 时 effect 抛 INACTIVE_EFFECT：资源没有归宿，自己收尾再抛
      ctx.effect(() => () => closeLogged(ctx, storage))
    } catch (error) {
      await closeLogged(ctx, storage)
      throw error
    }
    new SqlStorageService(ctx, storage)
  },
})

export const managedStorageSqlPlugin = Object.assign(
  definePlugin<StorageSqlConfig>({
    name: 'storage-sql-managed',
    inject: [AssemblyLifetimeService.provide],
    Config: StorageSqlConfig,
    apply(ctx: Context, config) {
      let resource: SqlStorage | undefined
      startAssemblyWork(
        ctx,
        async () => {
          resource = await openStorage(config, { logger: ctx.logger('storage-sql') })
          ctx.fiber.assertActive()
          if (!ctx.assemblyLifetime.isCurrent()) throw new Error('Assembly work has stopped')
          new SqlStorageService(ctx, resource)
        },
        async () => {
          await resource?.close()
        },
      )
    },
  }),
  { assemblyLifecycle: 1 as const },
)
