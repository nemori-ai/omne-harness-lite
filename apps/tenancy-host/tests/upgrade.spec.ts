// @module-tag slow
// 归慢层：整套装配＋真库＋网络：进程内反复起停完整中心（SQLite 文件库的升级、快照与恢复），经本地 TLS 入口写入数据。
// 升级的整体性（verification：assembly.upgrade-preflight-refuses、assembly.upgrade-restore-on-boot-failure、
// assembly.upgrade-confirmed 含交错守卫支、断言支、U-3 反向支、显式守卫支）。
// 「上一版」= 本节点现在的合成序列；「本版」= 经测试钩子在末尾多一个片段（M-9：只追加）。sqlite 临时文件库。
import { chmodSync, existsSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness-lite/cordis-plugin-tree'
import { composeMigrations } from '@omne-harness-lite/storage'
import {
  StorageStartupFailure,
  createUpgradeGuard,
  openStorage,
} from '@omne-harness-lite/storage-sql'
import {
  buildDistributionTree,
  readHostConfig,
  DATA_FORMAT_CHECK,
  hostMigrationFragments,
} from '../src/index.ts'
import {
  type Deployment,
  centerIdOf,
  deployment,
  dumpDatabase,
  execute,
  query,
  sidecarsOf,
  asEnv,
  tablesOf,
} from './support/deployment.ts'
import { fragment } from './support/fragments.ts'
import { Hosts, allDisposed, failureRecords } from './support/host.ts'
import { REGISTER, bodyOf, envelope, occupyPort, tlsExchange } from './support/wire.ts'

const hosts = new Hosts()
const restores: (() => void | Promise<void>)[] = []
afterEach(async () => {
  for (const restore of restores.splice(0).reverse()) await restore()
  await hosts.stopAll()
})

/** 上一版起一次、经线上注册一个账号、停下：一份「有数据的库」。返回那时的中心标识。 */
async function seeded(label: string): Promise<{ d: Deployment; centerId: string }> {
  const d = await deployment(label)
  const { host } = await hosts.start(d)
  const reply = await tlsExchange(
    d.port,
    envelope(REGISTER, {
      loginIdentifier: 'ada@example.invalid',
      credential: 'correct horse battery',
    }),
  )
  expect(bodyOf(reply)).toEqual({ result: 'registered' })
  await hosts.stop(host)
  return { d, centerId: host.serving.centerId }
}

describe('AI3 append preserves the released host migration prefix', () => {
  it('opens an actual database with the nine old global migrations and appends the bounded migration', async () => {
    const d = await deployment('bounded-prefix')
    const oldNames = [
      '0001_account_identity',
      '0002_organization',
      '0003_membership',
      '0004_invitation',
      '0005_affiliation_request',
      '0006_current_tenant_selection',
      '0007_team_creation_key',
      '0008_clock_lease',
      '0009_governance_center',
    ]
    const storage = await openStorage({
      dialect: 'sqlite',
      file: d.file,
      synchronous: 'full',
      migrations: composeMigrations(hostMigrationFragments.slice(0, 9)),
      upgrade: false,
    })
    const centerId = '1234567890abcdef1234567890abcdef'
    await storage.write(tx =>
      tx.db.updateTable('governance_center').set({ center_id: centerId }).execute(),
    )
    await storage.close()
    expect(
      query<{ name: string }>(d.file, 'SELECT name FROM kysely_migration ORDER BY name').map(
        r => r.name,
      ),
    ).toEqual(oldNames)
    const first = await hosts.start(d)
    expect(first.host.serving.centerId).toBe(centerId)
    await hosts.stop(first.host)
    expect(
      query<{ name: string }>(d.file, 'SELECT name FROM kysely_migration ORDER BY name').map(
        r => r.name,
      ),
    ).toEqual([...oldNames, '0010_account_identity_bounded_logins'])
    const second = await hosts.start(d)
    expect(second.host.serving.centerId).toBe(centerId)
    await hosts.stop(second.host)
  })
})

describe('assembly.upgrade-preflight-refuses：只读核对不过 ⇒ 不碰数据', () => {
  it('① 迁移登记里多一个本版本不认识的名字（更新的版本写过这份库）⇒ 拒绝、点名那个迁移；库的内容与字节都不变、没有建快照', async () => {
    const d = await deployment('newer')
    const newer = await hosts.start(d, { extraMigrations: [fragment('upgrade_probe')] })
    await hosts.stop(newer.host)
    const bytes = readFileSync(d.file)
    const before = dumpDatabase(d.file)
    // dumpDatabase 自己也开关过一次；上一次都是干净关闭（预写日志为空），字节以此刻为准
    const clean = readFileSync(d.file)

    const refused = await hosts.refuse(d)
    expect(refused.failure.stage).toBe('preflight')
    expect(refused.failure.message).toContain(`check "${DATA_FORMAT_CHECK}" refused`)
    expect(refused.failure.message).toContain('"0011_upgrade_probe"')
    expect(failureRecords(refused.log)).toHaveLength(1)
    expect(allDisposed(refused.fibers)).toBe(true)
    expect(readFileSync(d.file).equals(clean)).toBe(true)
    expect(bytes.length).toBeGreaterThan(0)
    expect(dumpDatabase(d.file)).toEqual(before)
    expect(sidecarsOf(d.file).snapshot).toBe(false)
  })

  it('② clock_lease.written_at 在墙钟之后 ⇒ 在跑任何迁移之前拒绝（钟比中心用过的最晚时刻早），库的内容不变', async () => {
    const { d } = await seeded('rollback-preflight')
    const future = Date.now() + 3_600_000
    execute(
      `${d.file}.clock.sqlite`,
      'UPDATE clock_lease SET written_at = ?, lease_until = ?',
      future,
      future,
    )
    const before = dumpDatabase(d.file)
    const refused = await hosts.refuse(d, { extraMigrations: [fragment('upgrade_probe')] })
    expect(refused.failure.stage).toBe('preflight')
    expect(refused.failure.message).toContain('check "clock-rolled-back" refused')
    expect(refused.failure.message).toContain('is earlier than the latest time the center used')
    expect(dumpDatabase(d.file)).toEqual(before)
    expect(tablesOf(d.file)).not.toContain('upgrade_probe')
    expect(sidecarsOf(d.file).snapshot).toBe(false)
  })

  for (const registry of ['保留', '清空'] as const) {
    it(`③ 中心标识表丢了（迁移登记${registry}）⇒ 非空数据里没有中心标识表、拒绝；没有重建那张表、没有铸出新标识`, async () => {
      const { d } = await seeded(`center-table-${registry === '保留' ? 'kept' : 'cleared'}`)
      execute(d.file, 'DROP TABLE governance_center')
      if (registry === '清空') execute(d.file, 'DELETE FROM kysely_migration')
      const before = dumpDatabase(d.file)
      const refused = await hosts.refuse(d)
      expect(refused.failure.stage).toBe('preflight')
      expect(refused.failure.message).toContain('check "governance-center-table-missing" refused')
      expect(dumpDatabase(d.file)).toEqual(before)
      expect(tablesOf(d.file)).not.toContain('governance_center')
    })
  }

  it('反向：空库照常通过；登记序列是本次序列的真前缀 ⇒ 核对通过、只跑差的那几条', async () => {
    const { d, centerId } = await seeded('prefix')
    const { host } = await hosts.start(d, { extraMigrations: [fragment('upgrade_probe')] })
    expect(host.serving.centerId).toBe(centerId)
    expect(host.confirmation).toEqual({
      migrated: true,
      snapshotTaken: true,
      snapshotRemoved: true,
    })
    const names = query<{ name: string }>(d.file, 'SELECT name FROM kysely_migration ORDER BY name')
    expect(names.map(n => n.name).at(-1)).toBe('0011_upgrade_probe')
    expect(names).toHaveLength(11)
  })
})

describe('assembly.upgrade-restore-on-boot-failure：确认之前的任何启动失败都撤回升级', () => {
  async function refusedUpgrade(
    label: string,
    failWith: (d: Deployment) => Promise<void> | void,
    extra = [fragment('upgrade_probe')],
  ) {
    const seed = await seeded(label)
    const before = dumpDatabase(seed.d.file)
    await failWith(seed.d)
    const refused = await hosts.refuse(seed.d, { extraMigrations: extra })
    expect(allDisposed(refused.fibers)).toBe(true)
    // 附属文件里没有升级后的写：恢复删掉了附属文件再换回快照；逐表比对回到升级前
    const files = sidecarsOf(seed.d.file)
    expect(files).toEqual({ db: true, wal: false, shm: false, snapshot: false })
    expect(dumpDatabase(seed.d.file)).toEqual(before)
    expect(tablesOf(seed.d.file)).not.toContain('upgrade_probe')
    return { ...seed, refused }
  }

  async function oldVersionStillStarts(d: Deployment, centerId: string) {
    const again = await hosts.start(d)
    expect(again.host.serving.centerId).toBe(centerId)
    expect(again.host.confirmation.migrated).toBe(false)
  }

  it('入口层端口被占 ⇒ 拒绝；库回到升级前，上一版照常能起、中心标识不变', async () => {
    let release: (() => Promise<void>) | undefined
    const { d, centerId, refused } = await refusedUpgrade('port', async d => {
      release = await occupyPort(d.port)
    })
    expect(refused.failure).toMatchObject({ stage: 'plugin', item: 'governance-center-entry' })
    await release?.()
    await oldVersionStillStarts(d, centerId)
  })

  it('迁移期间独立 Clock 底线提高：启动拒绝，业务回滚不降低 Clock 底线', async () => {
    const { d, centerId } = await seeded('independent-clock-rollback')
    const before = dumpDatabase(d.file)
    const clockFile = `${d.file}.clock.sqlite`
    const previous = query<{ written_at: number; lease_until: number }>(
      clockFile,
      'SELECT written_at,lease_until FROM clock_lease',
    )[0]!
    const future = Date.now() + 3_600_000
    const refused = await hosts.refuse(d, {
      extraMigrations: [
        fragment('upgrade_probe'),
        {
          name: 'independent_clock_fault',
          migration: {
            async up() {
              execute(
                clockFile,
                'UPDATE clock_lease SET written_at=?, lease_until=?',
                future,
                future,
              )
            },
          },
        },
      ],
    })
    expect(refused.failure).toMatchObject({ stage: 'plugin', item: 'clock-lease' })
    expect(refused.failure.message).toContain('ClockRollbackDetected')
    expect(allDisposed(refused.fibers)).toBe(true)
    expect(dumpDatabase(d.file)).toEqual(before)
    expect(sidecarsOf(d.file)).toEqual({ db: true, wal: false, shm: false, snapshot: false })
    expect(query(clockFile, 'SELECT written_at,lease_until FROM clock_lease')).toEqual([
      { written_at: future, lease_until: future },
    ])
    // Remove only the fixture's corruption. Product rollback must not do this.
    execute(
      clockFile,
      'UPDATE clock_lease SET written_at=?, lease_until=?',
      previous.written_at,
      previous.lease_until,
    )
    await oldVersionStillStarts(d, centerId)
  })

  it('运维面套接字目录权限过宽 ⇒ 拒绝；库回到升级前', async () => {
    const { d, centerId, refused } = await refusedUpgrade('ops-dir', d =>
      chmodSync(d.socketDirectory, 0o755),
    )
    expect(refused.failure).toMatchObject({ stage: 'plugin', item: 'governance-center-ops' })
    chmodSync(d.socketDirectory, 0o700)
    await oldVersionStillStarts(d, centerId)
  })

  describe('首次启动支：库文件与附属文件都不存在，下一次启动仍是第一次（S-28 ③）', () => {
    async function firstStartRefused(
      label: string,
      prepare: (d: Deployment) => Promise<(() => void | Promise<void>) | void>,
      extra = [] as ReturnType<typeof fragment>[],
    ) {
      const d = await deployment(label)
      const undo = await prepare(d)
      const refused = await hosts.refuse(d, { extraMigrations: extra })
      expect(allDisposed(refused.fibers)).toBe(true)
      expect(sidecarsOf(d.file)).toEqual({ db: false, wal: false, shm: false, snapshot: false })
      if (undo !== undefined) await undo()
      const first = await hosts.start(d)
      expect(first.host.confirmation).toEqual({
        migrated: true,
        snapshotTaken: true,
        snapshotRemoved: true,
      })
      return refused
    }

    it('运维面套接字目录权限过宽', async () => {
      const refused = await firstStartRefused('first-ops', async d => {
        chmodSync(d.socketDirectory, 0o750)
        return () => chmodSync(d.socketDirectory, 0o700)
      })
      expect(refused.failure.item).toBe('governance-center-ops')
    })

    it('入口层端口被占', async () => {
      const refused = await firstStartRefused('first-port', async d => occupyPort(d.port))
      expect(refused.failure.item).toBe('governance-center-entry')
    })

    it('铸中心标识的那次写失败（入口层读或铸抛出）', async () => {
      const d = await deployment('first-mint')
      const refused = await hosts.refuse(d, { extraMigrations: [fragment('block_center_mint')] })
      expect(refused.failure).toMatchObject({ stage: 'plugin', item: 'governance-center-entry' })
      expect(sidecarsOf(d.file)).toEqual({ db: false, wal: false, shm: false, snapshot: false })
      const first = await hosts.start(d)
      expect(first.host.confirmation.snapshotTaken).toBe(true)
    })
  })

  it('撤除路径上恢复失败（R-U8）：迁移之后快照所在目录不可写、再让入口层端口被占 ⇒ 撤完、boot() 拒绝于「升级未确认」，写出快照位置、快照仍在；目录恢复后上一版照常能起', async () => {
    const seed = await seeded('restore-fails')
    const release = await occupyPort(seed.d.port)
    restores.push(() => chmodSync(seed.d.root, 0o700))
    const refused = await hosts.refuse(seed.d, {
      extraMigrations: [
        fragment('upgrade_probe'),
        fragment('lock_directory', { directory: seed.d.root }),
      ],
    })
    await release()
    const snapshot = `${seed.d.file}.upgrade-snapshot`
    expect(refused.failure.stage).toBe('upgrade-unconfirmed')
    expect(refused.failure.snapshot).toBe(snapshot)
    expect(refused.failure.message).toContain(snapshot)
    expect(refused.failure.message).not.toMatch(/restored/i)
    expect(refused.failure.message).not.toContain('restoring the upgrade snapshot failed')
    expect(refused.failure.message).toContain('restoration is not confirmed')
    expect(allDisposed(refused.fibers)).toBe(true)
    expect(existsSync(snapshot)).toBe(true)
    const [record] = failureRecords(refused.log)
    expect(record).toMatchObject({ stage: 'upgrade-unconfirmed', snapshot })
    // 下一次启动先恢复遗留快照（R-U5），再按升级前的库起来
    chmodSync(seed.d.root, 0o700)
    const again = await hosts.start(seed.d)
    expect(again.host.serving.centerId).toBe(seed.centerId)
    expect(existsSync(snapshot)).toBe(false)
    expect(tablesOf(seed.d.file)).not.toContain('upgrade_probe')
  })
})

describe('assembly.upgrade-confirmed：确认绑在实例上，确认之后不再恢复', () => {
  it('有待跑迁移 ⇒ migrated／snapshotTaken／snapshotRemoved 皆真、快照已不在；没有待跑迁移 ⇒ 三者皆假；之后 dispose 与再次 boot 都不动库', async () => {
    const { d } = await seeded('confirmed')
    const upgraded = await hosts.start(d, { extraMigrations: [fragment('upgrade_probe')] })
    expect(upgraded.host.confirmation).toEqual({
      migrated: true,
      snapshotTaken: true,
      snapshotRemoved: true,
    })
    expect(sidecarsOf(d.file).snapshot).toBe(false)
    await hosts.stop(upgraded.host)
    const after = dumpDatabase(d.file)
    expect(after.rows['upgrade_probe']).toEqual([{ id: 'row' }])
    const again = await hosts.start(d, { extraMigrations: [fragment('upgrade_probe')] })
    expect(again.host.confirmation).toEqual({
      migrated: false,
      snapshotTaken: false,
      snapshotRemoved: false,
    })
    await hosts.stop(again.host)
    expect(dumpDatabase(d.file)).toEqual(after)
  })

  it('交错守卫对象：给存储的是守卫 A、确认时调另一个 createUpgradeGuard() 的 B ⇒ UpgradeGuardNotAttached ⇒ 从未开闸、逆序全撤、快照恢复、拒绝并点名守卫没挂上', async () => {
    const { d } = await seeded('interleaved-guard')
    const before = dumpDatabase(d.file)
    const refused = await hosts.refuse(d, {
      extraMigrations: [fragment('upgrade_probe')],
      confirmWith: () => createUpgradeGuard(),
    })
    expect(refused.failure.stage).toBe('upgrade-confirm')
    expect(refused.failure.message).toContain('UpgradeGuardNotAttached')
    expect(refused.log.events('open-signal')).toEqual([])
    expect(refused.log.events('serving')).toEqual([])
    expect(allDisposed(refused.fibers)).toBe(true)
    expect(dumpDatabase(d.file)).toEqual(before)
  })

  it('断言支：确认报 snapshotTaken 而没删到快照 ⇒ 兑现之前拒绝「升级确认没有删到快照」，库回到升级前', async () => {
    const { d } = await seeded('assertion')
    const before = dumpDatabase(d.file)
    const refused = await hosts.refuse(d, {
      extraMigrations: [fragment('upgrade_probe')],
      confirmWith: () => ({
        confirm: async () => ({ migrated: true, snapshotTaken: true, snapshotRemoved: false }),
      }),
    })
    expect(refused.failure.stage).toBe('upgrade-confirm')
    expect(refused.failure.message).toContain('did not remove the snapshot')
    expect(refused.log.events('open-signal')).toEqual([])
    expect(dumpDatabase(d.file)).toEqual(before)
  })

  it('U-3 反向支：确认报 migrated ∧ ¬snapshotTaken（pg 的形状）⇒ 不拒起，启动日志里恰有一条具名「本次升级不可撤回（U-3）」', async () => {
    const { d } = await seeded('u3')
    const { log } = await hosts.start(d, {
      extraMigrations: [fragment('upgrade_probe')],
      // 真确认一次（否则撤除时快照会被恢复），再报 pg 的形状
      confirmWith: attached => ({
        confirm: async () => {
          await attached.confirm()
          return { migrated: true, snapshotTaken: false, snapshotRemoved: false }
        },
      }),
    })
    const irreversible = log.events('upgrade-irreversible')
    expect(irreversible).toHaveLength(1)
    expect(irreversible[0]).toMatchObject({ level: 'warn', gap: 'U-3' })
    expect(String(irreversible[0]?.['message'])).toContain('本次升级不可撤回（U-3）')
    // 正常路径上没有这条
    const plain = await deployment('u3-plain')
    const normal = await hosts.start(plain)
    expect(normal.log.events('upgrade-irreversible')).toEqual([])
  })

  describe('显式守卫支（N-5）', () => {
    function isConfig(
      value: JsonValue | undefined,
    ): value is { readonly [key: string]: JsonValue } {
      return typeof value === 'object' && value !== null && !Array.isArray(value)
    }
    async function storageConfig(d: Deployment) {
      const rows = buildDistributionTree(await readHostConfig(asEnv(d)), {
        backupDirectory: `${d.root}/backups`,
        sourceBuildId: null,
        migrationNames: ['test'],
      })
      const config = rows.find(row => row.id === 'storage-sql')?.config
      if (!isConfig(config)) throw new Error('missing SQL config')
      return config
    }

    it('missing startup with maintenance refuses Config before opening the database', async () => {
      const d = await deployment('no-upgrade')
      const { startup: _dropped, ...rest } = await storageConfig(d)
      const refused = await hosts.refuse(d, {}, undefined, [
        { op: 'replace', id: 'storage-sql', config: rest },
      ])
      expect(refused.failure).toMatchObject({
        stage: 'plugin',
        item: 'storage-sql',
        cause: { code: 'invalid-config' },
      })
      expect(sidecarsOf(d.file).db).toBe(false)
    })

    it('plain startup with maintenance refuses Config before database, lock or snapshot creation', async () => {
      const d = await deployment('upgrade-false-host')
      const refused = await hosts.refuse(d, {}, undefined, [
        {
          op: 'replace',
          id: 'storage-sql',
          config: { ...(await storageConfig(d)), startup: 'plain' },
        },
      ])
      expect(refused.failure).toMatchObject({
        stage: 'plugin',
        item: 'storage-sql',
        cause: { code: 'invalid-config' },
      })
      expect(existsSync(d.file)).toBe(false)
      expect(existsSync(`${d.file}.owner-lock`)).toBe(false)
      expect(sidecarsOf(d.file).snapshot).toBe(false)
    })

    it('存储提供者层面：upgrade: false 照常打开、不取独占（另一个属主同时拿得到锁）', async () => {
      const d = await deployment('upgrade-false-storage')
      const plain = await openStorage({
        dialect: 'sqlite',
        file: d.file,
        migrations: composeMigrations(hostMigrationFragments),
        upgrade: false,
      })
      const guard = createUpgradeGuard()
      const owner = await openStorage({
        dialect: 'sqlite',
        file: d.file,
        migrations: composeMigrations(hostMigrationFragments),
        upgrade: { checks: [], guard },
      })
      expect(await guard.confirm()).toEqual({
        migrated: false,
        snapshotTaken: false,
        snapshotRemoved: false,
      })
      await owner.close()
      await plain.close()
      const missing = await openStorage({
        dialect: 'sqlite',
        file: d.file,
        migrations: composeMigrations(hostMigrationFragments),
      } as never).then(
        () => undefined,
        (error: unknown) => error,
      )
      expect(String(missing)).toContain('upgrade must be given explicitly')
      expect(missing).not.toBeInstanceOf(StorageStartupFailure)
    })
  })
})

describe('AI S-46 ① 的快照部分：翻装配留下的升级快照，里面没有能用的出示物', () => {
  it('确认之前停住，快照里每一段可打印串交给 S-44 都换不出身份；三个出示物以任何形式都不在快照里', async () => {
    const { d } = await seeded('s46')
    // 上一版里登录三次，拿到三个出示物
    const first = await hosts.start(d)
    const presentations: string[] = []
    for (let i = 0; i < 3; i += 1) {
      const reply = bodyOf(
        await tlsExchange(
          d.port,
          envelope('capability.account-identity/v3#S-15', {
            loginIdentifier: 'ada@example.invalid',
            credential: 'correct horse battery',
          }),
        ),
      ) as { result: { loginStateHandle: string; loginState: string } }
      // loginState 是出示物；loginStateHandle 是 LoginStateId（v2 里不是秘密）
      presentations.push(reply.result.loginState)
    }
    await hosts.stop(first.host)

    const snapshot = `${d.file}.upgrade-snapshot`
    let snapshotBytes: Buffer | undefined
    const { host } = await hosts.start(d, {
      extraMigrations: [fragment('upgrade_probe')],
      beforeConfirm: () => {
        // 只读字节，不打开它（打开快照会生 -wal／-shm：运维约定不要直接打开快照文件）
        snapshotBytes = readFileSync(snapshot)
      },
    })
    if (snapshotBytes === undefined) throw new Error('no snapshot was taken')
    const bytes = snapshotBytes
    for (const presentation of presentations) {
      for (const form of [
        presentation,
        Buffer.from(presentation).toString('base64'),
        Buffer.from(presentation).toString('hex'),
      ])
        expect(bytes.includes(Buffer.from(form, 'utf8'))).toBe(false)
    }
    const runs = (bytes.toString('latin1').match(/[\x21-\x7e]{16,}/g) ?? []).slice(0, 400)
    expect(runs.length).toBeGreaterThan(0)
    const logins = host.context.get('logins') as { exchange(p: unknown): Promise<unknown> }
    for (const run of runs) expect(await logins.exchange(run)).not.toHaveProperty('ok')
    // 正对照：真的出示物照常换得出
    expect(await logins.exchange(presentations[0])).toHaveProperty('ok')
  })
})

describe('运维约定的依据：直接打开快照文件会生附属文件', () => {
  it('以 sqlite 打开一份快照即在旁边生出 -wal／-shm（所以运维说明写「不要直接打开快照文件」）', async () => {
    const { d } = await seeded('open-snapshot')
    const snapshot = `${d.file}.upgrade-snapshot`
    await hosts.start(d, {
      extraMigrations: [fragment('upgrade_probe')],
      beforeConfirm: () => {
        const db = new DatabaseSync(snapshot, { readOnly: false })
        try {
          db.prepare('SELECT count(*) FROM account').get()
          expect(existsSync(`${snapshot}-wal`) || existsSync(`${snapshot}-shm`)).toBe(true)
        } finally {
          db.close()
        }
      },
    })
    expect(centerIdOf(d.file)).not.toBeNull()
  })
})
