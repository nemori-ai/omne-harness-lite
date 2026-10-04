// 升级守卫的真崩溃与跨进程排他：子进程（tests/fixtures/owner-child.ts）在指定时点被 SIGKILL。
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  StorageStartupFailure,
  createUpgradeGuard,
  openStorage,
  type StorageSqlConfig,
  type UpgradeGuard,
} from '../src/index.ts'
import { openStorageWithHooks } from '../src/open.ts'
import { migrationsOf } from './fixtures/migrations.ts'
import { spawnOwner } from './owner-process.ts'
import { dumpDatabase, tempSqliteFile } from './support.ts'

const snapshotOf = (file: string) => `${file}.upgrade-snapshot`
const digest = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')

function ownerConfig(file: string, guard: UpgradeGuard, kinds: string[]): StorageSqlConfig {
  return {
    dialect: 'sqlite',
    file,
    migrations: migrationsOf(...kinds),
    upgrade: { checks: [], guard },
  }
}

async function confirmedDatabase(file: string, kinds: string[]): Promise<void> {
  const guard = createUpgradeGuard()
  const storage = await openStorage(ownerConfig(file, guard, kinds))
  await guard.confirm()
  await storage.close()
}

describe('upgrade.exclusive-owner', () => {
  it('old EXCLUSIVE and current IMMEDIATE owners reject each other across processes', async () => {
    const file = tempSqliteFile('mixed-owner')
    const legacy = new DatabaseSync(`${file}.owner-lock`, { timeout: 0 })
    legacy.exec('PRAGMA journal_mode=MEMORY; BEGIN EXCLUSIVE')
    try {
      const current = spawnOwner({ file, migrations: ['t1'] })
      expect(await current.until('failed:')).toBe('failed:occupied')
      expect(await current.exited()).toBe(0)
    } finally {
      legacy.close()
    }
    const guard = createUpgradeGuard()
    const current = await openStorage(ownerConfig(file, guard, ['t1']))
    try {
      await guard.confirm()
      const result = execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `
        import { DatabaseSync } from 'node:sqlite';
        const db = new DatabaseSync(process.argv[1], { timeout: 0 });
        try { db.exec('PRAGMA journal_mode=MEMORY; BEGIN EXCLUSIVE'); process.stdout.write('owned'); }
        catch (error) { if (error.errcode !== 5 && error.errcode !== 6) throw error; process.stdout.write('occupied'); }
        finally { db.close(); }
      `,
          `${file}.owner-lock`,
        ],
        { encoding: 'utf8' },
      )
      expect(result).toBe('occupied')
    } finally {
      await current.close()
    }
    const reopened = await openStorage(ownerConfig(file, createUpgradeGuard(), ['t1']))
    await reopened.close()
  })

  // 归慢层：子进程＋真库：三个子进程先后争同一个 SQLite 文件库的升级排他，先起者被 SIGKILL。
  it(
    '两个子进程：后起者「被占」且没碰库与快照；先起者被 SIGKILL 之后，后起者再起即成功（锁随进程释放）',
    { tags: ['slow'] },
    async () => {
      const file = tempSqliteFile('exclusive')
      await confirmedDatabase(file, ['t1'])

      const first = spawnOwner({ file, migrations: ['t1', 't2'] })
      await first.until('ready')
      // 先起者已升级、未确认：快照在，库里有 t2
      const snapshotDigest = digest(snapshotOf(file))

      const second = spawnOwner({ file, migrations: ['t1', 't2'] })
      expect(await second.until('failed:')).toBe('failed:occupied')
      expect(await second.exited()).toBe(0)
      // 没有排他时后起者会把先起者未确认的快照当遗留恢复掉——这里它原样在
      expect(digest(snapshotOf(file))).toBe(snapshotDigest)

      await first.kill()
      const third = spawnOwner({ file, migrations: ['t1', 't2'] })
      await third.until('ready')
      await third.kill()
    },
  )

  it('同进程第二个开了守卫的实例同样「被占」；不开守卫的实例不受影响', async () => {
    const file = tempSqliteFile('exclusive-same-process')
    await confirmedDatabase(file, ['t1'])
    const guard = createUpgradeGuard()
    const holder = await openStorage(ownerConfig(file, guard, ['t1', 't2']))
    const snapshotDigest = digest(snapshotOf(file))

    const error = await openStorage(ownerConfig(file, createUpgradeGuard(), ['t1', 't2'])).then(
      () => undefined,
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(StorageStartupFailure)
    expect((error as StorageStartupFailure).stage).toBe('occupied')
    expect(digest(snapshotOf(file))).toBe(snapshotDigest)

    const plain = await openStorage({ dialect: 'sqlite', file, upgrade: false })
    expect(await plain.read(async () => 'readable')).toBe('readable')
    await plain.close()

    await guard.confirm()
    await holder.close()
  })
})

