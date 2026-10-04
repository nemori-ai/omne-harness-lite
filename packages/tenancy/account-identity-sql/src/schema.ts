// 两张表的存储形状与迁移片段。节点设计「持久记录的存储形状与迁移片段」；合成与纪律归 tenancy-host（M-1～M-9）。
// 约束名显式：`account_pkey`、`account_login_identifier_unique`、`login_state_pkey`（core/storage P-11）。
// **不建** `login_state → account` 外键；`account.account_id` 是 OG `organization_owner_account_fk` 的目标，列名不改。
// 不建 CHECK（M-7）：`activated` 与 `expired_at` 互斥、LoginStateId 的派生形状由本包写路径与测试守。
import type { Kysely } from 'kysely'
import type { Migration } from 'kysely/migration'
import {
  type AccountId,
  type LoginIdentifier,
  type LoginStateId,
  isOk,
  parseAccountId,
  parseLoginIdentifier,
  parseLoginStateId,
} from '@omne-harness-lite/identity-values'
import { type Instant, instantFromEpochMs } from '@omne-harness-lite/offer-expiry'
import { StorageDefect, type MigrationFragment } from '@omne-harness-lite/storage'

export const ACCOUNT_TABLE = 'account' as const
/** OG 外键的目标列；装配把它与 {@link ACCOUNT_TABLE} 传给 OG 的迁移工厂。 */
export const ACCOUNT_ID_COLUMN = 'account_id' as const
export const LOGIN_STATE_TABLE = 'login_state' as const

export const ACCOUNT_LOGIN_IDENTIFIER_UNIQUE = 'account_login_identifier_unique'
export const ACCOUNT_PKEY = 'account_pkey'
export const LOGIN_STATE_PKEY = 'login_state_pkey'

/** 布尔列：sqlite 存 0／1，pg 存 boolean；写一律写 0／1，读经 {@link storedFlag}。 */
type StoredFlag = number | boolean
/** 时间列（毫秒整数，bigint 列）：sqlite 读回 number，pg 读回字符串；读经 {@link storedInstant}。 */
type StoredInstant = number | string

/** 账号记录（S-4 的四样 + 三个存储属性）。**没有第二个 AccountId 类型的列**（S-11／S-35）。 */
export interface AccountRow {
  readonly account_id: string
  readonly login_identifier: string
  readonly credential_material: string
  readonly credential_revision: number | string
  readonly activated: StoredFlag
  readonly produced_at: StoredInstant
  readonly retention_deadline: StoredInstant
  readonly expired_at: StoredInstant | null
}

/** 登录状态记录（S-9）：含签发/活动与代次，**没有出示物，也没有任何由出示物得来的第二个字段**（S-45、S-46）。 */
export interface LoginStateRow {
  readonly login_state_id: string
  readonly account_id: string
  readonly issued_at: StoredInstant
  readonly last_activity_at: StoredInstant
  readonly credential_revision: number | string
  readonly revoked: StoredFlag
}

export interface AccountIdentityDb {
  readonly account: AccountRow
  readonly login_state: LoginStateRow
}

const accountIdentityTables: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async up(db: Kysely<any>) {
    await db.schema
      .createTable(ACCOUNT_TABLE)
      .ifNotExists()
      .addColumn(ACCOUNT_ID_COLUMN, 'text', c => c.primaryKey().notNull())
      .addColumn('login_identifier', 'text', c => c.notNull())
      .addColumn('credential_material', 'text', c => c.notNull())
      .addColumn('activated', 'boolean', c => c.notNull())
      .addColumn('produced_at', 'bigint', c => c.notNull())
      .addColumn('retention_deadline', 'bigint', c => c.notNull())
      .addColumn('expired_at', 'bigint')
      .execute()
    await db.schema
      .createIndex(ACCOUNT_LOGIN_IDENTIFIER_UNIQUE)
      .ifNotExists()
      .unique()
      .on(ACCOUNT_TABLE)
      .column('login_identifier')
      .execute()
    await db.schema
      .createTable(LOGIN_STATE_TABLE)
      .ifNotExists()
      .addColumn('login_state_id', 'text', c => c.primaryKey().notNull())
      .addColumn('account_id', 'text', c => c.notNull())
      .addColumn('issued_at', 'bigint', c => c.notNull())
      .addColumn('revoked', 'boolean', c => c.notNull())
      .execute()
    // 非正确性：S-37 按账号列登录状态时用
    await db.schema
      .createIndex('login_state_account_id_index')
      .ifNotExists()
      .on(LOGIN_STATE_TABLE)
      .column('account_id')
      .execute()
  },
}

