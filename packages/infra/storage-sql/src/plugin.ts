import type { Context, Fiber } from '@deepseek-ai/cordis'
import {
  ASSEMBLY_LIFETIME_SERVICE,
  startAssemblyWork,
} from '@omne-harness-lite/assembly-lifecycle/cordis'
import { AssemblyWorkStopped } from '@omne-harness-lite/assembly-lifecycle'
import { definePlugin, FIBER_STATE } from '@omne-harness-lite/kernel-basis/cordis'
import {
  STORAGE_STARTUP_SERVICE,
  STORAGE_COMPLETION_SERVICE,
} from '@omne-harness-lite/storage/cordis'
import { StorageSqlPluginConfig, describeStorageAssembly, storageConfig } from './plugin-config.ts'
import { openStorage } from './open.ts'
import type { SqlStorage } from './provider.ts'
import { SqlStorageService } from './service.ts'

/** 撤除收尾的失败内核不上抛（basis effect-disposal-concurrent-not-ordered）：在这里记 error，装配经 guard.pending() 回头看磁盘。 */
async function closeLogged(ctx: Context, storage: SqlStorage): Promise<void> {
  try {
    await storage.close()
  } catch (error) {
    const description = error instanceof Error ? error.message : String(error)
    ctx.logger.error('storage-sql: dispose failed: %s', description)
  }
}

function resourceScope(
  ctx: Context,
  config: StorageSqlPluginConfig,
  apply: (child: Context) => void | Promise<void>,
): Fiber & PromiseLike<Fiber> {
  if (ctx.get(STORAGE_STARTUP_SERVICE) === undefined)
    throw new Error('Storage startup service is required')
  if (config.dialect === 'sqlite' && config.maintenance !== undefined) {
    if (ctx.get(STORAGE_COMPLETION_SERVICE) === undefined)
      throw new Error('Storage completion service is required')
    return ctx.inject([STORAGE_STARTUP_SERVICE, STORAGE_COMPLETION_SERVICE], apply)
  }
  return ctx.inject([STORAGE_STARTUP_SERVICE], apply)
}

/** The effect owns the setup prefix even if withdrawal races the database open. */
async function independent(ctx: Context, config: StorageSqlPluginConfig): Promise<void> {
  let resource: SqlStorage | undefined
  const settled = Promise.withResolvers<void>()
  ctx.effect(() => async () => {
    await settled.promise
    if (resource !== undefined) await closeLogged(ctx, resource)
  })
  try {
    resource = await openStorage(storageConfig(ctx, config), { logger: ctx.logger })
    ctx.fiber.assertActive()
    new SqlStorageService(ctx, resource)
  } finally {
    settled.resolve()
  }
}

export const storageSqlPlugin = definePlugin<StorageSqlPluginConfig>({
  name: 'storage-sql',
  Config: StorageSqlPluginConfig,
  async apply(ctx: Context, config) {
    if (config.startup === 'plain') await independent(ctx, config)
    else {
      const child = resourceScope(ctx, config, inner => independent(inner, config))
      await child
      if ((child.state as number) !== FIBER_STATE.ACTIVE) throw new AssemblyWorkStopped()
    }
  },
})

export const managedStorageSqlPlugin = Object.assign(
  definePlugin<StorageSqlPluginConfig>({
    name: 'storage-sql-managed',
    inject: [ASSEMBLY_LIFETIME_SERVICE],
    Config: StorageSqlPluginConfig,
    apply(ctx: Context, config) {
      let resource: SqlStorage | undefined
      const closed = Promise.withResolvers<void>()
      const assertCurrent = (scope: Context): void => {
        scope.fiber.assertActive()
        ctx.fiber.assertActive()
        if (!ctx.assemblyLifetime.isCurrent()) throw new AssemblyWorkStopped()
      }
      const open = async (scope: Context): Promise<void> => {
        assertCurrent(scope)
        resource = await openStorage(storageConfig(scope, config), {
          logger: ctx.logger('storage-sql'),
        })
        assertCurrent(scope)
        new SqlStorageService(scope, resource)
      }
      startAssemblyWork(
        ctx,
        async () => {
          if (config.startup === 'plain') return open(ctx)
          const started = Promise.withResolvers<void>()
          void started.promise.catch(() => undefined)
          let executed = false
          ctx.effect(() => () => {
            if (!executed) started.reject(new AssemblyWorkStopped())
          })
          const child = resourceScope(ctx, config, inner => {
            // Wait native completion, not parent disposal: the parent owns this child.
            inner.effect(() => () => {
              // A repeated Cordis effect disposal can return void after its epoch ended.
              void Promise.resolve(ctx.fiber.dispose()).catch(() =>
                ctx.logger.error('storage-sql: binding disposal failed'),
              )
              return closed.promise
            })
            if (executed) throw new AssemblyWorkStopped()
            executed = true
            void open(inner).then(started.resolve, started.reject)
          })
          await Promise.race([
            started.promise,
            Promise.resolve(child).then(() => {
              if (!executed) throw new AssemblyWorkStopped()
              return started.promise
            }),
          ])
          assertCurrent(child.ctx)
          await child
          assertCurrent(child.ctx)
        },
        async () => {
          try {
            await resource?.close()
          } finally {
            closed.resolve()
          }
        },
      )
    },
  }),
  { assemblyLifecycle: 1 as const, describeAssembly: describeStorageAssembly },
)