describe('upgrade.leftover-restored：真崩溃之后下一次启动先恢复', () => {
  // 归慢层：子进程＋真库：先后三个升级子进程在指定时点被 SIGKILL，再重开 SQLite 文件库恢复核对。
  it(
    '⑥之后、⑦中、恢复的「删附属文件之后、替换之前」各被杀一次 ⇒ 最终库与只跑旧序列的库内容一致',
    { tags: ['slow'] },
    async () => {
      const file = tempSqliteFile('leftover')
      await confirmedDatabase(file, ['t1'])
      const plain = await openStorage({ dialect: 'sqlite', file, upgrade: false })
      await plain.write(async tx => {
        await tx.db.insertInto('t1').values({ id: 'before-upgrade' }).execute()
      })
      await plain.close()
      const before = dumpDatabase(file)

      // ⑥之后被杀：快照已建、迁移未跑
      const afterSnapshot = spawnOwner({ file, migrations: ['t1', 't2'], stopAt: 'beforeMigrate' })
      await afterSnapshot.until('at:beforeMigrate')
      await afterSnapshot.kill()
      expect(existsSync(snapshotOf(file))).toBe(true)

      // 下一次启动在恢复的「删附属文件之后、替换之前」被杀：快照仍在，附属文件已不在
      const midRestore = spawnOwner({
        file,
        migrations: ['t1', 't2'],
        stopAt: 'afterSidecarsRemoved',
      })
      await midRestore.until('at:afterSidecarsRemoved')
      await midRestore.kill()
      expect(existsSync(snapshotOf(file))).toBe(true)
      expect(existsSync(`${file}-wal`)).toBe(false)

      // 再下一次：恢复做完，重建快照，迁移跑到一半被杀（t2 已建，hang 未完成）
      const midMigration = spawnOwner({ file, migrations: ['t1', 't2', 'hang'] })
      await midMigration.until('at:migration')
      await midMigration.kill()
      expect(existsSync(snapshotOf(file))).toBe(true)

      // 旧版本（只认 t1）照常能起：先恢复，库回到升级之前
      const guard = createUpgradeGuard()
      const storage = await openStorage(ownerConfig(file, guard, ['t1']))
      expect(await guard.confirm()).toEqual({
        migrated: false,
        snapshotTaken: false,
        snapshotRemoved: false,
      })
      await storage.close()
      expect(existsSync(snapshotOf(file))).toBe(false)
      expect(dumpDatabase(file)).toEqual(before)
    },
  )

  it('⑥写好临时名、改名之前被杀 ⇒ 下一次启动②删掉半成品、⑥照常建成快照；pending() 从不把半成品报成快照', async () => {
    const file = tempSqliteFile('leftover-temp')
    await confirmedDatabase(file, ['t1'])
    const temp = `${snapshotOf(file)}.tmp`

    const killed = spawnOwner({ file, migrations: ['t1', 't2'], stopAt: 'beforeSnapshotRename' })
    await killed.until('at:beforeSnapshotRename')
    await killed.kill()
    expect(existsSync(temp)).toBe(true)
    expect(existsSync(snapshotOf(file))).toBe(false)

    const guard = createUpgradeGuard()
    let pendingWithHalfWritten: unknown
    let tempAfterCleanup = true
    const storage = await openStorageWithHooks(
      ownerConfig(file, guard, ['t1', 't2']),
      {},
      {
        async afterAttach() {
          pendingWithHalfWritten = await guard.pending()
        },
        beforeOpen() {
          tempAfterCleanup = existsSync(temp)
        },
      },
    )
    expect(pendingWithHalfWritten).toBe('clear')
    expect(tempAfterCleanup).toBe(false)
    expect(await guard.pending()).toEqual({ pending: { location: snapshotOf(file) } })
    expect(await guard.confirm()).toEqual({
      migrated: true,
      snapshotTaken: true,
      snapshotRemoved: true,
    })
    expect(await guard.pending()).toBe('clear')
    await storage.close()
    expect(dumpDatabase(file)).toHaveProperty('t2')
  }, 30_000)
})
