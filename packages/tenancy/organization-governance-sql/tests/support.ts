// 包内测试夹具：真 sqlite（storage-sql，临时文件库，无 in-memory）+ 真 Cordis 装配 + 三个包内替身。
// - `account`／`login_state` 表由本文件的**测试用迁移**建出，列与约束名与 tenancy-host「迁移清单」同形；
//   与本包工厂的片段经 `composeMigrations` 合成（不 import account-identity 包的实现）。
// - `accounts`／`logins` 替身服从 AI v2 S-18／S-17 的出口与性质（I-8 冻结形状）：读账号在账号行上落盘「已过期」
//   单调事实；校验登录状态先过 `parseLoginStateId`、先于任何读。替身走**原始**存储实例：
//   本包的故障注入不波及它们，而若本包在自己的事务里嵌套调用它们，存储会报 `StorageDefect`（嵌套检测）。
// - 时间：服从 offer-expiry `Clock` 形状的包内替身，可前推、可答 `'unavailable'`；源码不读墙钟。
// - 夹具里传 `migrations` 的一律写 `upgrade: false`（I-3；storage-sql 升级守卫合回后生效）。
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Kysely, KyselyPlugin, PluginTransformQueryArgs, RootOperationNode } from 'kysely'
import type { Message } from '@deepseek-ai/cordis'
import { type Assembly, bootAssembly } from '@omne-harness-lite/kernel-basis/testing'
import type { Outcome } from '@omne-harness-lite/kernel-basis'
import {
  type AccountId,
  type LoginStateId,
  type OrganizationId,
  type TenantId,
  generateHandoffKeyPair,
  generateOpaqueIdentifier,
  isOk,
  loadVerificationKey,
  parseAccountId,
  parseLoginStateId,
  unwrap,
  type VerificationKey,
} from '@omne-harness-lite/identity-values'
import type { Clock, Instant } from '@omne-harness-lite/offer-expiry'
import {
  composeMigrations,
  type MigrationFragment,
  type ReadTx,
  type Storage,
  type AtomicStorage,
  type StorageUnit,
  StorageUnavailable,
  type WriteTx,
} from '@omne-harness-lite/storage'
import { openStorage, type SqlStorage } from '@omne-harness-lite/storage-sql'
import type { ReadFailure, VerifyLoginFailure } from '@omne-harness-lite/account-identity'
import {
  MEMBERSHIPS_SERVICE,
  OFFERS_SERVICE,
  ORGANIZATIONS_SERVICE,
  ORGANIZATION_PURGE_SERVICE,
} from '@omne-harness-lite/organization-governance/cordis'
import { organizationGovernanceMigrations } from '@omne-harness-lite/organization-governance-sql'
import { organizationGovernancePlugin } from '@omne-harness-lite/organization-governance-sql/cordis'
import {
  type MembershipsService,
  type OffersService,
  type OrganizationGovernanceEventName,
  type OrganizationPurgeService,
  type OrganizationsService,
} from '@omne-harness-lite/organization-governance'

export const DAY = 86_400_000
export const START = Date.UTC(2026, 8, 23, 12, 0, 0) as Instant

export function tempSqliteFile(label: string): string {
  return join(mkdtempSync(join(tmpdir(), `omne-og-${label}-`)), 'db.sqlite')
}

// ---- 与 AI 迁移同形的测试用迁移（account、login_state） ----

export const ACCOUNT_TABLE = 'account'
export const ACCOUNT_ID_COLUMN = 'account_id'
export const OWNER_ACCOUNT_FK = 'organization_owner_account_fk'

