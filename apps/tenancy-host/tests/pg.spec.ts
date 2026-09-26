// pg 首跑（D-026「只改配置切 pg」；verification：assembly.pg-wiring、assembly.pg-upgrade-atomic、U-3 在 pg 上的真形状；
// 交错 I-12 = AR 包的 I-1／I-2／I-4 在 pg 上重跑；AI「凭据计算挪出写事务后的交错 ②」pg 支；入口层「真并发首启（pg）」；
// AR I-6「撞 account_login_identifier_unique」一支的 pg 变体）。
// 需要 OMNE_TEST_PG_URL 指向一个可连的 PostgreSQL（有建库权限）；每条用例自建一个新库。缺它 ⇒ 整组跳过——**跳过不是通过**。
import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import {
  type GovernanceCenterEntryConfig,
  SERVING_EVENT,
  type ServingNotice,
  governanceCenterEntryPlugin,
} from '@omne-harness-lite/governance-center-entry'
import { ReferenceViolation, type Storage, UniqueViolation } from '@omne-harness-lite/storage'
import { ENV } from '../src/index.ts'
import { type Deployment, deployment } from './support/deployment.ts'
import { fragment } from './support/fragments.ts'
import { Hosts } from './support/host.ts'
import {
  type Composition,
  HOUR,
  NO_VIOLATIONS,
  PASSWORD,
  START,
  accountsOf,
  bootComposition,
  committed,
  personalOrganizationsOf,
  settleTurns,
  stmt,
  track,
  violations,
} from './support/instrumented.ts'
import {
  PUBLIC_HEALTH_BODY,
  REGISTER,
  TLS_FIXTURES,
  bodyOf,
  envelope,
  freePort,
  tlsExchange,
} from './support/wire.ts'

const url = process.env['OMNE_TEST_PG_URL']
// D-040/D-041: the new bounded host rejects PG before opening. These legacy
// composition obligations remain deferred until PG locking is refined; supplying
// a URL must not silently reopen the unsupported composition. Shared storage PG
// conformance remains in packages/infra/storage-sql. This skip is not a pass.
const describePg = describe.skip

const created: string[] = []

/** 新建一个空库，返回它的连接串。 */
async function freshDatabase(): Promise<string> {
  if (url === undefined) throw new Error('OMNE_TEST_PG_URL is not set')
  const name = `w3a_${randomBytes(6).toString('hex')}`
  const admin = new pg.Client({ connectionString: url })
  await admin.connect()
  try {
    await admin.query(`CREATE DATABASE ${name}`)
  } finally {
    await admin.end()
  }
  created.push(name)
  const target = new URL(url)
  target.pathname = `/${name}`
  return target.toString()
}

async function sql<T extends pg.QueryResultRow>(
  connectionString: string,
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    return (await client.query<T>(text, params)).rows
  } finally {
    await client.end()
  }
}

afterAll(async () => {
  if (url === undefined) return
  const admin = new pg.Client({ connectionString: url })
  await admin.connect()
  try {
    for (const name of created) await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
  } finally {
    await admin.end()
  }
})

const hosts = new Hosts()
const compositions: Composition[] = []
/** pg 上 storage-sql 的 close() 以「Called end on pool more than once」拒绝（已报主线）；收尾时记下、不掩盖。 */
const closeFailures: string[] = []
afterEach(async () => {
  for (const c of compositions.splice(0).reverse())
    await c.dispose().catch((error: unknown) => closeFailures.push(String(error)))
  await hosts.stopAll()
})

async function pgDeployment(label: string): Promise<{ d: Deployment; connectionString: string }> {
  const connectionString = await freshDatabase()
  const d = await deployment(label)
  d.env[ENV.storageDialect] = 'postgres'
  d.env[ENV.storageFile] = undefined
  d.env[ENV.storageUrl] = connectionString
  return { d, connectionString }
}

async function thrown(work: Promise<unknown>): Promise<unknown> {
  return work.then(
    () => undefined,
    (error: unknown) => error,
  )
}

