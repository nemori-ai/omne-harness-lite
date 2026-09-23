// 升级守卫（进程内）：verification.md 的 upgrade.* 义务里不需要真崩溃的那几条。
// 两个子进程真跑的 exclusive-owner 与 leftover-restored 在 upgrade.process.spec.ts。
import { copyFileSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { Kysely, sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import {
  StorageDefect,
  StorageUnavailable,
  type PreflightCheck,
  type PreflightInput,
} from '@omne-harness-lite/storage'
import {
  NodeSqliteDialect,
  StorageStartupFailure,
  UpgradeGuardNotAttached,
  createUpgradeGuard,
  openStorage,
  type UpgradeGuard,
} from '../src/index.ts'
import { openStorageWithHooks } from '../src/open.ts'
import type { SqlStorage } from '../src/provider.ts'
import type { UpgradeHooks } from '../src/upgrade/owner.ts'
import { migrationsOf } from './fixtures/migrations.ts'
import {
  canDropWritePermission,
  dumpDatabase,
  makeDirectoryReadOnly,
  readSnapshotCopy,
  tempSqliteFile,
} from './support.ts'

const snapshotOf = (file: string) => `${file}.upgrade-snapshot`

function owner(
  file: string,
  kinds: string[],
  options: { guard?: UpgradeGuard; checks?: PreflightCheck[]; hooks?: UpgradeHooks } = {},
): Promise<SqlStorage> {
  return openStorageWithHooks(
    {
      dialect: 'sqlite',
      file,
      migrations: migrationsOf(...kinds),
      upgrade: { checks: options.checks ?? [], guard: options.guard ?? createUpgradeGuard() },
    },
    {},
    options.hooks ?? {},
  )
}

/** 起一个属主、确认、关：得到一份「上一版本」的库。 */
async function confirmedDatabase(file: string, kinds: string[]): Promise<void> {
  const guard = createUpgradeGuard()
  const storage = await owner(file, kinds, { guard })
  await guard.confirm()
  await storage.close()
}

async function startupFailure(promise: Promise<unknown>): Promise<StorageStartupFailure> {
  const error: unknown = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(StorageStartupFailure)
  expect(error).not.toBeInstanceOf(StorageUnavailable)
  return error as StorageStartupFailure
}

const refuse: PreflightCheck = async () => ({
  ok: false,
  check: 'data-format',
  detail: 'registry 0002_x is not a prefix of this version',
})

describe('upgrade.preflight-refuses-before-write', () => {
  it('核对不过 ⇒「核对」阶段、detail 原样；库的已提交内容逐表不变、没有快照、登记表没被建', async () => {
    const file = tempSqliteFile('preflight-refuse')
    const raw = new DatabaseSync(file)
    raw.exec("CREATE TABLE data (id TEXT PRIMARY KEY); INSERT INTO data VALUES ('kept')")
    raw.close()
    const before = dumpDatabase(file)

    const failure = await startupFailure(owner(file, ['t1'], { checks: [refuse] }))
    expect(failure.stage).toBe('preflight')
    expect(failure.message).toContain('registry 0002_x is not a prefix of this version')
    expect(failure.cause).toEqual({
      ok: false,
      check: 'data-format',
      detail: 'registry 0002_x is not a prefix of this version',
    })
    expect(dumpDatabase(file)).toEqual(before)
    expect(Object.keys(dumpDatabase(file))).not.toContain('kysely_migration')
    expect(existsSync(snapshotOf(file))).toBe(false)
  })

  it('核对里发写语句 ⇒ StorageDefect，仍是「核对」阶段，库不变', async () => {
    const file = tempSqliteFile('preflight-write')
    await confirmedDatabase(file, ['t1'])
    const before = dumpDatabase(file)
    const writes: PreflightCheck = async ({ tx }) => {
      await tx.db.insertInto('t1').values({ id: 'sneaky' }).execute()
      return { ok: true }
    }
    const failure = await startupFailure(owner(file, ['t1', 't2'], { checks: [writes] }))
    expect(failure.stage).toBe('preflight')
    expect(failure.cause).toBeInstanceOf(StorageDefect)
    expect(dumpDatabase(file)).toEqual(before)
    expect(existsSync(snapshotOf(file))).toBe(false)
  })

  it('核对抛出 ⇒ 同样「核对」阶段，cause 是那个异常', async () => {
    const file = tempSqliteFile('preflight-throw')
    const boom = new Error('check exploded')
    const failure = await startupFailure(
      owner(file, ['t1'], {
        checks: [
          async () => {
            throw boom
          },
        ],
      }),
    )
    expect(failure.stage).toBe('preflight')
    expect(failure.cause).toBe(boom)
  })

  it('首次启动核对不过 ⇒ 按「库不存在」标记恢复：库与附属文件、标记都不在', async () => {
    const file = tempSqliteFile('preflight-first')
    const failure = await startupFailure(owner(file, ['t1'], { checks: [refuse] }))
    expect(failure.stage).toBe('preflight')
    for (const path of [file, `${file}-wal`, `${file}-shm`, snapshotOf(file)])
      expect(existsSync(path)).toBe(false)
  })
})

describe('upgrade.registry-read', () => {
  const capture = (into: PreflightInput[]): PreflightCheck => {
    return async input => {
      into.push(input)
      return { ok: true }
    }
  }

  it('空库 ⇒ appliedMigrations 为空、tables 不含登记表', async () => {
    const file = tempSqliteFile('registry-empty')
    const seen: PreflightInput[] = []
    const guard = createUpgradeGuard()
    const storage = await owner(file, ['a'], { guard, checks: [capture(seen)] })
    expect(seen[0]?.appliedMigrations).toEqual([])
    expect([...(seen[0]?.tables ?? [])]).not.toContain('kysely_migration')
    await guard.confirm()
    await storage.close()
  })

  it('跑过两个迁移的库 ⇒ 两个名字按执行次序；tables 含登记表', async () => {
    const file = tempSqliteFile('registry-two')
    await confirmedDatabase(file, ['a', 'b'])
    const seen: PreflightInput[] = []
    const guard = createUpgradeGuard()
    const storage = await owner(file, ['a', 'b'], { guard, checks: [capture(seen)] })
    expect(seen[0]?.appliedMigrations).toEqual(['0001_a', '0002_b'])
    expect(seen[0]?.tables.has('kysely_migration')).toBe(true)
    expect(seen[0]?.tables.has('a')).toBe(true)
    await guard.confirm()
    await storage.close()
  })

  it('读句柄在核对前被关 ⇒「核对」阶段、cause 是 StorageUnavailable，不是空序列放行', async () => {
    const file = tempSqliteFile('registry-unavailable')
    await confirmedDatabase(file, ['a'])
    const seen: PreflightInput[] = []
    // 读那一侧换成本测试握着 Driver 的同一种句柄（本包的 node:sqlite Driver），核对之前把它关掉
    const readDialect = new NodeSqliteDialect({ file, role: 'read' })
    const failure = await startupFailure(
      owner(file, ['a', 'b'], {
        checks: [capture(seen)],
        hooks: {
          interceptHandles: handles => ({
            ...handles,
            readDb: new Kysely({ dialect: readDialect }),
          }),
          async beforePreflight() {
            await readDialect.driver.destroy()
          },
        },
      }),
    )
    expect(failure.stage).toBe('preflight')
    expect(failure.cause).toBeInstanceOf(StorageUnavailable)
    expect(seen).toHaveLength(0)
    expect(dumpDatabase(file)).not.toHaveProperty('b')
    expect(existsSync(snapshotOf(file))).toBe(false)
  })
})

describe('upgrade.snapshot-consistent', () => {
  it('快照含一笔只在预写日志里的提交', async () => {
    const file = tempSqliteFile('snapshot-wal')
    await confirmedDatabase(file, ['t1'])
    const writer = new DatabaseSync(file)
    writer.exec('PRAGMA wal_autocheckpoint = 0')
    writer.exec("INSERT INTO t1 VALUES ('only-in-wal')")
    // 它此刻只在预写日志里：库文件的字节里没有，预写日志里有
    expect(readFileSync(file).includes('only-in-wal')).toBe(false)
    expect(readFileSync(`${file}-wal`).includes('only-in-wal')).toBe(true)

    let inSnapshot: unknown[] = []
    const guard = createUpgradeGuard()
    const storage = await owner(file, ['t1', 't2'], {
      guard,
      hooks: {
        beforeMigrate() {
          inSnapshot = readSnapshotCopy(snapshotOf(file), db =>
            db.prepare("SELECT id FROM t1 WHERE id = 'only-in-wal'").all(),
          )
        },
      },
    })
    expect(inSnapshot).toHaveLength(1)
    writer.close()
    await guard.confirm()
    await storage.close()
  })

  it('首次启动：库文件不存在 ⇒ 打开之前已有「库不存在」标记', async () => {
    const file = tempSqliteFile('snapshot-absent')
    let markerBeforeOpen = ''
    let databaseBeforeOpen = true
    const guard = createUpgradeGuard()
    const storage = await owner(file, ['t1'], {
      guard,
      hooks: {
        beforeOpen() {
          databaseBeforeOpen = existsSync(file)
          markerBeforeOpen = readFileSync(snapshotOf(file), 'utf8')
        },
      },
    })
    expect(databaseBeforeOpen).toBe(false)
    expect(markerBeforeOpen).toContain('did not exist')
    expect(await guard.pending()).toEqual({ pending: { location: snapshotOf(file) } })
    await guard.confirm()
    await storage.close()
  })
})

describe('upgrade.restore-on-migration-failure', () => {
  it('第二个迁移失败 ⇒「迁移」阶段点名它；内容、登记与 schema 回到升级前，附属文件里没有升级后的写，快照不在', async () => {
    const file = tempSqliteFile('restore-migration')
    await confirmedDatabase(file, ['t1'])
    const plain = await openStorage({ dialect: 'sqlite', file, upgrade: false })
    await plain.write(async tx => {
      await sql`INSERT INTO t1 VALUES ('before-upgrade')`.execute(tx.db)
    })
    await plain.close()
    const before = dumpDatabase(file)

    const failure = await startupFailure(owner(file, ['t1', 't2', 'fail']))
    expect(failure.stage).toBe('migration')
    expect(failure.message).toContain('0003_fail')
    // 恢复之后附属文件都已删除：预写日志里不可能带着升级后的写回放到升级前的库上
    expect(existsSync(`${file}-wal`)).toBe(false)
    expect(existsSync(`${file}-shm`)).toBe(false)
    expect(existsSync(snapshotOf(file))).toBe(false)
    expect(dumpDatabase(file)).toEqual(before)
    expect(before).not.toHaveProperty('t2')
  })
})

describe('upgrade.restore-on-dispose', () => {
  it('迁移成功、provide 之后别的写入者提交一笔、不确认即撤除 ⇒ 库回到升级前，那一笔也不在', async () => {
    const file = tempSqliteFile('restore-dispose')
    await confirmedDatabase(file, ['t1'])
    const before = dumpDatabase(file)

    const storage = await owner(file, ['t1', 't2'])
    await storage.write(async tx => {
      await sql`INSERT INTO t2 VALUES ('after-upgrade')`.execute(tx.db)
    })
    const other = await openStorage({ dialect: 'sqlite', file, upgrade: false })
    await other.write(async tx => {
      await sql`INSERT INTO t1 VALUES ('other-writer')`.execute(tx.db)
    })
    await other.close()
    await storage.close()

    expect(dumpDatabase(file)).toEqual(before)
    expect(existsSync(snapshotOf(file))).toBe(false)
  })

  it('首次启动支：撤除之后库文件与两个附属文件都不存在', async () => {
    const file = tempSqliteFile('restore-dispose-first')
    const storage = await owner(file, ['t1'])
    await storage.write(async tx => {
      await sql`INSERT INTO t1 VALUES ('first')`.execute(tx.db)
    })
    await storage.close()
    for (const path of [file, `${file}-wal`, `${file}-shm`, snapshotOf(file)])
      expect(existsSync(path)).toBe(false)
  })
})

describe('upgrade.confirm', () => {
  it('有待跑迁移 ⇒ 三者皆真；之后快照不在、pending 为 clear、撤除不动库；再调返回第一次的结果', async () => {
    const file = tempSqliteFile('confirm-pending')
    await confirmedDatabase(file, ['t1'])
    const guard = createUpgradeGuard()
    const storage = await owner(file, ['t1', 't2'], { guard })
    const first = await guard.confirm()
    expect(first).toEqual({ migrated: true, snapshotTaken: true, snapshotRemoved: true })
    expect(await guard.confirm()).toBe(first)
    expect(existsSync(snapshotOf(file))).toBe(false)
    expect(await guard.pending()).toBe('clear')
    await storage.close()
    expect(dumpDatabase(file)).toHaveProperty('t2')
  })

  it('无待跑迁移的重启 ⇒ 三者皆假、无动作', async () => {
    const file = tempSqliteFile('confirm-none')
    await confirmedDatabase(file, ['t1'])
    const guard = createUpgradeGuard()
    const storage = await owner(file, ['t1'], { guard })
    expect(existsSync(snapshotOf(file))).toBe(false)
    expect(await guard.confirm()).toEqual({
      migrated: false,
      snapshotTaken: false,
      snapshotRemoved: false,
    })
    await storage.close()
  })

  it('首次启动而迁移为空 ⇒ snapshotTaken 与 snapshotRemoved 为真、migrated 为假', async () => {
    const file = tempSqliteFile('confirm-first-empty')
    const guard = createUpgradeGuard()
    const storage = await owner(file, [], { guard })
    expect(await guard.confirm()).toEqual({
      migrated: false,
      snapshotTaken: true,
      snapshotRemoved: true,
    })
    await storage.close()
    expect(existsSync(file)).toBe(true)
  })

  it.skipIf(!canDropWritePermission)(
    '快照目录只读 ⇒ 抛出、快照仍在；随后撤除照常恢复',
    async () => {
      const file = tempSqliteFile('confirm-readonly')
      await confirmedDatabase(file, ['t1'])
      const before = dumpDatabase(file)
      const guard = createUpgradeGuard()
      const storage = await owner(file, ['t1', 't2'], { guard })
      const restoreWrite = makeDirectoryReadOnly(file)
      try {
        await expect(guard.confirm()).rejects.toMatchObject({ code: 'EACCES' })
        expect(existsSync(snapshotOf(file))).toBe(true)
      } finally {
        restoreWrite()
      }
      await storage.close()
      expect(dumpDatabase(file)).toEqual(before)
    },
  )

  it('快照在确认之前被外部删掉 ⇒ snapshotTaken ∧ ¬snapshotRemoved（装配的断言在此会红）', async () => {
    const file = tempSqliteFile('confirm-deleted')
    await confirmedDatabase(file, ['t1'])
    const guard = createUpgradeGuard()
    const storage = await owner(file, ['t1', 't2'], { guard })
    rmSync(snapshotOf(file))
    expect(await guard.confirm()).toEqual({
      migrated: true,
      snapshotTaken: true,
      snapshotRemoved: false,
    })
    await storage.close()
  })
})

describe('upgrade.named-failures：五个阶段各触发一次', () => {
  it('被占', async () => {
    const file = tempSqliteFile('named-occupied')
    const guard = createUpgradeGuard()
    const holder = await owner(file, ['t1'], { guard })
    const failure = await startupFailure(owner(file, ['t1']))
    expect(failure.stage).toBe('occupied')
    await guard.confirm()
    await holder.close()
  })

  it.skipIf(!canDropWritePermission)('恢复（库目录只读）⇒ 失败里带快照位置、快照仍在', async () => {
    const file = tempSqliteFile('named-restore')
    await confirmedDatabase(file, ['t1'])
    // 一份遗留快照：上一次升级没确认就断了
    copyFileSync(file, snapshotOf(file))
    const restoreWrite = makeDirectoryReadOnly(file)
    let failure: StorageStartupFailure
    try {
      failure = await startupFailure(owner(file, ['t1']))
    } finally {
      restoreWrite()
    }
    expect(failure.stage).toBe('restore')
    expect(failure.snapshot).toBe(snapshotOf(file))
    expect(existsSync(snapshotOf(file))).toBe(true)
    // 下一次启动按 R-U5 再试
    const guard = createUpgradeGuard()
    const storage = await owner(file, ['t1'], { guard })
    expect(existsSync(snapshotOf(file))).toBe(false)
    await guard.confirm()
    await storage.close()
  })

  it('核对', async () => {
    const file = tempSqliteFile('named-preflight')
    const failure = await startupFailure(owner(file, ['t1'], { checks: [refuse] }))
    expect(failure.stage).toBe('preflight')
  })

  it.skipIf(!canDropWritePermission)('快照（快照目录只读）⇒ 一条迁移都没跑', async () => {
    const file = tempSqliteFile('named-snapshot')
    await confirmedDatabase(file, ['t1'])
    const before = dumpDatabase(file)
    let restoreWrite = () => undefined as void
    let failure: StorageStartupFailure
    try {
      failure = await startupFailure(
        owner(file, ['t1', 't2'], {
          hooks: {
            beforePreflight() {
              restoreWrite = makeDirectoryReadOnly(file)
            },
          },
        }),
      )
    } finally {
      restoreWrite()
    }
    expect(failure.stage).toBe('snapshot')
    expect(existsSync(snapshotOf(file))).toBe(false)
    expect(existsSync(`${snapshotOf(file)}.tmp`)).toBe(false)
    expect(dumpDatabase(file)).toEqual(before)
  })

  it('迁移', async () => {
    const file = tempSqliteFile('named-migration')
    const failure = await startupFailure(owner(file, ['t1', 'fail']))
    expect(failure.stage).toBe('migration')
    expect(failure.message).toContain('0002_fail')
  })
})

describe('守卫的附着规则（直接打开）', () => {
  it('同一个守卫交给两个实例（不同文件）⇒ 后附着的那个启动失败，先附着的照常', async () => {
    const guard = createUpgradeGuard()
    const first = await owner(tempSqliteFile('guard-twice-a'), ['t1'], { guard })
    await expect(owner(tempSqliteFile('guard-twice-b'), ['t1'], { guard })).rejects.toThrow(
      /already attached/,
    )
    expect((await guard.confirm()).snapshotTaken).toBe(true)
    await first.close()
  })

  it('启动中途调 confirm ⇒ UpgradeGuardNotAttached（还不在役），不删快照', async () => {
    const file = tempSqliteFile('guard-starting')
    await confirmedDatabase(file, ['t1'])
    const guard = createUpgradeGuard()
    let early: unknown
    const storage = await owner(file, ['t1', 't2'], {
      guard,
      hooks: {
        async beforeMigrate() {
          early = await guard.confirm().catch((e: unknown) => e)
        },
      },
    })
    expect(early).toBeInstanceOf(UpgradeGuardNotAttached)
    expect(existsSync(snapshotOf(file))).toBe(true)
    await guard.confirm()
    await storage.close()
  })

  it('「库不存在」标记与快照可区分：标记之外的内容不被当作快照恢复', async () => {
    const file = tempSqliteFile('guard-garbage')
    await confirmedDatabase(file, ['t1'])
    writeFileSync(snapshotOf(file), 'not a snapshot')
    const failure = await startupFailure(owner(file, ['t1']))
    expect(failure.stage).toBe('restore')
    expect(readFileSync(snapshotOf(file), 'utf8')).toBe('not a snapshot')
    expect(statSync(file).size).toBeGreaterThan(0)
  })
})