export const accountTestMigrations: readonly MigrationFragment[] = [
  {
    name: 'account',
    migration: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async up(db: Kysely<any>) {
        await db.schema
          .createTable(ACCOUNT_TABLE)
          .ifNotExists()
          .addColumn(ACCOUNT_ID_COLUMN, 'text', c => c.notNull())
          .addColumn('login_identifier', 'text', c => c.notNull())
          .addColumn('credential_material', 'text', c => c.notNull())
          .addColumn('activated', 'integer', c => c.notNull())
          .addColumn('produced_at', 'bigint', c => c.notNull())
          .addColumn('retention_deadline', 'bigint', c => c.notNull())
          .addColumn('expired_at', 'bigint')
          .addPrimaryKeyConstraint('account_pkey', [ACCOUNT_ID_COLUMN])
          .execute()
        await db.schema
          .createIndex('account_login_identifier_unique')
          .ifNotExists()
          .unique()
          .on(ACCOUNT_TABLE)
          .column('login_identifier')
          .execute()
      },
    },
  },
  {
    name: 'login_state',
    migration: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async up(db: Kysely<any>) {
        await db.schema
          .createTable('login_state')
          .ifNotExists()
          .addColumn('login_state_id', 'text', c => c.notNull())
          .addColumn('account_id', 'text', c => c.notNull())
          .addColumn('issued_at', 'bigint', c => c.notNull())
          .addColumn('revoked', 'integer', c => c.notNull())
          .addPrimaryKeyConstraint('login_state_pkey', ['login_state_id'])
          .execute()
      },
    },
  },
]

export const ogFragments = organizationGovernanceMigrations({
  ownerAccountReference: { table: ACCOUNT_TABLE, column: ACCOUNT_ID_COLUMN },
  ownerAccountForeignKey: OWNER_ACCOUNT_FK,
})

/** 合成：AI 同形片段在前（外键目标先存在），本包工厂在后。 */
export function composedMigrations() {
  return composeMigrations([...accountTestMigrations, ...ogFragments])
}

/** storage-sql config；带 `migrations` 的一律写 `upgrade: false`。 */
export function storageConfig(file: string) {
  return {
    dialect: 'sqlite' as const,
    file,
    migrations: composedMigrations(),
    upgrade: false as const,
  }
}

// ---- 时间替身 ----

export class TestClock implements Clock {
  #current: Instant
  unavailable = false
  constructor(start: Instant = START) {
    this.#current = start
  }
  get current(): Instant {
    return this.#current
  }
  now(): Instant | 'unavailable' {
    return this.unavailable ? 'unavailable' : this.#current
  }
  /** 只前推，不后退。 */
  advance(ms: number): void {
    if (!Number.isSafeInteger(ms) || ms < 0) throw new RangeError(`advance: ${ms}`)
    this.#current = (this.#current + ms) as Instant
  }
}

// ---- 故障注入：按表名让语句以 StorageUnavailable 失败 ----

function tablesOf(node: unknown, into: Set<string>): Set<string> {
  if (Array.isArray(node)) {
    for (const item of node) tablesOf(item, into)
  } else if (typeof node === 'object' && node !== null) {
    const record = node as Record<string, unknown>
    if (record['kind'] === 'TableNode') {
      const table = record['table'] as { identifier?: { name?: unknown } } | undefined
      const name = table?.identifier?.name
      if (typeof name === 'string') into.add(name)
    }
    for (const value of Object.values(record)) tablesOf(value, into)
  }
  return into
}

/**
 * 本包拿到的 `storage` 服务：委托给真实提供者，另可按条件让触及某些表的语句失败（`StorageUnavailable`）。
 * 失败在语句编译时抛出，与真实的「读不到」同样以异常到达本包。`statements` 数本包发出的语句条数。
 */
export class FaultableStorage implements AtomicStorage {
  /** 返回 true 的语句以 `StorageUnavailable` 失败；`undefined` = 不注入。 */
  failWhen: ((tables: ReadonlySet<string>) => boolean) | undefined
  statements = 0
  readonly #plugin: KyselyPlugin