describePg('pg 首跑 · 装配（OMNE_TEST_PG_URL）', () => {
  it('assembly.pg-wiring：同一份迁移与装载代码只改方言配置 ⇒ boot() 成功、答复、铸标识；重启标识不变；外键两向与约束名同 sqlite', async () => {
    const { d, connectionString } = await pgDeployment('pg-wiring')
    const first = await hosts.start(d)
    expect(first.host.confirmation).toEqual({
      migrated: true,
      snapshotTaken: false,
      snapshotRemoved: false,
    })
    expect(bodyOf(await tlsExchange(d.port, PUBLIC_HEALTH_BODY))).toMatchObject({
      centerId: first.host.serving.centerId,
    })
    expect(
      bodyOf(
        await tlsExchange(
          d.port,
          envelope(REGISTER, { loginIdentifier: 'pg@example.invalid', credential: PASSWORD }),
        ),
      ),
    ).toEqual({ result: 'registered' })

    const storage = first.host.context.get('storage') as Storage
    const insert = (table: string, row: Record<string, unknown>) =>
      storage.write(async tx => {
        await tx.db.insertInto(table).values(row).execute()
      })
    const missing = await thrown(
      insert('organization', {
        organization_id: 'orphan',
        kind: 'personal',
        parent: null,
        owner_account: 'nobody',
        created_at: 1,
      }),
    )
    expect(missing).toBeInstanceOf(ReferenceViolation)
    expect((missing as ReferenceViolation).kind).toBe('missing-target')
    const [owner] = await sql<{ account_id: string }>(
      connectionString,
      'SELECT account_id FROM account',
    )
    const restricted = await thrown(
      storage.write(async tx => {
        await tx.db
          .deleteFrom('account')
          .where('account_id', '=', owner?.account_id ?? '')
          .execute()
      }),
    )
    expect(restricted).toBeInstanceOf(ReferenceViolation)
    expect((restricted as ReferenceViolation).kind).toBe('delete-restricted')
    const duplicate = await thrown(
      insert('account', {
        account_id: 'x',
        login_identifier: 'pg@example.invalid',
        credential_material: 'm',
        activated: false,
        produced_at: 1,
        retention_deadline: 2,
        expired_at: null,
      }),
    )
    expect((duplicate as UniqueViolation).constraint).toBe('account_login_identifier_unique')
    const pkey = await thrown(insert('governance_center', { slot: 'center', center_id: null }))
    expect((pkey as UniqueViolation).constraint).toBe('governance_center_pkey')
    const fks = await sql<{ conname: string; confdeltype: string; condeferrable: boolean }>(
      connectionString,
      "SELECT conname, confdeltype, condeferrable FROM pg_constraint WHERE contype = 'f'",
    )
    expect(fks).toEqual([
      { conname: 'organization_owner_account_fk', confdeltype: 'r', condeferrable: false },
    ])

    await hosts.stop(first.host)
    expect(first.log.events('upgrade-irreversible')).toHaveLength(1) // 首次在 pg 上迁移：U-3 的具名记录
    const second = await hosts.start(d)
    expect(second.host.serving.centerId).toBe(first.host.serving.centerId)
    expect(second.host.confirmation).toEqual({
      migrated: false,
      snapshotTaken: false,
      snapshotRemoved: false,
    })
    expect(second.log.events('upgrade-irreversible')).toEqual([])
  })

  it('assembly.pg-upgrade-atomic：本版多两个片段、第二个失败 ⇒ 启动失败于迁移；登记与 schema 都回到迁移前（R-U7，一个事务）', async () => {
    const { d, connectionString } = await pgDeployment('pg-atomic')
    const first = await hosts.start(d)
    await hosts.stop(first.host)
    const registeredBefore = await sql<{ name: string }>(
      connectionString,
      'SELECT name FROM kysely_migration ORDER BY name',
    )
    const refused = await hosts.refuse(d, {
      extraMigrations: [fragment('upgrade_probe'), fragment('fail')],
    })
    const tables = await sql<{ table_name: string }>(
      connectionString,
      'SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()',
    )
    expect(tables.map(t => t.table_name)).not.toContain('upgrade_probe')
    expect(await sql(connectionString, 'SELECT name FROM kysely_migration ORDER BY name')).toEqual(
      registeredBefore,
    )
    // 设计期望：具名阶段「迁移」。2026-09-23 首跑实测为 storage-open——storage-sql 的 pg 句柄读写两个 Kysely 共用一个
    // pg.Pool，启动失败收尾里第二次 destroy 抛「Called end on pool more than once」盖掉了原失败（已报主线，未改 packages/*）
    expect(refused.failure.stage).toBe('migration')
  })

  it('U-3 在 pg 上的真形状：迁移提交之后没有快照 ⇒ 不拒起，启动日志恰一条「本次升级不可撤回（U-3）」；迁移后入口层失败撤不回（缺口 U-3，记录现状）', async () => {
    const { d, connectionString } = await pgDeployment('pg-u3')
    const first = await hosts.start(d)
    await hosts.stop(first.host)
    const upgraded = await hosts.start(d, { extraMigrations: [fragment('upgrade_probe')] })
    expect(upgraded.host.confirmation).toEqual({
      migrated: true,
      snapshotTaken: false,
      snapshotRemoved: false,
    })
    expect(upgraded.log.events('upgrade-irreversible')).toHaveLength(1)
    await hosts.stop(upgraded.host)

    // 现状记录：迁移之后入口层端口被占 ⇒ 启动失败，但迁移已提交（pg 上 §6.9 本程不兑现）
    const { occupyPort } = await import('./support/wire.ts')
    const release = await occupyPort(d.port)
    try {
      const refused = await hosts.refuse(d, {
        extraMigrations: [fragment('upgrade_probe'), fragment('upgrade_probe_2')],
      })
      expect(refused.failure.item).toBe('governance-center-entry')
    } finally {
      await release()
    }
    const tables = await sql<{ table_name: string }>(
      connectionString,
      'SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()',
    )
    expect(tables.map(t => t.table_name)).toContain('upgrade_probe_2')
  })

  it('交错 I-9 的 pg 支：属主排他（咨询锁）——A 在役时 B 于「被占」拒绝', async () => {
    const { d } = await pgDeployment('pg-occupied')
    await hosts.start(d)
    const other = await deployment('pg-occupied-b')
    other.env[ENV.storageDialect] = 'postgres'
    other.env[ENV.storageFile] = undefined
    other.env[ENV.storageUrl] = d.env[ENV.storageUrl]
    const refused = await hosts.refuse(other)
    expect(refused.failure.stage).toBe('occupied')
  })
})

