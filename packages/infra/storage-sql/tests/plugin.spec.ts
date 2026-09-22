import { describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import type { Migration, MigrationProvider } from 'kysely/migration'
import { bootAssembly } from '@omne-harness-lite/kernel-basis/testing'
import { StorageUnavailable, type StorageInstance } from '@omne-harness-lite/storage'
import { STORAGE_SERVICE, StorageSqlConfig, storageSqlPlugin } from '../src/index.ts'
import { tempSqliteFile } from './support.ts'

const migrations: MigrationProvider = {
  async getMigrations(): Promise<Record<string, Migration>> {
    return {
      '0001_widgets': {
        async up(db) {
          await db.schema
            .createTable('widgets')
            .ifNotExists()
            .addColumn('id', 'text', c => c.primaryKey())
            .execute()
        },
      },
    }
  },
}

describe('storage-sql 插件', () => {
  it('配置合法 ⇒ 迁移先跑、再 provide storage；撤除后 storage 不可用', async () => {
    const assembly = await bootAssembly({
      plugins: [
        {
          plugin: storageSqlPlugin,
          config: { dialect: 'sqlite', file: tempSqliteFile('plugin'), migrations },
        },
      ],
    })
    const storage = assembly.ctx.get(STORAGE_SERVICE) as StorageInstance
    expect(storage).toBeDefined()
    const rows = await storage.read(
      async tx =>
        (
          await sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'widgets'`.execute(
            tx.db,
          )
        ).rows,
    )
    expect(rows).toHaveLength(1)
    await assembly.dispose()
    expect(assembly.ctx.get(STORAGE_SERVICE)).toBeUndefined()
    await expect(storage.read(async () => 1)).rejects.toBeInstanceOf(StorageUnavailable)
  })

  it(':memory: 被拒 ⇒ 启动失败', async () => {
    await expect(
      bootAssembly({
        plugins: [{ plugin: storageSqlPlugin, config: { dialect: 'sqlite', file: ':memory:' } }],
      }),
    ).rejects.toThrow(/invalid config/)
  })

  it('迁移失败 ⇒ 启动失败，不 provide', async () => {
    const failing: MigrationProvider = {
      async getMigrations() {
        return {
          '0001_bad': {
            async up() {
              throw new Error('migration exploded')
            },
          },
        }
      },
    }
    await expect(
      bootAssembly({
        plugins: [
          {
            plugin: storageSqlPlugin,
            config: {
              dialect: 'sqlite',
              file: tempSqliteFile('bad-migration'),
              migrations: failing,
            },
          },
        ],
      }),
    ).rejects.toThrow('migration exploded')
  })

  it('方言切换只改配置：postgres 配置形状被接受（不连接）', () => {
    expect(
      StorageSqlConfig.safeParse({ dialect: 'postgres', connectionString: 'postgres://x' }).success,
    ).toBe(true)
    expect(StorageSqlConfig.safeParse({ dialect: 'mysql', connectionString: 'x' }).success).toBe(
      false,
    )
  })
})