const boundedLoginMigration: Migration = {
  async up(db) {
    // SQLite's migrator does not wrap DDL. This fragment needs its own atomic
    // boundary so the complete column set also entails the legacy-data update.
    if (!db.isTransaction) {
      await db.transaction().execute(tx => boundedLoginMigration.up(tx))
      return
    }
    // The host requires fragments to be idempotent. A completed migration must
    // neither add columns again nor revoke logins issued after the upgrade.
    const tables = await db.introspection.getTables()
    const present = [
      [ACCOUNT_TABLE, 'credential_revision'],
      [LOGIN_STATE_TABLE, 'credential_revision'],
      [LOGIN_STATE_TABLE, 'last_activity_at'],
    ].map(
      ([table, column]) =>
        tables.find(entry => entry.name === table)?.columns.some(entry => entry.name === column) ??
        false,
    )
    if (present.every(Boolean)) return
    if (present.some(Boolean)) throw new StorageDefect('incomplete bounded login migration')
    await db.schema
      .alterTable(ACCOUNT_TABLE)
      .addColumn('credential_revision', 'bigint', c => c.notNull().defaultTo(0))
      .execute()
    await db.schema
      .alterTable(LOGIN_STATE_TABLE)
      .addColumn('credential_revision', 'bigint', c => c.notNull().defaultTo(0))
      .execute()
    await db.schema
      .alterTable(LOGIN_STATE_TABLE)
      .addColumn('last_activity_at', 'bigint', c => c.notNull().defaultTo(0))
      .execute()
    await db
      .updateTable(LOGIN_STATE_TABLE)
      .set(eb => ({ revoked: FLAG_TRUE, last_activity_at: eb.ref('issued_at') }))
      .execute()
  },
}

/** 本包的迁移片段：名字包内稳定、只追加不重排（tenancy-host M-9）。两张表一个片段。 */
export const accountIdentityMigrations: readonly MigrationFragment[] = [
  { name: 'account_identity', migration: accountIdentityTables },
  { name: 'account_identity_bounded_logins', migration: boundedLoginMigration },
]

export function storedRevision(value: number | string): number {
  const revision = typeof value === 'string' ? Number(value) : value
  if (!Number.isSafeInteger(revision) || revision < 0)
    throw new StorageDefect('stored credential revision is not a nonnegative safe integer')
  return revision
}

// ---- 从存储读回的值：本包自己写进去的，形状不对即存储缺陷，不是调用方的输入错误 ----

export function storedFlag(value: StoredFlag): boolean {
  if (value === true || value === 1) return true
  if (value === false || value === 0) return false
  throw new StorageDefect('stored flag is neither 0 nor 1')
}

export function storedInstant(value: StoredInstant): Instant {
  const parsed = instantFromEpochMs(typeof value === 'string' ? Number(value) : value)
  if (!isOk(parsed)) throw new StorageDefect('stored instant is not an integer millisecond value')
  return parsed.ok
}

export function storedAccountId(value: string): AccountId {
  const parsed = parseAccountId(value)
  if (!isOk(parsed)) throw new StorageDefect('stored account_id is not an opaque identifier')
  return parsed.ok
}

export function storedLoginStateId(value: string): LoginStateId {
  const parsed = parseLoginStateId(value)
  if (!isOk(parsed)) throw new StorageDefect('stored login_state_id is not an opaque identifier')
  return parsed.ok
}

export function storedLoginIdentifier(value: string): LoginIdentifier {
  const parsed = parseLoginIdentifier(value)
  if (!isOk(parsed)) throw new StorageDefect('stored login_identifier is not an opaque identifier')
  return parsed.ok
}

export const FLAG_TRUE = 1
export const FLAG_FALSE = 0