describePg(
  'pg 首跑 · 交错 I-12（AR 包 I-1／I-2／I-4 在 pg 上重跑；真实 AI／OG／AR + 本节点的合成迁移）',
  () => {
    async function composition(): Promise<Composition> {
      const c = await bootComposition({
        dialect: 'postgres',
        connectionString: await freshDatabase(),
      })
      compositions.push(c)
      return c
    }
    const activateUpdate = stmt.on('update', 'account', { column: 'activated' })
    const accountInsert = stmt.on('insert', 'account')
    const organizationInsert = stmt.on('insert', 'organization')
    const organizationDelete = stmt.on('delete', 'organization')

    async function accountIdOf(c: Composition, identifier: string): Promise<string> {
      const [row] = await accountsOf(c, identifier)
      if (row === undefined) throw new Error(`no account for ${identifier}`)
      return row.account_id
    }

    it('I-1 S-14 先：③ 在自己的事务里写下激活、尚未提交；期限过去，清除链发起——提交后 ① 现读到已激活 ⇒ accountIsActivated。终态：已激活 ∧ 有个人组织', async () => {
      const c = await composition()
      const inside = c.storage.pauseAfterStatement(activateUpdate)
      const main = track(c.service().register('a-first', PASSWORD))
      await inside.reached
      const accountId = await accountIdOf(c, 'a-first')
      c.clock.advance(HOUR + 1)
      const purge = track(c.service().purgeExpired(accountId))
      await settleTurns(50)
      const purgeSettledWhileHeld = purge.settled()
      inside.release()
      expect(await main.promise).toBe('registered')
      expect(await purge.promise).toEqual({
        from: 'S-53',
        failure: 'accountIsActivated',
        class: 'terminal',
      })
      expect((await personalOrganizationsOf(c)).map(o => o.owner_account)).toEqual([accountId])
      expect(await violations(c)).toEqual(NO_VIOLATIONS)
      // sqlite 上清除链排在 S-14 的写锁后面、放行前不结束；pg 上是行锁——记录实际观察
      expect(purgeSettledWhileHeld).toBe(false)
    })

    it('I-2 清除链 ① 先：② 已提交、依据在手；期限过去，清除链 ① 删组织、尚未提交；③ 排在它后面，提交后现读到已落盘的过期 ⇒ interrupted。终态：没有可用账号、没有孤儿', async () => {
      const c = await composition()
      const afterTwo = c.storage.pauseAfterCommit(committed(organizationInsert))
      const main = track(c.service().register('purge-first', PASSWORD))
      await afterTwo.reached
      const accountId = await accountIdOf(c, 'purge-first')
      c.clock.advance(HOUR + 1)
      const inPurge = c.storage.pauseAfterStatement(organizationDelete)
      const purge = track(c.service().purgeExpired(accountId))
      await inPurge.reached
      afterTwo.release()
      await settleTurns(50)
      const mainSettledWhileHeld = main.settled()
      inPurge.release()
      expect(await main.promise).toBe('interrupted')
      expect(await purge.promise).toBe('ok')
      expect(await accountsOf(c, 'purge-first')).toEqual([])
      expect(await personalOrganizationsOf(c)).toEqual([])
      expect(await violations(c)).toEqual(NO_VIOLATIONS)
      expect(mainSettledWhileHeld).toBe(false)
    })

    it('I-4 插入方向：S-20 读到「未过期」之后、提交之前清除链整条跑完（账号行被删）⇒ S-20 的插入被引用约束拒绝 ⇒ interrupted。终态：什么都没有，没有孤儿组织', async () => {
      const c = await composition()
      let readGate: ReturnType<InstrumentedStorageGate> | undefined
      c.storage.afterCommit(committed(accountInsert), async () => {
        readGate = c.storage.pauseBeforeNextWrite()
      })
      const main = track(c.service().register('b-purge-first', PASSWORD))
      while (readGate === undefined) await settleTurns(1)
      await readGate.reached
      const accountId = await accountIdOf(c, 'b-purge-first')
      c.clock.advance(HOUR + 1)
      expect(await c.service().purgeExpired(accountId)).toBe('ok')
      expect(await accountsOf(c, 'b-purge-first')).toEqual([])
      readGate.release()
      expect(await main.promise).toBe('interrupted')
      expect(await personalOrganizationsOf(c)).toEqual([])
      expect(await violations(c)).toEqual(NO_VIOLATIONS)
    })
  },
)

