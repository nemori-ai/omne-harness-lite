// 升级守卫经真实 Cordis 装配：守卫随 config 进插件体（A-1 取证）、确认绑在实例上、撤除路径上的恢复失败看得见。
import { existsSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { FIBER_STATE, definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { bootAssembly } from '@omne-harness-lite/kernel-basis/testing'
import { StorageUnavailable } from '@omne-harness-lite/storage'
import {
  StorageSqlConfig,
  StorageStartupFailure,
  UpgradeGuardNotAttached,
  createUpgradeGuard,
  openStorage,
  type UpgradeGuard,
} from '../src/index.ts'
import { STORAGE_SERVICE } from '@omne-harness-lite/storage/cordis'
import { storageSqlPlugin, type SqlStorageService } from '../src/cordis.ts'
import { migrationsOf } from './fixtures/migrations.ts'
import { startupPlugin } from './fixtures/plugin-resources.ts'
import {
  canDropWritePermission,
  dumpDatabase,
  makeDirectoryReadOnly,
  tempSqliteFile,
} from './support.ts'

const snapshotOf = (file: string) => `${file}.upgrade-snapshot`

function ownerConfig(file: string, guard: UpgradeGuard, kinds: string[]): StorageSqlConfig {
  return {
    dialect: 'sqlite',
    file,
    migrations: migrationsOf(...kinds),
    upgrade: { checks: [], guard },
  }
}

function ownerAssembly(config: StorageSqlConfig) {
  if (
    config.dialect !== 'sqlite' ||
    config.migrations === undefined ||
    config.upgrade === undefined ||
    config.upgrade === false
  )
    throw new Error('owner fixture requires SQLite migration resources')
  return bootAssembly({
    plugins: [
      {
        plugin: startupPlugin({ migrations: config.migrations, upgrade: config.upgrade }),
        config: {},
      },
      {
        plugin: storageSqlPlugin,
        config: { dialect: config.dialect, file: config.file, startup: 'migrate' },
      },
    ],
  })
}

async function confirmedDatabase(file: string, kinds: string[]): Promise<void> {
  const guard = createUpgradeGuard()
  const storage = await openStorage(ownerConfig(file, guard, kinds))
  await guard.confirm()
  await storage.close()
}

describe('upgrade.guard-binding（交错 f；A-1 取证）', () => {
  it('A-1：内核交给插件体的是 Config 校验的产出——顶层对象是新的、未冻结，守卫是装配手里那一个', async () => {
    const guard = createUpgradeGuard()
    const config = ownerConfig(tempSqliteFile('probe'), guard, ['t1'])
    let received: StorageSqlConfig | undefined
    const probe = definePlugin<StorageSqlConfig>({
      name: 'config-probe',
      Config: StorageSqlConfig,
      apply(_ctx, value) {
        received = value
      },
    })
    const ctx = new Context()
    await ctx.plugin(probe, config)
    expect(received).toBeDefined()
    // 顶层与 upgrade 对象被 zod 重建（不是原样），也没冻结
    expect(received).not.toBe(config)
    expect(Object.isFrozen(received)).toBe(false)
    // 守卫（z.custom 放行的值）原样到达：装配手里的就是插件体附着的那一个
    const upgrade = received?.upgrade
    expect(upgrade !== undefined && upgrade !== false && upgrade.guard === guard).toBe(true)
  })

  it('交给插件的守卫在 ACTIVE 之后 confirm() 成功（内核若拷贝守卫，这一支会红）', async () => {
    const file = tempSqliteFile('binding-ok')
    await confirmedDatabase(file, ['t1'])
    const guard = createUpgradeGuard()
    const assembly = await ownerAssembly(ownerConfig(file, guard, ['t1', 't2']))
    expect(await guard.confirm()).toEqual({
      migrated: true,
      snapshotTaken: true,
      snapshotRemoved: true,
    })
    await assembly.dispose()
    expect(dumpDatabase(file)).toHaveProperty('t2')
    expect(await guard.pending()).toBe('clear')
  })

  it('从未交给任何插件的守卫 ⇒ confirm() 抛 UpgradeGuardNotAttached；插件那个实例的快照原样在，随后撤除恢复它', async () => {
    const file = tempSqliteFile('binding-wrong')
    await confirmedDatabase(file, ['t1'])
    const before = dumpDatabase(file)
    const given = createUpgradeGuard()
    const other = createUpgradeGuard()
    const assembly = await ownerAssembly(ownerConfig(file, given, ['t1', 't2']))
    await expect(other.confirm()).rejects.toBeInstanceOf(UpgradeGuardNotAttached)
    expect(await other.pending()).toBe('never-attached')
    expect(existsSync(snapshotOf(file))).toBe(true)
    await assembly.dispose()
    expect(dumpDatabase(file)).toEqual(before)
    expect(await given.pending()).toBe('clear')
  })

  it('「被占」启动失败之后守卫未附着、pending() 为 never-attached', async () => {
    const file = tempSqliteFile('binding-occupied')
    const holderGuard = createUpgradeGuard()
    const holder = await openStorage(ownerConfig(file, holderGuard, ['t1']))
    const guard = createUpgradeGuard()
    const error = await ownerAssembly(ownerConfig(file, guard, ['t1'])).then(
      () => undefined,
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(StorageStartupFailure)
    expect((error as StorageStartupFailure).stage).toBe('occupied')
    expect(await guard.pending()).toBe('never-attached')
    await expect(guard.confirm()).rejects.toBeInstanceOf(UpgradeGuardNotAttached)
    await holderGuard.confirm()
    await holder.close()
  })

  it('撤除开始之后 confirm() 抛 UpgradeGuardNotAttached；撤完 pending() 仍按原位置答', async () => {
    const file = tempSqliteFile('binding-disposing')
    await confirmedDatabase(file, ['t1'])
    const guard = createUpgradeGuard()
    const assembly = await ownerAssembly(ownerConfig(file, guard, ['t1', 't2']))
    // 一个在途写事务把撤除卡在「等在途」：确认一定落在撤除进行中
    const storage = assembly.ctx.get(STORAGE_SERVICE) as SqlStorageService
    let release = () => undefined as void
    const inflight = storage.write(
      () =>
        new Promise<void>(resolve => {
          release = resolve
        }),
    )
    const disposing = assembly.dispose()
    await vi.waitFor(async () => {
      await expect(storage.read(async () => 1)).rejects.toBeInstanceOf(StorageUnavailable)
    })
    await expect(guard.confirm()).rejects.toBeInstanceOf(UpgradeGuardNotAttached)
    release()
    await inflight
    await disposing
    // 撤除已恢复：原位置上没有快照
    expect(await guard.pending()).toBe('clear')
    expect(dumpDatabase(file)).not.toHaveProperty('t2')
  })

  it('确认在途时撤除 ⇒ 撤除等它返回、不恢复', async () => {
    const file = tempSqliteFile('binding-inflight')
    await confirmedDatabase(file, ['t1'])
    const guard = createUpgradeGuard()
    const assembly = await ownerAssembly(ownerConfig(file, guard, ['t1', 't2']))
    const confirming = guard.confirm()
    const disposing = assembly.dispose()
    expect(await confirming).toEqual({
      migrated: true,
      snapshotTaken: true,
      snapshotRemoved: true,
    })
    await disposing
    expect(dumpDatabase(file)).toHaveProperty('t2')
    expect(await guard.pending()).toBe('clear')
  })

  it('同一个守卫交给两个实例（不同文件）⇒ 后附着的那个启动失败', async () => {
    const guard = createUpgradeGuard()
    const first = await ownerAssembly(ownerConfig(tempSqliteFile('binding-twice-a'), guard, ['t1']))
    const ctx = new Context()
    await ctx.plugin(
      startupPlugin({ migrations: migrationsOf('t1'), upgrade: { checks: [], guard } }),
      {},
    )
    const fiber = ctx.plugin(storageSqlPlugin, {
      dialect: 'sqlite',
      file: tempSqliteFile('binding-twice-b'),
      startup: 'migrate',
    })
    await expect(fiber).rejects.toThrow(/already attached/)
    expect(fiber.state as number).toBe(FIBER_STATE.FAILED)
    expect(ctx.get(STORAGE_SERVICE)).toBeUndefined()
    expect((await guard.confirm()).snapshotTaken).toBe(true)
    await first.dispose()
    await ctx.fiber.dispose()
  })
})

describe('upgrade.dispose-restore-failure-visible', () => {
  it.skipIf(!canDropWritePermission)(
    '撤除路径上恢复失败 ⇒ dispose() 照常 resolve，pending() 仍报位置，有一条 error 记录；下一次启动恢复它',
    async () => {
      const file = tempSqliteFile('dispose-restore-fail')
      await confirmedDatabase(file, ['t1'])
      const before = dumpDatabase(file)
      const guard = createUpgradeGuard()
      const assembly = await ownerAssembly(ownerConfig(file, guard, ['t1', 't2']))
      const restoreWrite = makeDirectoryReadOnly(file)
      try {
        await expect(assembly.dispose()).resolves.toBeUndefined()
        expect(await guard.pending()).toEqual({ pending: { location: snapshotOf(file) } })
        const errors = assembly.ctx.logger.buffer.filter(message => message.type === 'error')
        expect(
          errors.some(message => message.args.map(String).join(' ').includes(snapshotOf(file))),
        ).toBe(true)
      } finally {
        restoreWrite()
      }
      // 下一次启动按 R-U5 先恢复
      const next = createUpgradeGuard()
      const storage = await openStorage(ownerConfig(file, next, ['t1']))
      await next.confirm()
      await storage.close()
      expect(dumpDatabase(file)).toEqual(before)
    },
  )
})
