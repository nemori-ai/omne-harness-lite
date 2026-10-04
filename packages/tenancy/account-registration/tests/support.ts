// 包内测试夹具：真实组合。
// - 存储：真实 storage-sql（临时 sqlite 文件，无 in-memory）；迁移用 `composeMigrations` 把 AI、OG、clock 三家的片段合成，
//   OG 那条外键的目标表与列取自 AI 导出的常量，不写字面量；带 `migrations` 一律 `upgrade: false`。
// - 参与方：真实的 account-identity、organization-governance 插件与本包的 registration 插件，装在同一个真实 Cordis Context 里。
// - 时间：缺省用真实 `clock` 插件；需要前推时间的场景用服从 offer-expiry `Clock` 形状的包内替身。
// - 凭据：真实 credential-verification 插件（scrypt 低代价测试参数 N=1024，只为跑得快）。
// - 故障与交错：`InstrumentedStorage` 包在真实存储外面，按语句（种类、表、更新的列）注入 `StorageUnavailable`、
//   在事务内某条语句之后停住、让某次提交回滚、或在某次提交成立之后、返回调用方之前停住。
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import type { Context, Fiber, Message, Plugin } from '@deepseek-ai/cordis'
import type {
  KyselyPlugin,
  PluginTransformQueryArgs,
  PluginTransformResultArgs,
  QueryId,
  RootOperationNode,
} from 'kysely'
import {
  ACCOUNT_ID_COLUMN,
  ACCOUNT_TABLE,
  ACCOUNTS_SERVICE,
  type AccountsService,
  LOGINS_SERVICE,
  type LoginsService,
  accountIdentityMigrations,
  accountIdentityPlugin,
} from '@omne-harness-lite/account-identity'
import { clockMigrations, clockPlugin } from '@omne-harness-lite/clock'
import { credentialsPlugin } from '@omne-harness-lite/credential-verification'
import {
  type AccountId,
  type HandoffKeyPairPem,
  generateHandoffKeyPair,
} from '@omne-harness-lite/identity-values'
import { type Assembly, bootAssembly } from '@omne-harness-lite/kernel-basis/testing'
import {
  ORGANIZATION_PURGE_SERVICE,
  ORGANIZATIONS_SERVICE,
} from '@omne-harness-lite/organization-governance/cordis'
import {
  type OrganizationPurgeService,
  type OrganizationsService,
} from '@omne-harness-lite/organization-governance'
import { organizationGovernanceMigrations } from '@omne-harness-lite/organization-governance-sql'
import { organizationGovernancePlugin } from '@omne-harness-lite/organization-governance-sql/cordis'
import {
  type ReadTx,
  type Storage,
  type AtomicStorage,
  type StorageUnit,
  StorageDefect,
  StorageUnavailable,
  type WriteTx,
  composeMigrations,
} from '@omne-harness-lite/storage'
import { openStorage, type SqlStorage } from '@omne-harness-lite/storage-sql'
import {
  REGISTRATION_SERVICE,
  type RegistrationDefectRecord,
  type RegistrationService,
  registrationPlugin,
} from '../src/index.ts'

export const HOUR = 3_600_000
export const DAY = 24 * HOUR
export const START = Date.UTC(2026, 8, 23, 12, 0, 0)
export const PASSWORD = 'correct horse battery'
export const OTHER_PASSWORD = 'another fine secret'
export const OWNER_ACCOUNT_FK = 'organization_owner_account_fk'

export function tempSqliteFile(label: string): string {
  return join(mkdtempSync(join(tmpdir(), `omne-ar-${label}-`)), 'db.sqlite')
}

/** 三家片段合成一份迁移：AI 在前（外键目标先存在），OG 的外键目标从 AI 常量取，clock 在后。 */
export function composedMigrations() {
  return composeMigrations([
    ...accountIdentityMigrations,
    ...organizationGovernanceMigrations({
      ownerAccountReference: { table: ACCOUNT_TABLE, column: ACCOUNT_ID_COLUMN },
      ownerAccountForeignKey: OWNER_ACCOUNT_FK,
    }),
    ...clockMigrations,
  ])
}

// ---- 时间替身：offer-expiry `Clock` 形状（now(): Instant | 'unavailable'），可前推、可回拨、可答 'unavailable' ----

