// storage-sql 的 config：方言可辨识联合 + 迁移 + 升级守卫的显式二选一（design.md「方言配置形状」「守卫为什么显式开启」）。
import type { MigrationProvider } from 'kysely/migration'
import { z } from 'zod'
import type { PreflightCheck } from '@omne-harness-lite/storage'
import { UpgradeGuard } from './upgrade/guard.ts'

const migrationProvider = z.custom<MigrationProvider>(
  value =>
    typeof value === 'object' &&
    value !== null &&
    typeof (value as MigrationProvider).getMigrations === 'function',
  'migrations must be a Kysely MigrationProvider',
)

// z.custom 原样放行校验通过的值（不重建）：交给插件体的守卫就是装配手里那一个（A-1，`upgrade.guard-binding`）
const upgradeGuard = z.custom<UpgradeGuard>(
  value => value instanceof UpgradeGuard,
  'upgrade.guard must be created by createUpgradeGuard()',
)

const preflightCheck = z.custom<PreflightCheck>(
  value => typeof value === 'function',
  'each upgrade check must be a PreflightCheck function',
)

/** `{ checks, guard }` 开启升级守卫；`false` 声明不开。带 `migrations` 时必须显式给出其一。 */
const upgrade = z.union([
  z.literal(false),
  z.object({ checks: z.array(preflightCheck), guard: upgradeGuard }).strict(),
])

export const StorageSqlConfig = z
  .discriminatedUnion('dialect', [
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
      upgrade: upgrade.optional(),
    }),
    z.object({
      dialect: z.literal('postgres'),
      connectionString: z.string().min(1),
      migrations: migrationProvider.optional(),
      upgrade: upgrade.optional(),
    }),
  ])
  .superRefine((config, ctx) => {
    if (config.migrations !== undefined && config.upgrade === undefined)
      ctx.addIssue({
        code: 'custom',
        path: ['upgrade'],
        message:
          'upgrade must be given explicitly when migrations are given: { checks, guard } to enable the upgrade guard, or false',
      })
    if (config.migrations === undefined && config.upgrade !== undefined && config.upgrade !== false)
      ctx.addIssue({
        code: 'custom',
        path: ['upgrade'],
        message: 'an upgrade guard requires migrations',
      })
  })
export type StorageSqlConfig = z.infer<typeof StorageSqlConfig>
