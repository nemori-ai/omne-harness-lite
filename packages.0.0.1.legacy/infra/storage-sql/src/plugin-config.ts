import { isAbsolute } from 'node:path'
import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import type { AssemblyDeclaration } from '@omne-harness-lite/cordis-plugin-tree'
import {
  STORAGE_SERVICE,
  STORAGE_STARTUP_SERVICE,
  STORAGE_COMPLETION_SERVICE,
} from '@omne-harness-lite/storage/cordis'
import { StorageSqlConfig, sqliteFileSchema } from './config.ts'

const startup = z.enum(['plain', 'migrate']).default('plain')

/** Data-only binding input. Direct openStorage retains its separate resource input. */
export const StorageSqlPluginConfig = z
  .discriminatedUnion('dialect', [
    z
      .object({
        dialect: z.literal('sqlite'),
        file: sqliteFileSchema,
        synchronous: z.enum(['normal', 'full']).optional(),
        startup,
        maintenance: z
          .object({ workDirectory: z.string().refine(isAbsolute) })
          .strict()
          .optional(),
      })
      .strict(),
    z
      .object({
        dialect: z.literal('postgres'),
        connectionString: z.string().min(1),
        startup,
      })
      .strict(),
  ])
  .superRefine((config, ctx) => {
    if (
      config.dialect === 'sqlite' &&
      config.maintenance !== undefined &&
      config.startup !== 'migrate'
    )
      ctx.addIssue({
        code: 'custom',
        path: ['maintenance'],
        message: 'maintenance requires migrate startup',
      })
  })
export type StorageSqlPluginConfig = z.infer<typeof StorageSqlPluginConfig>

export function describeStorageAssembly(value: unknown): AssemblyDeclaration {
  const config = StorageSqlPluginConfig.parse(value)
  const maintenance = config.dialect === 'sqlite' && config.maintenance !== undefined
  return {
    provides: [STORAGE_SERVICE],
    requires:
      config.startup === 'plain'
        ? []
        : maintenance
          ? [STORAGE_STARTUP_SERVICE, STORAGE_COMPLETION_SERVICE]
          : [STORAGE_STARTUP_SERVICE],
    optional: [],
    dynamicProvides: [],
    dynamicRequires: [],
    claims: [
      {
        name: 'tenancy-host/storage',
        version: 1,
        config:
          config.dialect === 'postgres'
            ? {
                dialect: config.dialect,
                connectionString: config.connectionString,
                startup: config.startup,
              }
            : {
                dialect: config.dialect,
                file: config.file,
                startup: config.startup,
                ...(config.synchronous === undefined ? {} : { synchronous: config.synchronous }),
                ...(config.maintenance === undefined ? {} : { maintenance: config.maintenance }),
              },
      },
    ],
  }
}

/** Reuse the original guard validation and attachment identity before any database effects. */
export function storageConfig(ctx: Context, config: StorageSqlPluginConfig): StorageSqlConfig {
  const { startup: mode, ...data } = config
  if (mode === 'plain') return StorageSqlConfig.parse({ ...data, upgrade: false })
  const resources = ctx.get(STORAGE_STARTUP_SERVICE)
  if (resources === undefined) throw new Error('Storage startup service is required')
  const completion =
    config.dialect === 'sqlite' && config.maintenance !== undefined
      ? ctx.get(STORAGE_COMPLETION_SERVICE)
      : undefined
  if (config.dialect === 'sqlite' && config.maintenance !== undefined && completion === undefined)
    throw new Error('Storage completion service is required')
  const parsed = StorageSqlConfig.safeParse({
    ...data,
    migrations: resources.migrations,
    upgrade: resources.upgrade,
    ...(config.dialect === 'sqlite' && config.maintenance !== undefined && completion !== undefined
      ? {
          maintenance: {
            ...config.maintenance,
            onClosed: (status: 'clean' | 'error') => completion.closed(status),
          },
        }
      : {}),
  })
  if (!parsed.success) throw new Error('invalid config: storage startup resources')
  return parsed.data
}
