// SQL-neutral record facts and private data operations. Decode only at the original policy use sites.
import type { CredentialMaterial } from '@omne-harness-lite/account-identity'
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
import { StorageDefect } from '@omne-harness-lite/storage'

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

/** Borrowed only for the current storage callback; no connection or commit ownership. */
export interface IdentityRead {
  accountByIdentifier(identifier: LoginIdentifier): Promise<AccountRow | undefined>
  accountById(account: AccountId): Promise<AccountRow | undefined>
  loginById(login: LoginStateId): Promise<LoginStateRow | undefined>
  loginsByAccount(account: AccountId): Promise<readonly LoginStateRow[]>
}
export interface IdentityWrite extends IdentityRead {
  lockAccountByIdentifier(identifier: LoginIdentifier): Promise<void>
  lockAccountById(account: AccountId): Promise<void>
  insertAccount(row: AccountRow): Promise<void>
  activateAccount(account: AccountId): Promise<void>
  landAccountExpiry(account: AccountId, observedAt: Instant): Promise<void>
  deleteAccount(account: AccountId): Promise<void>
  insertLogin(row: LoginStateRow): Promise<void>
  revokeLogin(login: LoginStateId): Promise<void>
  recordActivity(login: LoginStateId, at: Instant): Promise<void>
  replaceCredential(
    account: AccountId,
    material: CredentialMaterial,
    revision: number,
  ): Promise<void>
}
export interface IdentityDataUnit {
  run<T>(work: () => Promise<T>): Promise<T>
  query<T>(work: (records: IdentityRead) => Promise<T>): Promise<T>
  mutate<T>(work: (records: IdentityWrite) => Promise<T>): Promise<T>
  afterCommit(work: () => void): void
}
export interface IdentityPersistence {
  read<T>(work: (records: IdentityRead) => Promise<T>): Promise<T>
  write<T>(work: (records: IdentityWrite) => Promise<T>): Promise<T>
  atomic<T>(work: (unit: IdentityDataUnit) => Promise<T>): Promise<T>
}
