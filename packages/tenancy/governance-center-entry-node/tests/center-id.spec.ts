// 中心标识那一格（入口契约 S-27、S-28）：迁移片段（T-13：M-1、M-3）、迁移前核对三支、读或铸三态与失败四支、真并发首启（sqlite）。
// 经插件装载的各支（重启同值、换地址同值、启动失败说明点名、公开体检从没交出坏值）在 lifecycle.spec.ts。
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { UniqueViolation } from '@omne-harness-lite/storage'
import {
  type SqlStorage,
  StorageStartupFailure,
  createUpgradeGuard,
  openStorage,
} from '@omne-harness-lite/storage-sql'
import {
  GOVERNANCE_CENTER_PREFLIGHT_CHECK,
  GOVERNANCE_CENTER_TABLE,
  GovernanceCenterIdentityError,
  governanceCenterMigrations,
  governanceCenterPreflight,
} from '../src/index.ts'
import { isGovernanceCenterId } from '@omne-harness-lite/governance-center-entry'
import { mintGovernanceCenterId, readOrMintCenterId } from '../src/center-id/read-or-mint.ts'
import { FaultyStorage, composedMigrations, tempSqliteFile } from './support/composition.ts'

const opened: SqlStorage[] = []
afterEach(async () => {
  for (const storage of opened.splice(0)) await storage.close()
})

async function open(file = tempSqliteFile('center-id')): Promise<SqlStorage> {
  const storage = await openStorage({
    dialect: 'sqlite',
    file,
    migrations: composedMigrations(),
    upgrade: false,
  })
  opened.push(storage)
  return storage
}

async function rows(storage: SqlStorage): Promise<unknown[]> {
  return storage.read(async tx => tx.db.selectFrom(GOVERNANCE_CENTER_TABLE).selectAll().execute())
}

function sqlite(file: string, statement: string): void {
  const db = new DatabaseSync(file)
  try {
    db.exec(statement)
  } finally {
    db.close()
  }
}

function fragment() {
  const [only] = governanceCenterMigrations
  if (only === undefined) throw new Error('no fragment')
  return only
}

describe('T-13 迁移片段（M-1、M-3）', () => {
  it('导出一个片段，名字稳定；经 composeMigrations 合成后迁移完表里恰一行占位 (center, NULL)', async () => {
    expect(governanceCenterMigrations.map(f => f.name)).toEqual(['governance_center'])
    expect(Object.isFrozen(governanceCenterMigrations)).toBe(true)
    expect(await rows(await open())).toEqual([{ slot: 'center', center_id: null }])
  })

  it('片段连跑两次无错、表里恰一行；铸好之后再跑一次，值不变（存在即不插）', async () => {
    const storage = await open()
    await storage.write(async tx => {
      await fragment().migration.up(tx.db)
      await fragment().migration.up(tx.db)
    })
    expect(await rows(storage)).toEqual([{ slot: 'center', center_id: null }])
    const { centerId } = await readOrMintCenterId(storage)
    await storage.write(async tx => {
      await fragment().migration.up(tx.db)
    })
    expect(await rows(storage)).toEqual([{ slot: 'center', center_id: centerId }])
  })

  it('主键约束名是 governance_center_pkey（sqlite；pg 随装配第二程）', async () => {
    const storage = await open()
    const error = await storage
      .write(async tx =>
        tx.db
          .insertInto(GOVERNANCE_CENTER_TABLE)
          .values({ slot: 'center', center_id: null })
          .execute(),
      )
      .then(
        () => undefined,
        (e: unknown) => e,
      )
    expect(error).toBeInstanceOf(UniqueViolation)
    expect(error instanceof UniqueViolation ? error.constraint : undefined).toBe(
      'governance_center_pkey',
    )
  })
})

