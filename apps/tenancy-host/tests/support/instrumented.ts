// 交错演练的夹具（本节点提供：同一存储、同一外键、同一份合成迁移，design「同一存储、同一约束域」末段）：
// 真实 AI／OG／AR／CV 插件 + 真实 storage-sql（这里用于 pg 首跑）+ 可前推的时间替身，
// 存储外面包一层插桩：按语句（种类、表、更新的列）在事务里停住、在提交之后停住、在下一次写事务开始之前停住。
// 写法沿 account-registration 包内同名夹具（那一份在包的 tests/ 里，不是公开入口；这里按同一口径另写一份最小的）。
import type { Context } from '@deepseek-ai/cordis'
import type {
  KyselyPlugin,
  PluginTransformQueryArgs,
  PluginTransformResultArgs,
  QueryId,
  RootOperationNode,
} from 'kysely'
import {
  ACCOUNTS_SERVICE,
  type AccountsService,
  accountIdentityPlugin,
} from '@omne-harness-lite/account-identity'
import {
  REGISTRATION_SERVICE,
  type RegistrationService,
  registrationPlugin,
} from '@omne-harness-lite/account-registration'
import { credentialsPlugin } from '@omne-harness-lite/credential-verification'
import { generateHandoffKeyPair } from '@omne-harness-lite/identity-values'
import { type Assembly, bootAssembly } from '@omne-harness-lite/kernel-basis/testing'
import { ORGANIZATION_PURGE_SERVICE } from '@omne-harness-lite/organization-governance/cordis'
import { type OrganizationPurgeService } from '@omne-harness-lite/organization-governance'
import { organizationGovernancePlugin } from '@omne-harness-lite/organization-governance-sql/cordis'
import {
  type ReadTx,
  type Storage,
  type AtomicStorage,
  type StorageUnit,
  StorageDefect,
  type WriteTx,
  composeMigrations,
} from '@omne-harness-lite/storage'
import { type SqlStorage, openStorage } from '@omne-harness-lite/storage-sql'
import { hostMigrationFragments } from '../../src/index.ts'

export const HOUR = 3_600_000
export const START = Date.UTC(2026, 8, 23, 12, 0, 0)
export const PASSWORD = 'correct horse battery'
export const FAST_CREDENTIALS = {
  cost: 1024,
  blockSize: 8,
  parallelization: 1,
  saltBytes: 16,
  keyBytes: 32,
}

/** offer-expiry `Clock` 形状的替身：可前推、可回拨。 */
export class TestClock {
  current = START
  now(): number {
    return this.current
  }
  advance(ms: number): void {
    this.current += ms
  }
}

export interface Gate {
  readonly reached: Promise<void>
  readonly wait: () => Promise<void>
  readonly release: () => void
}

