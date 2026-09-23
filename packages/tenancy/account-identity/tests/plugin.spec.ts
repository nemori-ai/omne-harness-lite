// 插件级：真实 Cordis 装配（kernel-basis bootAssembly）+ 真实 storage-sql + 真实 credential-verification + 包内 Clock 替身。
// S-32／S-47 第 2 支在这里用「同一测试里两次装载同一个库文件」（第一次装配整体撤除、存储实例关闭，再装一次）——
// **这不是完整进程重启**：同一个 Node 进程、同一份模块状态；完整进程重启归 W2-A／W3-A。
import { afterEach, describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import type { Message } from '@deepseek-ai/cordis'
import { CREDENTIALS_SERVICE, credentialsPlugin } from '@omne-harness-lite/credential-verification'
import { generateHandoffKeyPair } from '@omne-harness-lite/identity-values'
import { type Assembly, bootAssembly } from '@omne-harness-lite/kernel-basis/testing'
import {
  type StorageInstance,
  UniqueViolation,
  composedMigrationName,
} from '@omne-harness-lite/storage'
import { STORAGE_SERVICE, storageSqlPlugin } from '@omne-harness-lite/storage-sql'
import {
  ACCOUNTS_SERVICE,
  ACCOUNT_ID_COLUMN,
  ACCOUNT_TABLE,
  type AccountsService,
  LOGINS_SERVICE,
  type LoginsService,
  accountIdentityMigrations,
  accountIdentityPlugin,
} from '../src/index.ts'
import {
  FAST_CREDENTIALS,
  POLICY,
  RETENTION,
  type TestClock,
  type WarrantKeys,
  activationWarrant,
  storageConfig,
  tempSqliteFile,
  testClock,
  warrantKeys,
} from './support.ts'

let assemblies: Assembly[] = []
afterEach(async () => {
  for (const assembly of assemblies.reverse()) await assembly.dispose()
  assemblies = []
})

function aiConfig(keys: WarrantKeys, overrides: Record<string, unknown> = {}) {
  return {
    credentialPolicy: POLICY,
    unactivatedRetention: RETENTION,
    activationVerificationKeyPem: keys.activationPublicPem,
    purgeVerificationKeyPem: keys.purgePublicPem,
    ...overrides,
  }
}

interface Booted {
  readonly assembly: Assembly
  readonly accounts: AccountsService
  readonly logins: LoginsService
  readonly storage: StorageInstance
}

async function boot(
  file: string,
  keys: WarrantKeys,
  clock: TestClock,
  options: { readonly withCredentials?: boolean; readonly config?: Record<string, unknown> } = {},
): Promise<Booted> {
  const assembly = await bootAssembly({
    services: [{ name: 'clock', value: clock }],
    plugins: [
      { plugin: storageSqlPlugin, config: storageConfig(file) },
      ...(options.withCredentials === false
        ? []
        : [{ plugin: credentialsPlugin, config: FAST_CREDENTIALS }]),
      { plugin: accountIdentityPlugin, config: options.config ?? aiConfig(keys) },
    ],
  })
  assemblies.push(assembly)
  return {
    assembly,
    accounts: assembly.ctx.get(ACCOUNTS_SERVICE) as AccountsService,
    logins: assembly.ctx.get(LOGINS_SERVICE) as LoginsService,
    storage: assembly.ctx.get(STORAGE_SERVICE) as StorageInstance,
  }
}

async function shutdown(booted: Booted): Promise<void> {
  await booted.assembly.dispose()
  assemblies = assemblies.filter(a => a !== booted.assembly)
}

async function registerAndLogin(booted: Booted, keys: WarrantKeys, identifier: string) {
  const produced = await booted.accounts.produce(identifier, `${identifier}-password`)
  if (!('ok' in produced)) throw new Error('produce failed')
  expect(await booted.accounts.activate(produced.ok, activationWarrant(keys, produced.ok))).toBe(
    'ok',
  )
  return produced.ok
}

describe('account-identity 插件', () => {
  it('装载：两个服务面在 ACTIVE 后可解析；撤除后两者都消失', async () => {
    const booted = await boot(tempSqliteFile('plugin'), warrantKeys(), testClock())
    expect(booted.accounts).toBeDefined()
    expect(booted.logins).toBeDefined()
    await shutdown(booted)
    expect(booted.assembly.ctx.get(ACCOUNTS_SERVICE)).toBeUndefined()
    expect(booted.assembly.ctx.get(LOGINS_SERVICE)).toBeUndefined()
  })

  it('config 校验：留存期限非正或缺席、公钥缺席、给了私钥、多余成员 ⇒ 启动失败（S-39 参数缺席由启动失败兑现）', async () => {
    const keys = warrantKeys()
    const privateKeyPem = generateHandoffKeyPair().privateKeyPem
    const bad: Record<string, unknown>[] = [
      { unactivatedRetention: 0 },
      { unactivatedRetention: -1 },
      { unactivatedRetention: 1.5 },
      { unactivatedRetention: undefined },
      { activationVerificationKeyPem: undefined },
      { purgeVerificationKeyPem: 'not a pem' },
      { purgeVerificationKeyPem: privateKeyPem },
      { unexpected: true },
    ]
    for (const overrides of bad) {
      await expect(
        boot(tempSqliteFile('bad-config'), keys, testClock(), {
          config: aiConfig(keys, overrides),
        }),
      ).rejects.toThrow()
    }
  })

  it('必需 inject：没有 clock 就不 ACTIVE（PENDING），装配拒绝', async () => {
    const keys = warrantKeys()
    await expect(
      bootAssembly({
        plugins: [
          { plugin: storageSqlPlugin, config: storageConfig(tempSqliteFile('no-clock')) },
          { plugin: accountIdentityPlugin, config: aiConfig(keys) },
        ],
      }),
    ).rejects.toThrow(/PENDING/)
  })

  it('credentials 是可选依赖、调用时解析：缺席时 ACTIVE，凭据步骤 storage-unavailable；提供者后到即可用', async () => {
    const keys = warrantKeys()
    const booted = await boot(tempSqliteFile('optional'), keys, testClock(), {
      withCredentials: false,
    })
    expect(await booted.accounts.produce('ann', 'ann-password')).toStrictEqual({
      failure: 'storage-unavailable',
    })
    expect(await booted.logins.issue('ann', 'ann-password')).toStrictEqual({
      failure: 'storage-unavailable',
    })
    const aiFiber = booted.assembly.fibers.at(-1)
    await booted.assembly.ctx.plugin(credentialsPlugin, FAST_CREDENTIALS)
    expect(booted.assembly.ctx.get(CREDENTIALS_SERVICE)).toBeDefined()
    expect(await booted.accounts.produce('ann', 'ann-password')).toHaveProperty('ok')
    // 解析是调用时的：同一个服务实例、同一条 fiber 就用上了后到的提供者
    expect(booted.assembly.ctx.get(ACCOUNTS_SERVICE)).toBe(booted.accounts)
    expect(booted.assembly.fibers.at(-1)).toBe(aiFiber)
  })

  it('三个事件经 ctx.emit 发出；处理者抛出不改变已提交的事实，记一条诊断', async () => {
    const keys = warrantKeys()
    const booted = await boot(tempSqliteFile('events'), keys, testClock())
    const logged: Message[] = []
    // Cordis 4.0.4 的级别序是 ERROR 0 < INFO 1 < WARN 2 < DEBUG 3，缺省只导出到 INFO；这里要看 warn
    booted.assembly.ctx.logger.exporter({
      levels: { default: 3 },
      export: message => logged.push(message),
    })
    const seen: unknown[] = []
    booted.assembly.ctx.on('account.activated', payload => {
      seen.push(payload)
      throw new Error('listener exploded')
    })
    const produced = await booted.accounts.produce('bo', 'bo-password')
    if (!('ok' in produced)) throw new Error('produce failed')
    expect(await booted.accounts.activate(produced.ok, activationWarrant(keys, produced.ok))).toBe(
      'ok',
    )
    expect(seen).toStrictEqual([{ accountId: produced.ok }])
    expect(await booted.accounts.read(produced.ok)).toStrictEqual({
      ok: { activated: true, retentionExpired: false },
    })
    expect(logged.some(m => JSON.stringify(m.args).includes('event-listener-failed'))).toBe(true)
  })

  it('S-32 退出的持久性 + S-47 第 2 支：同一库文件两次装载（不是完整进程重启），verify 与 exchange 给同一个值；再注入存储读不到', async () => {
    const file = tempSqliteFile('reload')
    const keys = warrantKeys()
    const clock = testClock()
    const first = await boot(file, keys, clock)
    const accountId = await registerAndLogin(first, keys, 'cy')
    const a = await first.logins.issue('cy', 'cy-password')
    const b = await first.logins.issue('cy', 'cy-password')
    if (!('ok' in a) || !('ok' in b)) throw new Error('issue failed')
    expect(await first.logins.revoke(a.ok.loginStateId, a.ok.loginStateId)).toBe('ok')
    await shutdown(first)
    // 撤除后旧存储实例已关：旧服务对象上的调用是「判不出来」
    expect(await first.logins.verify(a.ok.loginStateId)).toStrictEqual({
      failure: 'storage-unavailable',
    })

    const second = await boot(file, keys, clock)
    // 已撤销的：login-state-rejected，不是 storage-unavailable；出示物过 S-44 得同一个值
    expect(await second.logins.verify(a.ok.loginStateId)).toStrictEqual({
      failure: 'login-state-rejected',
    })
    expect(await second.logins.exchange(a.ok.presentation)).toStrictEqual({
      failure: 'login-state-rejected',
    })
    // S-47 ②：未撤销的出示物仍通过，LoginStateId 与重载前逐字相同
    expect(await second.logins.exchange(b.ok.presentation)).toStrictEqual({
      ok: { loginStateId: b.ok.loginStateId, accountId },
    })
    expect(await second.logins.verify(b.ok.loginStateId)).toStrictEqual({ ok: accountId })

    // 同一次演练的另一支：存储读不到 ⇒ storage-unavailable（不是 login-state-rejected），verify 与 exchange 同值
    await second.storage.close()
    expect(await second.logins.verify(a.ok.loginStateId)).toStrictEqual({
      failure: 'storage-unavailable',
    })
    expect(await second.logins.exchange(a.ok.presentation)).toStrictEqual({
      failure: 'storage-unavailable',
    })
  })

  it.skip('S-32／S-47 第 2 支的完整进程重启（另起一个 Node 进程打开同一库）——归 W2-A／W3-A（tenancy-host 可重启装配）', () => {})

  it('迁移片段：一个片段两张表；约束名显式且被存储提供者识别；不建 login_state → account 外键', async () => {
    expect(accountIdentityMigrations.map(f => f.name)).toEqual(['account_identity'])
    expect(composedMigrationName(1, accountIdentityMigrations[0]!)).toBe('0001_account_identity')
    expect(ACCOUNT_TABLE).toBe('account')
    expect(ACCOUNT_ID_COLUMN).toBe('account_id')
    const booted = await boot(tempSqliteFile('schema'), warrantKeys(), testClock())
    const catalog = await booted.storage.read(
      async tx =>
        (await tx.db
          .selectFrom('sqlite_master')
          .select(['type', 'name'])
          .where('name', 'not like', 'sqlite_%')
          .where('name', 'not like', 'kysely_%')
          .orderBy('name')
          .execute()) as { type: string; name: string }[],
    )
    expect(catalog).toEqual([
      { type: 'table', name: 'account' },
      { type: 'index', name: 'account_login_identifier_unique' },
      { type: 'table', name: 'login_state' },
      { type: 'index', name: 'login_state_account_id_index' },
    ])
    const foreignKeys = await booted.storage.read(
      async tx =>
        (await sql`SELECT * FROM pragma_foreign_key_list('login_state')`.execute(tx.db)).rows,
    )
    expect(foreignKeys).toEqual([])
    // 三个约束名都能被提供者映射回来（S-13／S-15 按约束名分流）
    const row = {
      account_id: 'dup-account',
      login_identifier: 'dup',
      credential_material: 'm',
      activated: 0,
      produced_at: 1,
      retention_deadline: 2,
      expired_at: null,
    }
    const violation = (fn: () => Promise<unknown>) =>
      fn().then(
        () => undefined,
        (error: unknown) => (error instanceof UniqueViolation ? error.constraint : error),
      )
    await booted.storage.write(tx => tx.db.insertInto('account').values(row).execute())
    expect(
      await violation(() =>
        booted.storage.write(tx =>
          tx.db
            .insertInto('account')
            .values({ ...row, login_identifier: 'other' })
            .execute(),
        ),
      ),
    ).toBe('account_pkey')
    expect(
      await violation(() =>
        booted.storage.write(tx =>
          tx.db
            .insertInto('account')
            .values({ ...row, account_id: 'other' })
            .execute(),
        ),
      ),
    ).toBe('account_login_identifier_unique')
    const state = { login_state_id: 'dup-state', account_id: 'x', issued_at: 1, revoked: 0 }
    await booted.storage.write(tx => tx.db.insertInto('login_state').values(state).execute())
    expect(
      await violation(() =>
        booted.storage.write(tx => tx.db.insertInto('login_state').values(state).execute()),
      ),
    ).toBe('login_state_pkey')
  })
})