describe('迁移前核对 governanceCenterPreflight（R-GC8；三支）', () => {
  // 判据只看提供者先读好的表清单：事务一碰就让测试失败
  const untouchable = {
    get db(): never {
      throw new Error('the preflight check must not query')
    },
  }
  const check = (tables: string[]) =>
    governanceCenterPreflight({ tx: untouchable, tables: new Set(tables), appliedMigrations: [] })

  it('空库过；只剩两张迁移登记表也算空库，过', async () => {
    expect(await check([])).toEqual({ ok: true })
    expect(await check(['kysely_migration', 'kysely_migration_lock'])).toEqual({ ok: true })
  })

  it('非空库却没有 governance_center ⇒ 不过，点名这条核对', async () => {
    expect(await check(['kysely_migration', 'kysely_migration_lock', 'account'])).toMatchObject({
      ok: false,
      check: GOVERNANCE_CENTER_PREFLIGHT_CHECK,
    })
  })

  it('非空库且有 governance_center ⇒ 过', async () => {
    expect(await check(['account', 'governance_center'])).toEqual({ ok: true })
  })
})

describe('T-8「表整个丢了」：storage-sql 的迁移前核对拒绝，不重建、不动数据', () => {
  it.each([
    ['保留迁移登记', false],
    ['清空迁移登记', true],
  ])(
    '%s ⇒ StorageStartupFailure(preflight)，那张表没有被重建，其余数据原样',
    async (_name, clearRegistry) => {
      const file = tempSqliteFile('table-lost')
      const first = await openStorage({
        dialect: 'sqlite',
        file,
        migrations: composedMigrations(),
        upgrade: false,
      })
      await readOrMintCenterId(first)
      await first.close()
      sqlite(file, `DROP TABLE ${GOVERNANCE_CENTER_TABLE}`)
      if (clearRegistry)
        sqlite(file, 'DROP TABLE kysely_migration; DROP TABLE kysely_migration_lock')
      const tablesBefore = tableNames(file)
      const guard = createUpgradeGuard()
      const error = await openStorage({
        dialect: 'sqlite',
        file,
        migrations: composedMigrations(),
        upgrade: { checks: [governanceCenterPreflight], guard },
      }).then(
        storage => {
          opened.push(storage)
          return undefined
        },
        (e: unknown) => e,
      )
      expect(error).toBeInstanceOf(StorageStartupFailure)
      expect(error instanceof StorageStartupFailure ? error.stage : undefined).toBe('preflight')
      expect(String(error instanceof Error ? error.message : '')).toContain(
        GOVERNANCE_CENTER_PREFLIGHT_CHECK,
      )
      expect(tableNames(file)).toEqual(tablesBefore)
      expect(tableNames(file)).not.toContain(GOVERNANCE_CENTER_TABLE)
    },
  )

  it('空库首启时核对放行，迁移建表并插入占位行', async () => {
    const guard = createUpgradeGuard()
    const storage = await openStorage({
      dialect: 'sqlite',
      file: tempSqliteFile('fresh-preflight'),
      migrations: composedMigrations(),
      upgrade: { checks: [governanceCenterPreflight], guard },
    })
    opened.push(storage)
    await guard.confirm()
    expect(await rows(storage)).toEqual([{ slot: 'center', center_id: null }])
  })
})

function tableNames(file: string): string[] {
  const db = new DatabaseSync(file)
  try {
    return db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map(row => String(row['name']))
  } finally {
    db.close()
  }
}