type InstrumentedStorageGate = Composition['storage']['pauseBeforeNextWrite']

describePg('pg 首跑 · 各包留给 pg 的支', () => {
  async function composition(): Promise<Composition> {
    const c = await bootComposition({
      dialect: 'postgres',
      connectionString: await freshDatabase(),
    })
    compositions.push(c)
    return c
  }

  it('AI「凭据计算挪出写事务之后的交错 ②」pg 支：同标识同凭据两路并发 ⇒ 同一个 AccountId、一行；不同凭据 ⇒ 恰一个账号、另一路 identifier-taken（撞唯一约束那条路）', async () => {
    const c = await composition()
    const same = await Promise.all([
      c.accounts.produce('nina', PASSWORD),
      c.accounts.produce('nina', PASSWORD),
    ])
    expect(same[0]).toHaveProperty('ok')
    expect(same[1]).toStrictEqual(same[0])
    const different = await Promise.all([
      c.accounts.produce('omar', PASSWORD),
      c.accounts.produce('omar', 'another fine secret'),
    ])
    expect(different.filter(r => 'ok' in r)).toHaveLength(1)
    expect(different.filter(r => 'failure' in r)).toStrictEqual([{ failure: 'identifier-taken' }])
    expect(await accountsOf(c)).toHaveLength(2)
  })

  it('AR I-6 撞 account_login_identifier_unique 那一支的 pg 变体：同一标识两路并发注册 ⇒ 恰一路 registered；另一路 identifier-taken，或（撞约束重来之后记录又变了一次 ⇒ AI 答 storage-unavailable）interrupted、重来即 identifier-taken；不变量成立，且至少一轮真的撞到了唯一约束', async () => {
    const c = await composition()
    const observed: string[] = []
    let collisions = 0
    for (let round = 0; round < 5; round += 1) {
      const identifier = `ivy-${String(round)}`
      const before = c.storage.statements.length
      const outcomes = await Promise.all([
        c.service().register(identifier, PASSWORD),
        c.service().register(identifier, 'another fine secret'),
      ])
      const inserts = c.storage.statements
        .slice(before)
        .filter(s => s.kind === 'insert' && s.tables.has('account')).length
      if (inserts >= 2) collisions += 1
      observed.push([...outcomes].sort().join('+'))
      expect(outcomes.filter(o => o === 'registered')).toHaveLength(1)
      const other = outcomes.find(o => o !== 'registered')
      expect(['identifier-taken', 'interrupted']).toContain(other)
      if (other === 'interrupted')
        expect(await c.service().register(identifier, 'another fine secret')).toBe(
          'identifier-taken',
        )
      expect(await accountsOf(c, identifier)).toHaveLength(1)
      expect(await violations(c)).toEqual(NO_VIOLATIONS)
    }
    expect(collisions, `outcomes: ${observed.join(', ')}`).toBeGreaterThan(0)
  })

  it('入口层「真并发首启（pg）」：两个入口层实例同时读或铸 ⇒ 只铸一次、两者开门时报同一个标识', async () => {
    const c = await composition()
    const notices: ServingNotice[] = []
    c.ctx.on(SERVING_EVENT, (notice: ServingNotice) => void notices.push(notice))
    const config = async (): Promise<GovernanceCenterEntryConfig> => ({
      listen: { host: '127.0.0.1', port: await freePort() },
      tls: { certificateChainPem: TLS_FIXTURES.chainPem, privateKeyPem: TLS_FIXTURES.leafKeyPem },
      version: '0.0.0',
      drainTimeoutMs: 1_000,
      clockReadyTimeoutMs: 11_000,
      openSignal: Promise.resolve(),
    })
    const [a, b] = [
      c.ctx.plugin(governanceCenterEntryPlugin, await config()),
      c.ctx.plugin(governanceCenterEntryPlugin, await config()),
    ]
    try {
      await Promise.all([a, b])
      await expect.poll(() => notices.length, { timeout: 5_000 }).toBe(2)
      expect(notices[0]?.centerId).toBe(notices[1]?.centerId)
      const rows = await c.raw.read(async tx =>
        tx.db.selectFrom('governance_center').selectAll().execute(),
      )
      expect(rows).toEqual([{ slot: 'center', center_id: notices[0]?.centerId }])
    } finally {
      await a.dispose()
      await b.dispose()
    }
  })

  it('收尾观察：pg 上 storage-sql 的 close() 是否拒绝（已报主线的缺陷；本条只记录，不作判据）', () => {
    expect(START).toBeGreaterThan(0)
    expect(Array.isArray(closeFailures)).toBe(true)
  })
})