export class TestClock {
  #current = START
  unavailable = false
  get current(): number {
    return this.#current
  }
  now(): number | 'unavailable' {
    return this.unavailable ? 'unavailable' : this.#current
  }
  advance(ms: number): void {
    this.#current += ms
  }
  /** 回拨只给「伪造单调性被翻回」的故障注入用。 */
  set(instant: number): void {
    this.#current = instant
  }
}

// ---- 凭据：真实 CV 的测试参数（与 AI 包测试同一档） ----

export const FAST_CREDENTIALS = {
  cost: 1024,
  blockSize: 8,
  parallelization: 1,
  saltBytes: 16,
  keyBytes: 32,
}

// ---- 可手动放行的等待点 ----

export interface Gate {
  readonly reached: Promise<void>
  readonly wait: () => Promise<void>
  readonly release: () => void
}

export function gate(): Gate {
  let release!: () => void
  let reach!: () => void
  const released = new Promise<void>(resolve => {
    release = resolve
  })
  const reached = new Promise<void>(resolve => {
    reach = resolve
  })
  return {
    reached,
    wait: async () => {
      reach()
      await released
    },
    release,
  }
}

/** 让出若干轮事件循环：用来断言「在这段时间里它没有完成」。 */
export async function settleTurns(turns = 20): Promise<void> {
  for (let i = 0; i < turns; i += 1) await new Promise(resolve => setImmediate(resolve))
}

// ---- 插桩存储 ----

export type StatementKind = 'select' | 'insert' | 'update' | 'delete' | 'other'

export interface StatementInfo {
  readonly kind: StatementKind
  readonly tables: ReadonlySet<string>
  /** UPDATE 的 SET 列。 */
  readonly columns: ReadonlySet<string>
  readonly inWrite: boolean
}

export type StatementProbe = (statement: StatementInfo) => boolean
export type CommitProbe = (statements: readonly StatementInfo[]) => boolean

export const stmt = {
  on:
    (kind: StatementKind, table: string, options: { inWrite?: boolean; column?: string } = {}) =>
    (s: StatementInfo) =>
      s.kind === kind &&
      s.tables.has(table) &&
      (options.inWrite === undefined || s.inWrite === options.inWrite) &&
      (options.column === undefined || s.columns.has(options.column)),
}

/** 某次写事务里出现过匹配的语句。 */
export const committed =
  (probe: StatementProbe): CommitProbe =>
  statements =>
    statements.some(probe)

const KINDS: Record<string, StatementKind> = {
  SelectQueryNode: 'select',
  InsertQueryNode: 'insert',
  UpdateQueryNode: 'update',
  DeleteQueryNode: 'delete',
}

function collect(node: unknown, visit: (record: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) collect(item, visit)
  } else if (typeof node === 'object' && node !== null) {
    const record = node as Record<string, unknown>
    visit(record)
    for (const value of Object.values(record)) collect(value, visit)
  }
}

function identifierName(node: unknown): string | undefined {
  if (typeof node !== 'object' || node === null) return undefined
  const name = (node as { name?: unknown }).name
  return typeof name === 'string' ? name : undefined
}

function describeStatement(node: RootOperationNode, inWrite: boolean): StatementInfo {
  const tables = new Set<string>()
  const columns = new Set<string>()
  collect(node, record => {
    if (record['kind'] === 'TableNode') {
      const table = record['table'] as { identifier?: unknown } | undefined
      const name = identifierName(table?.identifier)
      if (name !== undefined) tables.add(name)
    }
    if (record['kind'] === 'ColumnUpdateNode') {
      const column = record['column'] as { column?: unknown } | undefined
      const name = identifierName(column?.column)
      if (name !== undefined) columns.add(name)
    }
  })
  return { kind: KINDS[node.kind] ?? 'other', tables, columns, inWrite }
}

interface Once<P, A> {
  readonly probe: P
  readonly action: A
}

/**
 * 包在真实提供者外面的 `storage`：规则一次性，命中即摘下。故障以 `StorageUnavailable` 到达参与方，
 * 与真实的「存储不可用」走同一条映射。统计 `statements` 供断言「某一步根本没发生」。
 */
export class InstrumentedStorage implements AtomicStorage {
  readonly statements: StatementInfo[] = []
  readonly #fail: Once<StatementProbe, undefined>[] = []
  readonly #pause: Once<StatementProbe, Gate>[] = []
  readonly #failCommit: Once<CommitProbe, undefined>[] = []
  readonly #afterCommit: Once<CommitProbe, () => Promise<void>>[] = []
  readonly #beforeWrite: Gate[] = []

