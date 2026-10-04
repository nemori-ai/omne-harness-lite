import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { sql } from 'kysely'
import type { Migration, MigrationProvider } from 'kysely/migration'
import { FIBER_STATE } from '@omne-harness-lite/kernel-basis/cordis'
import { bootAssembly } from '@omne-harness-lite/kernel-basis/testing'
import { StorageUnavailable, type StorageInstance } from '@omne-harness-lite/storage'
import { STORAGE_SERVICE, type StorageService } from '@omne-harness-lite/storage/cordis'
import { StorageSqlConfig, createUpgradeGuard, openStorage } from '../src/index.ts'
import { storageSqlPlugin } from '../src/cordis.ts'
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
          config: {
            dialect: 'sqlite',
            file: tempSqliteFile('plugin'),
            migrations,
            upgrade: false,
          },
        },
      ],
    })
    const storage = assembly.ctx.get(STORAGE_SERVICE) as StorageService & StorageInstance
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
              upgrade: false,
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

describe('lifecycle.upgrade-config-policy：带迁移时 upgrade 必须显式给出', () => {
  async function loadFails(config: unknown): Promise<void> {
    const ctx = new Context()
    const fiber = ctx.plugin(storageSqlPlugin, config as StorageSqlConfig)
    await expect(fiber).rejects.toThrow(/invalid config/)
    expect(fiber.state as number).toBe(FIBER_STATE.FAILED)
    expect(ctx.get(STORAGE_SERVICE)).toBeUndefined()
  }

  it('带 migrations 而缺 upgrade ⇒ FAILED、无 storage 服务', async () => {
    await loadFails({ dialect: 'sqlite', file: tempSqliteFile('policy-missing'), migrations })
  })

  it('upgrade 对象而无 migrations ⇒ 同', async () => {
    await loadFails({
      dialect: 'sqlite',
      file: tempSqliteFile('policy-no-migrations'),
      upgrade: { checks: [], guard: createUpgradeGuard() },
    })
  })

  it('guard 不是 createUpgradeGuard() 造的 ⇒ 同', async () => {
    await loadFails({
      dialect: 'sqlite',
      file: tempSqliteFile('policy-foreign-guard'),
      migrations,
      upgrade: { checks: [], guard: { confirm: async () => ({}), pending: async () => 'clear' } },
    })
  })

  it('直接调 openStorage 同样受这条约束', async () => {
    await expect(
      openStorage({ dialect: 'sqlite', file: tempSqliteFile('policy-direct'), migrations }),
    ).rejects.toThrow(/upgrade must be given explicitly/)
  })

  it('带 migrations 且 upgrade: false ⇒ 照常 ACTIVE、不取锁、不建快照', async () => {
    const file = tempSqliteFile('policy-false')
    const assembly = await bootAssembly({
      plugins: [
        {
          plugin: storageSqlPlugin,
          config: { dialect: 'sqlite', file, migrations, upgrade: false },
        },
      ],
    })
    expect(assembly.fibers[0]?.state as number).toBe(FIBER_STATE.ACTIVE)
    expect(existsSync(`${file}.upgrade-snapshot`)).toBe(false)
    // 不取锁：同一文件上一个开了守卫的实例照样取得排他
    const guard = createUpgradeGuard()
    const owner = await openStorage({
      dialect: 'sqlite',
      file,
      migrations,
      upgrade: { checks: [], guard },
    })
    await guard.confirm()
    await owner.close()
    await assembly.dispose()
  })
})