describe('读或铸（S-28 ④）', () => {
  it('铸出的值合 S-27（32 个小写十六进制），两次铸出不同', () => {
    const a = mintGovernanceCenterId()
    expect(isGovernanceCenterId(a)).toBe(true)
    expect(a).not.toBe(mintGovernanceCenterId())
  })

  it('未铸 ⇒ 铸并写入；已铸合形 ⇒ 用，不再写', async () => {
    const storage = await open()
    const first = await readOrMintCenterId(storage)
    expect(first.minted).toBe(true)
    expect(isGovernanceCenterId(first.centerId)).toBe(true)
    const second = await readOrMintCenterId(storage, () => {
      throw new Error('must not mint')
    })
    expect(second).toEqual({ centerId: first.centerId, minted: false })
  })

  it('读不出（写事务在锁与读之前失败）⇒ unreadable，没有铸；修好后按第一次铸', async () => {
    const storage = new FaultyStorage(await open())
    storage.failNextWrite()
    let mints = 0
    const mint = () => {
      mints += 1
      return mintGovernanceCenterId()
    }
    await expect(readOrMintCenterId(storage, mint)).rejects.toMatchObject({ failure: 'unreadable' })
    expect(mints).toBe(0)
    expect(await rows(storage.inner)).toEqual([{ slot: 'center', center_id: null }])
    expect((await readOrMintCenterId(storage, mint)).minted).toBe(true)
  })

  it('已铸之后读不出 ⇒ unreadable，绝不当作未铸', async () => {
    const storage = new FaultyStorage(await open())
    const { centerId } = await readOrMintCenterId(storage)
    storage.down = true
    await expect(readOrMintCenterId(storage)).rejects.toMatchObject({ failure: 'unreadable' })
    storage.down = false
    expect((await readOrMintCenterId(storage)).centerId).toBe(centerId)
  })

  it('写不进（铸的那次提交失败）⇒ unwritable，那一行仍是 NULL；修好后按第一次铸', async () => {
    const storage = new FaultyStorage(await open())
    storage.failNextCommit()
    const error = await readOrMintCenterId(storage).then(
      () => undefined,
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(GovernanceCenterIdentityError)
    expect(error).toMatchObject({ failure: 'unwritable' })
    expect(String(error instanceof Error ? error.message : '')).toContain('写不进')
    expect(await rows(storage.inner)).toEqual([{ slot: 'center', center_id: null }])
    expect((await readOrMintCenterId(storage)).minted).toBe(true)
  })

  it('那一格不存在（表在、行被删）⇒ missing，不铸新的', async () => {
    const storage = await open()
    await readOrMintCenterId(storage)
    await storage.write(async tx => tx.db.deleteFrom(GOVERNANCE_CENTER_TABLE).execute())
    await expect(
      readOrMintCenterId(storage, () => {
        throw new Error('must not mint')
      }),
    ).rejects.toMatchObject({ failure: 'missing' })
    expect(await rows(storage)).toEqual([])
  })

  it('值不合 S-27 ⇒ malformed，不修不重铸；说明里不写那个值', async () => {
    const storage = await open()
    await storage.write(async tx =>
      tx.db.updateTable(GOVERNANCE_CENTER_TABLE).set({ center_id: 'NOT-A-CENTER-ID' }).execute(),
    )
    const error = await readOrMintCenterId(storage).then(
      () => undefined,
      (e: unknown) => e,
    )
    expect(error).toMatchObject({ failure: 'malformed' })
    expect(String(error instanceof Error ? error.message : '')).not.toContain('NOT-A-CENTER-ID')
    expect(await rows(storage)).toEqual([{ slot: 'center', center_id: 'NOT-A-CENTER-ID' }])
  })

  it('真并发首启（sqlite）：两个写事务同时读或铸 ⇒ 只铸一次、两者拿到同一个标识', async () => {
    const storage = await open()
    let mints = 0
    const mint = () => {
      mints += 1
      return mintGovernanceCenterId()
    }
    const [a, b] = await Promise.all([
      readOrMintCenterId(storage, mint),
      readOrMintCenterId(storage, mint),
    ])
    expect(a.centerId).toBe(b.centerId)
    expect([a.minted, b.minted].filter(Boolean)).toHaveLength(1)
    expect(mints).toBe(1)
  })

  it.skip('真并发首启（pg）——pg 零运行，归装配第二程（W3-A）', () => {})
})