  constructor(readonly inner: SqlStorage) {}

  /** 下一条匹配的语句在执行前以 `StorageUnavailable` 失败。 */
  failStatement(probe: StatementProbe): void {
    this.#fail.push({ probe, action: undefined })
  }

  /** 下一条匹配的语句执行之后、它所在的事务结束之前停住，直到放行。 */
  pauseAfterStatement(probe: StatementProbe): Gate {
    const g = gate()
    this.#pause.push({ probe, action: g })
    return g
  }

  /** 下一次含匹配语句的写事务：事务函数跑完之后回滚（提交失败）。 */
  failCommit(probe: CommitProbe): void {
    this.#failCommit.push({ probe, action: undefined })
  }

  /** 下一次含匹配语句的写事务提交成立之后、返回调用方之前运行 `run`（可在里面停住）。 */
  afterCommit(probe: CommitProbe, run: () => Promise<void>): void {
    this.#afterCommit.push({ probe, action: run })
  }

  /** 同上，停在一个等待点上。 */
  pauseAfterCommit(probe: CommitProbe): Gate {
    const g = gate()
    this.afterCommit(probe, () => g.wait())
    return g
  }

  pendingRules(): number {
    return (
      this.#fail.length +
      this.#pause.length +
      this.#failCommit.length +
      this.#afterCommit.length +
      this.#beforeWrite.length
    )
  }