export function gate(): Gate {
  let release: () => void = () => undefined
  let reach: () => void = () => undefined
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

export async function settleTurns(turns = 20): Promise<void> {
  for (let i = 0; i < turns; i += 1) await new Promise(resolve => setImmediate(resolve))
}

/** 一个还没结束的调用：`settled()` 看它有没有结束。 */
export function track<T>(promise: Promise<T>) {
  let settled = false
  void promise.then(
    () => (settled = true),
    () => (settled = true),
  )
  return { promise, settled: () => settled }
}

export type StatementKind = 'select' | 'insert' | 'update' | 'delete' | 'other'

export interface StatementInfo {
  readonly kind: StatementKind
  readonly tables: ReadonlySet<string>
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

function walk(node: unknown, visit: (record: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) for (const item of node) walk(item, visit)
  else if (typeof node === 'object' && node !== null) {
    const record = node as Record<string, unknown>
    visit(record)
    for (const value of Object.values(record)) walk(value, visit)
  }
}

function nameOf(node: unknown): string | undefined {
  if (typeof node !== 'object' || node === null) return undefined
  const name = (node as { name?: unknown }).name
  return typeof name === 'string' ? name : undefined
}

function describeStatement(node: RootOperationNode, inWrite: boolean): StatementInfo {
  const tables = new Set<string>()
  const columns = new Set<string>()
  walk(node, record => {
    if (record['kind'] === 'TableNode') {
      const name = nameOf((record['table'] as { identifier?: unknown } | undefined)?.identifier)
      if (name !== undefined) tables.add(name)
    }
    if (record['kind'] === 'ColumnUpdateNode') {
      const name = nameOf((record['column'] as { column?: unknown } | undefined)?.column)
      if (name !== undefined) columns.add(name)
    }
  })
  return { kind: KINDS[node.kind] ?? 'other', tables, columns, inWrite }
}

function take<R>(rules: R[], match: (rule: R) => boolean): R | undefined {
  const index = rules.findIndex(match)
  if (index < 0) return undefined
  const [rule] = rules.splice(index, 1)
  return rule
}

/** 包在真实提供者外面的 `storage`；规则一次性，命中即摘下。 */
export class InstrumentedStorage implements AtomicStorage {
  /** 经过本层的每一条语句（供断言「某条路真的走到了」）。 */
  readonly statements: StatementInfo[] = []
  readonly #pause: { probe: StatementProbe; gate: Gate }[] = []
  readonly #afterCommit: { probe: CommitProbe; run: () => Promise<void> }[] = []
  readonly #beforeWrite: Gate[] = []

  constructor(readonly inner: SqlStorage) {}

  pauseAfterStatement(probe: StatementProbe): Gate {
    const g = gate()
    this.#pause.push({ probe, gate: g })
    return g
  }

  afterCommit(probe: CommitProbe, run: () => Promise<void>): void {
    this.#afterCommit.push({ probe, run })
  }

  pauseAfterCommit(probe: CommitProbe): Gate {
    const g = gate()
    this.afterCommit(probe, () => g.wait())
    return g
  }

  pauseBeforeNextWrite(): Gate {
    const g = gate()
    this.#beforeWrite.push(g)
    return g
  }

  #plugin(inWrite: boolean, into: StatementInfo[]): KyselyPlugin {
    const seen = new WeakMap<QueryId, StatementInfo>()
    return {
      transformQuery: (args: PluginTransformQueryArgs): RootOperationNode => {
        const info = describeStatement(args.node, inWrite)
        seen.set(args.queryId, info)
        into.push(info)
        this.statements.push(info)
        return args.node
      },
      transformResult: async (args: PluginTransformResultArgs) => {
        const info = seen.get(args.queryId)
        if (info !== undefined) {
          const rule = take(this.#pause, r => r.probe(info))
          if (rule !== undefined) await rule.gate.wait()
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
      return value
    })
    const after = take(this.#afterCommit, rule => rule.probe(statements))
    if (after !== undefined) await after.run()
    return result
  }

  async read<T>(fn: (tx: ReadTx) => Promise<T>): Promise<T> {
    return this.inner.read(tx => fn({ db: tx.db.withPlugin(this.#plugin(false, [])) }))
  }

  async write<T>(fn: (tx: WriteTx) => Promise<T>): Promise<T> {
    const before = this.#beforeWrite.shift()
    if (before !== undefined) await before.wait()
    const statements: StatementInfo[] = []
    const result = await this.inner.write(async tx =>
      fn({
        db: tx.db.withPlugin(this.#plugin(true, statements)),
        lockRow: (table, key) => tx.lockRow(table, key),
        lockSentinel: name => tx.lockSentinel(name),
      }),
    )
    const after = take(this.#afterCommit, rule => rule.probe(statements))
    if (after !== undefined) await after.run()
    return result
  }
}

export interface Composition {
  readonly raw: SqlStorage
  readonly storage: InstrumentedStorage
  readonly clock: TestClock
  readonly ctx: Context
  readonly assembly: Assembly
  readonly accounts: AccountsService
  readonly organizationPurge: OrganizationPurgeService
  service(): RegistrationService
  dispose(): Promise<void>
}

/** 在一份已迁移（或空）的库上起真实组合；迁移就是本节点的合成序列，带 migrations 一律 `upgrade: false`。 */
export async function bootComposition(
  source: { dialect: 'postgres'; connectionString: string } | { dialect: 'sqlite'; file: string },
): Promise<Composition> {
  const raw = await openStorage({
    ...source,
    migrations: composeMigrations(hostMigrationFragments),
    upgrade: false,
  })
  const storage = new InstrumentedStorage(raw)
  const clock = new TestClock()
  const activation = generateHandoffKeyPair()
  const purge = generateHandoffKeyPair()
  let assembly: Assembly
  try {
    assembly = await bootAssembly({
      services: [
        { name: 'storage', value: storage },
        { name: 'clock', value: clock },
      ],
      plugins: [
        { plugin: credentialsPlugin, config: FAST_CREDENTIALS },
        {
          plugin: accountIdentityPlugin,
          config: {
            credentialPolicy: { minLength: 8 },
            unactivatedRetention: HOUR,
            activationVerificationKeyPem: activation.publicKeyPem,
            purgeVerificationKeyPem: purge.publicKeyPem,
          },
        },
        {
          plugin: organizationGovernancePlugin,
          config: {
            invitationTtlDefault: 7 * 24 * HOUR,
            affiliationRequestTtlDefault: 3 * 24 * HOUR,
            teamCreationKeyRetention: 24 * HOUR,
            purgeSigningKeyPem: purge.privateKeyPem,
          },
        },
        {
          plugin: registrationPlugin,
          config: { activationSigningKeyPem: activation.privateKeyPem },
        },
      ],
    })
  } catch (error) {
    await raw.close().catch(() => undefined)
    throw error
  }
  const ctx = assembly.ctx
  return {
    raw,
    storage,
    clock,
    ctx,
    assembly,
    accounts: ctx.get(ACCOUNTS_SERVICE) as AccountsService,
    organizationPurge: ctx.get(ORGANIZATION_PURGE_SERVICE) as OrganizationPurgeService,
    service() {
      const service = ctx.get(REGISTRATION_SERVICE) as RegistrationService | undefined
      if (service === undefined) throw new Error('registration is not resolvable')
      return service
    },
    async dispose() {
      await assembly.dispose()
      await raw.close()
    },
  }
}

export interface AccountRow {
  readonly account_id: string
  readonly login_identifier: string
  readonly activated: unknown
  readonly expired_at: unknown
}

export interface OrganizationRow {
  readonly organization_id: string
  readonly owner_account: string | null
}

export async function accountsOf(c: Composition, identifier?: string): Promise<AccountRow[]> {
  return c.raw.read(async tx => {
    let query = tx.db
      .selectFrom('account')
      .select(['account_id', 'login_identifier', 'activated', 'expired_at'])
    if (identifier !== undefined) query = query.where('login_identifier', '=', identifier)
    return (await query.execute()) as AccountRow[]
  })
}

export async function personalOrganizationsOf(c: Composition): Promise<OrganizationRow[]> {
  return c.raw.read(
    async tx =>
      (await tx.db
        .selectFrom('organization')
        .select(['organization_id', 'owner_account'])
        .where('kind', '=', 'personal')
        .execute()) as OrganizationRow[],
  )
}

/** 组合的不变量：已激活却没有个人组织、个人组织指向不存在的账号。 */
export async function violations(c: Composition) {
  const accounts = await accountsOf(c)
  const organizations = await personalOrganizationsOf(c)
  const ids = new Set(accounts.map(a => a.account_id))
  const owners = new Set(organizations.map(o => o.owner_account))
  return {
    activatedWithoutPersonalOrganization: accounts
      .filter(a => (a.activated === true || a.activated === 1) && !owners.has(a.account_id))
      .map(a => a.account_id),
    orphanPersonalOrganizations: organizations
      .filter(o => o.owner_account === null || !ids.has(o.owner_account))
      .map(o => o.organization_id),
  }
}

export const NO_VIOLATIONS = {
  activatedWithoutPersonalOrganization: [],
  orphanPersonalOrganizations: [],
}