  constructor(readonly inner: AtomicStorage) {
    this.#plugin = {
      transformQuery: (args: PluginTransformQueryArgs): RootOperationNode => {
        this.statements += 1
        const tables = tablesOf(args.node, new Set())
        if (this.failWhen?.(tables) === true) {
          throw new StorageUnavailable(`injected: ${[...tables].join(',')}`)
        }
        return args.node
      },
      transformResult: async args => args.result,
    }
  }

  atomic<T>(fn: (unit: StorageUnit) => Promise<T>): Promise<T> {
    return this.inner.atomic(unit =>
      fn({
        assertStorage: expected => unit.assertStorage(expected === this ? this.inner : expected),
        run: work => unit.run(work),
        query: work => unit.query(tx => work({ db: tx.db.withPlugin(this.#plugin) })),
        mutate: work =>
          unit.mutate(tx =>
            work({
              db: tx.db.withPlugin(this.#plugin),
              lockRow: (table, key) => tx.lockRow(table, key),
              lockSentinel: name => tx.lockSentinel(name),
            }),
          ),
        afterCommit: notify => unit.afterCommit(notify),
      }),
    )
  }

  failTables(...tables: string[]): void {
    this.failWhen = seen => tables.some(t => seen.has(t))
  }

  failEverything(): void {
    this.failWhen = () => true
  }

  heal(): void {
    this.failWhen = undefined
  }

  read<T>(fn: (tx: ReadTx) => Promise<T>): Promise<T> {
    return this.inner.read(tx => fn({ db: tx.db.withPlugin(this.#plugin) }))
  }

  write<T>(fn: (tx: WriteTx) => Promise<T>): Promise<T> {
    return this.inner.write(tx =>
      fn({
        db: tx.db.withPlugin(this.#plugin),
        lockRow: (table, key) => tx.lockRow(table, key),
        lockSentinel: name => tx.lockSentinel(name),
      }),
    )
  }
}

// ---- accounts／logins 替身（AI v2 S-18／S-17 的出口与性质） ----

type AccountReading = { readonly activated: boolean; readonly retentionExpired: boolean }

export class AccountsStandIn {
  participate(unit: StorageUnit) {
    unit.assertStorage(this.storage)
    return { read: (account: unknown) => unit.run(() => this.read(account, unit)) }
  }
  /** 故障注入：读面整体以 `storage-unavailable` 失败。 */
  unavailable = false
  reads = 0
  constructor(
    private readonly storage: Storage,
    private readonly clock: Clock,
  ) {}

  async read(
    accountId: unknown,
    unit?: StorageUnit,
  ): Promise<Outcome<AccountReading, ReadFailure>> {
    this.reads += 1
    const parsed = parseAccountId(accountId)
    if (!isOk(parsed)) return { failure: 'invalid-input' }
    if (this.unavailable) return { failure: 'storage-unavailable' }
    try {
      // 这个读面会写：首次观测到已过留存期限时在账号行上落盘再返回（单调事实）
      return await (unit ? unit.mutate.bind(unit) : this.storage.write.bind(this.storage))(
        async tx => {
          const row = await tx.db
            .selectFrom(ACCOUNT_TABLE)
            .select(['activated', 'retention_deadline', 'expired_at'])
            .where(ACCOUNT_ID_COLUMN, '=', parsed.ok)
            .executeTakeFirst()
          if (row === undefined) return { failure: 'account-not-found' as const }
          if (row.activated === 1) return { ok: { activated: true, retentionExpired: false } }
          if (row.expired_at !== null) return { ok: { activated: false, retentionExpired: true } }
          const now = this.clock.now()
          if (now === 'unavailable') return { failure: 'storage-unavailable' as const }
          if (now > Number(row.retention_deadline)) {
            await tx.db
              .updateTable(ACCOUNT_TABLE)
              .set({ expired_at: now })
              .where(ACCOUNT_ID_COLUMN, '=', parsed.ok)
              .execute()
            return { ok: { activated: false, retentionExpired: true } }
          }
          return { ok: { activated: false, retentionExpired: false } }
        },
      )
    } catch (error) {
      if (unit === undefined && error instanceof StorageUnavailable)
        return { failure: 'storage-unavailable' }
      throw error
    }
  }
}

export class LoginsStandIn {
  participate(unit: StorageUnit) {
    unit.assertStorage(this.storage)
    return { verify: (login: unknown) => unit.run(() => this.verify(login, unit)) }
  }
  unavailable = false
  verifies = 0
  constructor(private readonly storage: Storage) {}

  async verify(
    loginStateId: unknown,
    unit?: StorageUnit,
  ): Promise<Outcome<AccountId, VerifyLoginFailure>> {
    this.verifies += 1
    // 品牌参数在运行期仍先过 parseLoginStateId，先于任何读（AI 公开入口末段）
    const parsed = parseLoginStateId(loginStateId)
    if (!isOk(parsed)) return { failure: 'invalid-input' }
    if (this.unavailable) return { failure: 'storage-unavailable' }
    try {
      return await (unit ? unit.query.bind(unit) : this.storage.read.bind(this.storage))(
        async tx => {
          const row = await tx.db
            .selectFrom('login_state')
            .innerJoin(
              ACCOUNT_TABLE,
              `${ACCOUNT_TABLE}.${ACCOUNT_ID_COLUMN}`,
              'login_state.account_id',
            )
            .select([
              'login_state.account_id as account_id',
              'login_state.revoked',
              'account.activated',
            ])
            .where('login_state.login_state_id', '=', parsed.ok)
            .executeTakeFirst()
          if (row === undefined || row.revoked === 1 || row.activated !== 1) {
            return { failure: 'login-state-rejected' as const }
          }
          return { ok: unwrap(parseAccountId(row.account_id)) }
        },
      )
    } catch (error) {
      if (unit === undefined && error instanceof StorageUnavailable)
        return { failure: 'storage-unavailable' }
      throw error
    }
  }
}

// ---- 装配 ----

export interface RecordedEvent {
  readonly name: OrganizationGovernanceEventName
  readonly payload: unknown
}

export interface Harness {
  readonly file: string
  readonly raw: SqlStorage
  readonly storage: FaultableStorage
  readonly clock: TestClock
  readonly accounts: AccountsStandIn
  readonly logins: LoginsStandIn
  readonly assembly: Assembly
  readonly organizations: OrganizationsService
  readonly memberships: MembershipsService
  readonly offers: OffersService
  readonly purge: OrganizationPurgeService
  readonly purgeVerificationKey: VerificationKey
  readonly events: RecordedEvent[]
  errorLogs(): readonly Message[]
  dispose(): Promise<void>
}

export const INVITATION_TTL = 7 * DAY
export const AFFILIATION_TTL = 3 * DAY
export const CREATION_KEY_RETENTION = 1 * DAY

export async function bootOg(options: { readonly file?: string } = {}): Promise<Harness> {
  const file = options.file ?? tempSqliteFile('og')
  const raw = await openStorage(storageConfig(file))
  const storage = new FaultableStorage(raw)
  const clock = new TestClock()
  const accounts = new AccountsStandIn(raw, clock)
  const logins = new LoginsStandIn(raw)
  const keys = generateHandoffKeyPair()
  let assembly: Assembly
  try {
    assembly = await bootAssembly({
      services: [
        { name: 'storage', value: storage },
        { name: 'clock', value: clock },
        { name: 'accounts', value: accounts },
        { name: 'logins', value: logins },
      ],
      plugins: [
        {
          plugin: organizationGovernancePlugin,
          config: {
            invitationTtlDefault: INVITATION_TTL,
            affiliationRequestTtlDefault: AFFILIATION_TTL,
            teamCreationKeyRetention: CREATION_KEY_RETENTION,
            purgeSigningKeyPem: keys.privateKeyPem,
          },
        },
      ],
    })
  } catch (error) {
    await raw.close()
    throw error
  }
  const events: RecordedEvent[] = []
  const names: OrganizationGovernanceEventName[] = [
    'invitation.issued',
    'membership.changed',
    'role.changed',
    'affiliation.dissolved',
    'organization.purged',
  ]
  for (const name of names) {
    assembly.ctx.on(name, (payload: unknown) => {
      events.push({ name, payload })
    })
  }
  const ctx = assembly.ctx
  return {
    file,
    raw,
    storage,
    clock,
    accounts,
    logins,
    assembly,
    organizations: ctx.get(ORGANIZATIONS_SERVICE) as OrganizationsService,
    memberships: ctx.get(MEMBERSHIPS_SERVICE) as MembershipsService,
    offers: ctx.get(OFFERS_SERVICE) as OffersService,
    purge: ctx.get(ORGANIZATION_PURGE_SERVICE) as OrganizationPurgeService,
    purgeVerificationKey: unwrap(loadVerificationKey(keys.publicKeyPem)),
    events,
    errorLogs: () =>
      ctx.logger.buffer.filter(m => m.type === 'error' && m.name === 'organization-governance'),
    async dispose() {
      await assembly.dispose()
      await raw.close()
    },
  }
}

// ---- 数据夹具（直接写 AI 同形表：替身的「事实」） ----

export async function addAccount(
  h: Harness,
  options: { readonly activated: boolean; readonly retentionDeadline?: number },
): Promise<AccountId> {
  const id = unwrap(parseAccountId(generateOpaqueIdentifier()))
  await h.raw.write(async tx => {
    await tx.db
      .insertInto(ACCOUNT_TABLE)
      .values({
        [ACCOUNT_ID_COLUMN]: id,
        login_identifier: `user-${id}`,
        credential_material: 'opaque',
        activated: options.activated ? 1 : 0,
        produced_at: h.clock.current,
        retention_deadline: options.retentionDeadline ?? h.clock.current + DAY,
        expired_at: null,
      })
      .execute()
  })
  return id
}

export async function issueLogin(h: Harness, account: AccountId): Promise<LoginStateId> {
  const id = unwrap(parseLoginStateId(generateOpaqueIdentifier()))
  await h.raw.write(async tx => {
    await tx.db
      .insertInto('login_state')
      .values({ login_state_id: id, account_id: account, issued_at: h.clock.current, revoked: 0 })
      .execute()
  })
  return id
}

export async function revokeLogin(h: Harness, loginStateId: LoginStateId): Promise<void> {
  await h.raw.write(async tx => {
    await tx.db
      .updateTable('login_state')
      .set({ revoked: 1 })
      .where('login_state_id', '=', loginStateId)
      .execute()
  })
}

/** 一个已激活、带个人组织的账号（注册主链走完之后的样子）。 */
export async function registeredUser(
  h: Harness,
): Promise<{ readonly account: AccountId; readonly personal: TenantId }> {
  const account = await addAccount(h, { activated: true })
  const created = await h.organizations.createPersonal(account)
  if (!('ok' in created)) throw new Error(`createPersonal failed: ${created.failure}`)
  return { account, personal: created.ok.tenant }
}

/** 一个团队组织：创建者是超管，另加若干已激活账号经邀请加入（给定角色）。 */
export async function teamWith(
  h: Harness,
  members: readonly ('superAdministrator' | 'member')[] = [],
): Promise<{
  readonly organization: OrganizationId
  readonly owner: TenantId
  readonly members: readonly TenantId[]
}> {
  const creator = await registeredUser(h)
  const team = await h.organizations.createTeam(creator.account)
  if (!('ok' in team)) throw new Error(`createTeam failed: ${team.failure}`)
  const owner = team.ok.tenant
  const joined: TenantId[] = []
  for (const role of members) {
    const user = await registeredUser(h)
    const invitation = await h.offers.issueInvitation(owner, user.account, role)
    if (!('ok' in invitation)) throw new Error(`issueInvitation failed: ${invitation.failure}`)
    const accepted = await h.offers.acceptInvitation(user.account, invitation.ok)
    if (!('ok' in accepted)) throw new Error(`acceptInvitation failed: ${accepted.failure}`)
    joined.push(accepted.ok)
  }
  return { organization: team.ok.organization, owner, members: joined }
}

/** 直接查表计数（测试断言「没有多出记录」用）。 */
export async function countRows(
  h: Harness,
  table: string,
  where: Readonly<Record<string, unknown>> = {},
): Promise<number> {
  return h.raw.read(async tx => {
    let query = tx.db.selectFrom(table).select(eb => eb.fn.countAll<number>().as('n'))
    for (const [column, value] of Object.entries(where)) query = query.where(column, '=', value)
    const row = await query.executeTakeFirstOrThrow()
    return Number(row.n)
  })
}

export async function rowsOf(
  h: Harness,
  table: string,
  where: Readonly<Record<string, unknown>> = {},
): Promise<readonly Record<string, unknown>[]> {
  return h.raw.read(async tx => {
    let query = tx.db.selectFrom(table).selectAll()
    for (const [column, value] of Object.entries(where)) query = query.where(column, '=', value)
    return (await query.execute()) as Record<string, unknown>[]
  })
}

/** 成功支取值；不是成功就让测试以那个失败值失败（而不是用类型断言跳过）。 */
export function okOf<T>(result: { readonly ok: T } | { readonly failure: string }): T {
  if (!('ok' in result)) throw new Error(`expected ok, got ${result.failure}`)
  return result.ok
}

export function failureOf(result: unknown): unknown {
  return typeof result === 'object' && result !== null && 'failure' in result
    ? (result as { failure: unknown }).failure
    : result
}