  #plugin(inWrite: boolean, into: StatementInfo[]): KyselyPlugin {
    const seen = new WeakMap<QueryId, StatementInfo>()
    return {
      transformQuery: (args: PluginTransformQueryArgs): RootOperationNode => {
        const info = describeStatement(args.node, inWrite)
        seen.set(args.queryId, info)
        into.push(info)
        this.statements.push(info)
        if (take(this.#fail, rule => rule.probe(info)) !== undefined) {
          throw new StorageUnavailable(`injected: ${info.kind} ${[...info.tables].join(',')}`)
        }
        return args.node
      },
      transformResult: async (args: PluginTransformResultArgs) => {
        const info = seen.get(args.queryId)
        if (info !== undefined) {
          const rule = take(this.#pause, r => r.probe(info))
          if (rule !== undefined) await rule.action.wait()
        }
        return args.result
      },
    }
  }

  async atomic<T>(fn: (unit: StorageUnit) => Promise<T>): Promise<T> {
    const before = this.#beforeWrite.shift()
    if (before !== undefined) await before.wait()
    const statements: StatementInfo[] = []
    const result = await this.inner.atomic(async unit => {
      const wrapped: StorageUnit = {
        assertStorage: expected => {
          if (expected !== this) throw new StorageDefect('instrumented storage mismatch')
          unit.assertStorage(this.inner)
        },
        run: callback => unit.run(callback),
        query: callback =>
          unit.query(tx => callback({ db: tx.db.withPlugin(this.#plugin(true, statements)) })),
        mutate: callback =>
          unit.mutate(tx =>
            callback({
              db: tx.db.withPlugin(this.#plugin(true, statements)),
              lockRow: (table, key) => tx.lockRow(table, key),
              lockSentinel: name => tx.lockSentinel(name),
            }),
          ),
        afterCommit: callback => unit.afterCommit(callback),
      }
      const value = await fn(wrapped)
      if (take(this.#failCommit, rule => rule.probe(statements)) !== undefined)
        throw new StorageUnavailable('injected: atomic commit failed')
      return value
    })
    const after = take(this.#afterCommit, rule => rule.probe(statements))
    if (after !== undefined) await after.action()
    return result
  }

  async read<T>(fn: (tx: ReadTx) => Promise<T>): Promise<T> {
    const statements: StatementInfo[] = []
    const result = await this.inner.read(tx =>
      fn({ db: tx.db.withPlugin(this.#plugin(false, statements)) }),
    )
    return result
  }

  /** 下一次写事务开始之前（尚未取写锁）停住。 */
  pauseBeforeNextWrite(): Gate {
    const g = gate()
    this.#beforeWrite.push(g)
    return g
  }

  async write<T>(fn: (tx: WriteTx) => Promise<T>): Promise<T> {
    const before = this.#beforeWrite.shift()
    if (before !== undefined) await before.wait()
    const statements: StatementInfo[] = []
    const result = await this.inner.write(async tx => {
      const value = await fn({
        db: tx.db.withPlugin(this.#plugin(true, statements)),
        lockRow: (table, key) => tx.lockRow(table, key),
        lockSentinel: name => tx.lockSentinel(name),
      })
      if (take(this.#failCommit, rule => rule.probe(statements)) !== undefined) {
        throw new StorageUnavailable('injected: commit failed')
      }
      return value
    })
    const after = take(this.#afterCommit, rule => rule.probe(statements))
    if (after !== undefined) await after.action()
    return result
  }
}

function take<R>(rules: R[], match: (rule: R) => boolean): R | undefined {
  const index = rules.findIndex(match)
  if (index < 0) return undefined
  const [rule] = rules.splice(index, 1)
  return rule
}

// ---- 组合夹具 ----

export interface CompositionOptions {
  readonly label?: string
  /** 缺省真实 clock；`'test'` 用可前推的替身。 */
  readonly clock?: 'real' | 'test'
  readonly retention?: number
  /** 故障注入：给 AI 配一把与 AR 私钥不配对的 activation 公钥。 */
  readonly mismatchedActivationKey?: boolean
  /** 故障注入：给 AI 配一把与 OG 私钥不配对的 purge 公钥。 */
  readonly mismatchedPurgeKey?: boolean
  /** 打开一份已有的库文件（重启演练）；缺省新建临时文件。 */
  readonly file?: string
  /** 沿用上一次装配的两对密钥（重启演练：部署密钥跨重启不变）。 */
  readonly keys?: DeploymentKeys
}

export interface DeploymentKeys {
  readonly activation: HandoffKeyPairPem
  readonly purge: HandoffKeyPairPem
}

export type Participant = 'accountIdentity' | 'organizationGovernance' | 'registration'

export interface Composition {
  readonly file: string
  readonly raw: SqlStorage
  readonly storage: InstrumentedStorage
  /** `clock: 'test'` 时的替身；真实 clock 时为 undefined。 */
  readonly clock: TestClock | undefined
  readonly ctx: Context
  readonly assembly: Assembly
  readonly accounts: AccountsService
  readonly organizations: OrganizationsService
  readonly organizationPurge: OrganizationPurgeService
  readonly activationSigningKeyPem: string
  /** 当前可解析的 `registration`；本 fiber 不在 ACTIVE 时为 undefined。 */
  registration(): RegistrationService | undefined
  /** 取 `registration`，取不到就让测试失败。 */
  service(): RegistrationService
  /** 三个参与方当前的 fiber；`reload` 之后指向新装的那一条。 */
  readonly fibers: Record<Participant, Fiber>
  /** 装回一个参与方（同一 config）；原 fiber 须已撤。 */
  reload(participant: Participant): Promise<Fiber>
  /** 核实清除依据用的公钥（OG S-54 ⑥ 断言依据绑定该 AccountId）。 */
  readonly purgeVerificationKeyPem: string
  /** 本包记下的缺陷记录（结构化对象，按记录次序）。 */
  defects(): RegistrationDefectRecord[]
  /** 某个 logger 名下的 error 级消息。 */
  errors(name: string): Message[]
  /** 装配以来导出到 WARN 级为止的全部日志消息。 */
  messages(): readonly Message[]
  readonly keys: DeploymentKeys
  logins(): LoginsService
  dispose(): Promise<void>
}

export async function bootComposition(options: CompositionOptions = {}): Promise<Composition> {
  const file = options.file ?? tempSqliteFile(options.label ?? 'composition')
  const raw = await openStorage({
    dialect: 'sqlite',
    file,
    migrations: composedMigrations(),
    upgrade: false,
  })
  const storage = new InstrumentedStorage(raw)
  const clock = options.clock === 'test' ? new TestClock() : undefined
  const activation = options.keys?.activation ?? generateHandoffKeyPair()
  const purge = options.keys?.purge ?? generateHandoffKeyPair()
  const stray = generateHandoffKeyPair()
  const retention = options.retention ?? HOUR
  const services = [
    { name: 'storage', value: storage },
    ...(clock === undefined ? [] : [{ name: 'clock', value: clock }]),
  ]
  const participants: Record<Participant, { plugin: Plugin; config: unknown }> = {
    accountIdentity: {
      plugin: accountIdentityPlugin,
      config: {
        credentialPolicy: { minLength: 8 },
        unactivatedRetention: retention,
        activationVerificationKeyPem:
          options.mismatchedActivationKey === true ? stray.publicKeyPem : activation.publicKeyPem,
        purgeVerificationKeyPem:
          options.mismatchedPurgeKey === true ? stray.publicKeyPem : purge.publicKeyPem,
      },
    },
    organizationGovernance: {
      plugin: organizationGovernancePlugin,
      config: {
        invitationTtlDefault: 7 * DAY,
        affiliationRequestTtlDefault: 3 * DAY,
        teamCreationKeyRetention: DAY,
        purgeSigningKeyPem: purge.privateKeyPem,
      },
    },
    registration: {
      plugin: registrationPlugin,
      config: { activationSigningKeyPem: activation.privateKeyPem },
    },
  }
  let assembly: Assembly
  try {
    assembly = await bootAssembly({
      services,
      plugins: [
        ...(clock === undefined ? [{ plugin: clockPlugin, config: {} }] : []),
        { plugin: credentialsPlugin, config: FAST_CREDENTIALS },
        participants.accountIdentity,
        participants.organizationGovernance,
        participants.registration,
      ],
    })
  } catch (error) {
    await raw.close()
    throw error
  }
  const ctx = assembly.ctx
  const messages: Message[] = []
  // 阈值放到 WARN（2）：Cordis 缺省只导出到 INFO，warn 默认看不见（basis logger-level-order-error-lowest）
  ctx.logger.exporter({ levels: { default: 2 }, export: message => messages.push(message) })
  // fibers：[装配层服务, clock?, credentials, AI, OG, AR]
  const offset = clock === undefined ? 3 : 2
  const booted = (index: number): Fiber => {
    const fiber = assembly.fibers[index]
    if (fiber === undefined) throw new Error(`fixture: no fiber at ${index}`)
    return fiber
  }
  const fibers: Record<Participant, Fiber> = {
    accountIdentity: booted(offset),
    organizationGovernance: booted(offset + 1),
    registration: booted(offset + 2),
  }
  const reloaded: Fiber[] = []
  const registration = () => ctx.get(REGISTRATION_SERVICE) as RegistrationService | undefined
  const composition: Composition = {
    file,
    raw,
    storage,
    clock,
    ctx,
    assembly,
    accounts: ctx.get(ACCOUNTS_SERVICE) as AccountsService,
    organizations: ctx.get(ORGANIZATIONS_SERVICE) as OrganizationsService,
    organizationPurge: ctx.get(ORGANIZATION_PURGE_SERVICE) as OrganizationPurgeService,
    activationSigningKeyPem: activation.privateKeyPem,
    registration,
    service() {
      const service = registration()
      if (service === undefined) throw new Error('registration is not resolvable')
      return service
    },
    fibers,
    async reload(participant) {
      const entry = participants[participant]
      const fiber = ctx.plugin(entry.plugin as Plugin.Object, entry.config as never)
      reloaded.push(fiber)
      fibers[participant] = fiber
      await fiber
      return fiber
    },
    purgeVerificationKeyPem: purge.publicKeyPem,
    defects: () =>
      messages
        .filter(m => m.name === 'account-registration' && m.type === 'error')
        .map(m => m.args[1] as RegistrationDefectRecord),
    errors: name => messages.filter(m => m.name === name && m.type === 'error'),
    messages: () => messages,
    keys: { activation, purge },
    logins: () => ctx.get(LOGINS_SERVICE) as LoginsService,
    async dispose() {
      for (const fiber of reloaded.reverse()) await fiber.dispose()
      await assembly.dispose()
      await raw.close()
    },
  }
  return composition
}

// ---- 直接读库（绕过服务面，看存储里到底有什么） ----

export interface AccountRow {
  readonly account_id: string
  readonly login_identifier: string
  readonly activated: number
  readonly expired_at: number | null
  readonly retention_deadline: number
}

export interface OrganizationRow {
  readonly organization_id: string
  readonly kind: string
  readonly owner_account: string | null
}

export async function accountsOf(c: Composition, identifier?: string): Promise<AccountRow[]> {
  return c.raw.read(async tx => {
    let query = tx.db.selectFrom(ACCOUNT_TABLE).selectAll()
    if (identifier !== undefined) query = query.where('login_identifier', '=', identifier)
    return (await query.execute()) as AccountRow[]
  })
}

export async function personalOrganizationsOf(
  c: Composition,
  accountId?: string,
): Promise<OrganizationRow[]> {
  return c.raw.read(async tx => {
    let query = tx.db.selectFrom('organization').selectAll().where('kind', '=', 'personal')
    if (accountId !== undefined) query = query.where('owner_account', '=', accountId)
    return (await query.execute()) as OrganizationRow[]
  })
}

export async function membershipsOf(c: Composition, organizationId: string) {
  return c.raw.read(async tx =>
    tx.db
      .selectFrom('membership')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .execute(),
  )
}

/**
 * 组合的三条不变量，直接对库检查（S-13 两面、S-35、S-14）：
 * - `activatedWithoutPersonalOrganization`：已激活却没有个人组织；
 * - `orphanPersonalOrganizations`：个人组织指向一个不存在的账号；
 * - `accountsWithSeveralPersonalOrganizations`、`identifiersWithSeveralAccounts`：「仅有一个」两处。
 */
export async function invariantViolations(c: Composition) {
  const accounts = await accountsOf(c)
  const organizations = await personalOrganizationsOf(c)
  const accountIds = new Set(accounts.map(a => a.account_id))
  const owners = new Map<string, number>()
  for (const o of organizations) {
    if (o.owner_account !== null)
      owners.set(o.owner_account, (owners.get(o.owner_account) ?? 0) + 1)
  }
  const identifiers = new Map<string, number>()
  for (const a of accounts)
    identifiers.set(a.login_identifier, (identifiers.get(a.login_identifier) ?? 0) + 1)
  return {
    activatedWithoutPersonalOrganization: accounts
      .filter(a => a.activated === 1 && !owners.has(a.account_id))
      .map(a => a.account_id),
    orphanPersonalOrganizations: organizations
      .filter(o => o.owner_account === null || !accountIds.has(o.owner_account))
      .map(o => o.organization_id),
    accountsWithSeveralPersonalOrganizations: [...owners].filter(([, n]) => n > 1).map(([a]) => a),
    identifiersWithSeveralAccounts: [...identifiers].filter(([, n]) => n > 1).map(([i]) => i),
  }
}

export const NO_VIOLATIONS = {
  activatedWithoutPersonalOrganization: [],
  orphanPersonalOrganizations: [],
  accountsWithSeveralPersonalOrganizations: [],
  identifiersWithSeveralAccounts: [],
}

/**
 * S-20 的两种形态：该标识上要么「账号已激活 ∧ 恰一个个人组织」，要么「不存在可用账号」。返回是哪一种，或 `third`。
 */
export async function formOf(
  c: Composition,
  identifier: string,
): Promise<'registered' | 'no-usable-account' | 'third'> {
  const accounts = await accountsOf(c, identifier)
  if (accounts.length > 1) return 'third'
  const account = accounts[0]
  if (account === undefined || account.activated === 0) return 'no-usable-account'
  const organizations = await personalOrganizationsOf(c, account.account_id)
  return organizations.length === 1 ? 'registered' : 'third'
}

/**
 * 绕过存储提供者与外键直接改库：只用来构造「状态已坏」的前提（S-54 ⑦、单调性被翻回等故障注入）。
 * 另开一个关掉外键的连接；调用时不得有写事务在途。
 */
export function tamper(c: Composition, sql: string, ...params: SQLInputValue[]): void {
  const db = new DatabaseSync(c.file, { enableForeignKeyConstraints: false, timeout: 5000 })
  try {
    db.prepare(sql).run(...params)
  } finally {
    db.close()
  }
}

/** 一个已存在的未激活记录的 AccountId（按登录标识取）。 */
export async function accountIdOf(c: Composition, identifier: string): Promise<AccountId> {
  const [row] = await accountsOf(c, identifier)
  if (row === undefined) throw new Error(`no account for ${identifier}`)
  return row.account_id as AccountId
}

/** 只走 ① 留下一条未激活记录（S-8 「① 之后」那个稳定状态）：② 注入故障，本次尝试 interrupted。 */
export async function leaveUnactivated(c: Composition, identifier: string): Promise<AccountId> {
  c.storage.failStatement(stmt.on('insert', 'organization'))
  const outcome = await c.service().register(identifier, PASSWORD)
  if (outcome !== 'interrupted') throw new Error(`fixture: expected interrupted, got ${outcome}`)
  return accountIdOf(c, identifier)
}
