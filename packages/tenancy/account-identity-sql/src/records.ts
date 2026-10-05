// 记录读取与两处共用的判定：账号行的占用分类（S-13）、过期事实的首次落盘（S-13／S-14／S-18／S-38）、
// 登录状态的判定（S-17 与 S-44 共用同一个函数——「不是第二份判据」由此兑现）。
import type { CredentialMaterial } from '@omne-harness-lite/account-identity'
import type { AccountId, LoginIdentifier, LoginStateId } from '@omne-harness-lite/identity-values'
import { type Clock, type Instant, compareInstants } from '@omne-harness-lite/offer-expiry'
import { StorageUnavailable, narrow, type ReadTx, type WriteTx } from '@omne-harness-lite/storage'
import {
  ACCOUNT_TABLE,
  type AccountIdentityDb,
  type AccountRow,
  LOGIN_STATE_TABLE,
  storedAccountId,
  storedFlag,
  storedInstant,
  storedRevision,
  type LoginStateRow,
} from './schema.ts'

export function selectAccountByIdentifier(
  tx: ReadTx,
  identifier: LoginIdentifier,
): Promise<AccountRow | undefined> {
  return narrow<AccountIdentityDb>(tx)
    .selectFrom(ACCOUNT_TABLE)
    .selectAll()
    .where('login_identifier', '=', identifier)
    .executeTakeFirst()
}

export function selectAccountById(
  tx: ReadTx,
  accountId: AccountId,
): Promise<AccountRow | undefined> {
  return narrow<AccountIdentityDb>(tx)
    .selectFrom(ACCOUNT_TABLE)
    .selectAll()
    .where('account_id', '=', accountId)
    .executeTakeFirst()
}

/** 一条账号行在某一刻的占用类别（S-13 前置①）。 */
export type Occupancy =
  | { readonly kind: 'none' }
  | { readonly kind: 'activated'; readonly accountId: AccountId }
  /** 已过留存期限：`landed` 为假时是本次首次观测，`observedAt` 是要落盘的时刻。 */
  | {
      readonly kind: 'expired'
      readonly accountId: AccountId
      readonly landed: boolean
      readonly observedAt: Instant | undefined
    }
  | { readonly kind: 'live'; readonly accountId: AccountId; readonly material: CredentialMaterial }

/** 时间源只在「未激活且尚未落盘过期事实」时才被读；读不到 ⇒ `'clock-unavailable'`，不按任何一边猜。 */
export function classifyAccount(
  row: AccountRow | undefined,
  clock: Clock,
): Occupancy | 'clock-unavailable' {
  if (row === undefined) return { kind: 'none' }
  const accountId = storedAccountId(row.account_id)
  if (storedFlag(row.activated)) return { kind: 'activated', accountId }
  if (row.expired_at !== null)
    return { kind: 'expired', accountId, landed: true, observedAt: undefined }
  const now = clock.now()
  if (now === 'unavailable') return 'clock-unavailable'
  if (compareInstants(now, storedInstant(row.retention_deadline)) > 0) {
    return { kind: 'expired', accountId, landed: false, observedAt: now }
  }
  // 材料列由 S-13 产生、S-50 替换，写进去的就是 `credentials.derive` 的返回；本包只存不读它的内部（SC-CV-1）
  return { kind: 'live', accountId, material: row.credential_material as CredentialMaterial }
}

/** 快照与提交内现读是不是「同一行、同一类」（S-30 第 4 行的确认条件）。 */
export function sameOccupancy(a: Occupancy, b: Occupancy): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'none' || b.kind === 'none') return true
  return a.accountId === b.accountId
}

export type ExpirySettlement = 'expired' | 'live' | 'clock-unavailable'

/**
 * 「已过留存期限」是首次观测时落盘的单调事实：已落盘 ⇒ 不再读时钟；未落盘且此刻已过 ⇒ 在同一提交内写 `expired_at`。
 * 调用方须已对该行锁定读（R-3），且该行未激活（已激活的行不参与期限判定，S-18 性质 1）。
 */
export async function settleExpiry(
  tx: WriteTx,
  row: AccountRow,
  clock: Clock,
): Promise<ExpirySettlement> {
  if (row.expired_at !== null) return 'expired'
  const now = clock.now()
  if (now === 'unavailable') return 'clock-unavailable'
  if (compareInstants(now, storedInstant(row.retention_deadline)) <= 0) return 'live'
  await landExpiry(tx, storedAccountId(row.account_id), now)
  return 'expired'
}

/** 落盘过期事实：只对「未激活且尚未落盘」的行生效——`activated` 与 `expired_at` 的互斥由写路径守，不由 CHECK。 */
export async function landExpiry(tx: WriteTx, accountId: AccountId, now: Instant): Promise<void> {
  await narrow<AccountIdentityDb>(tx)
    .updateTable(ACCOUNT_TABLE)
    .set({ expired_at: now })
    .where('account_id', '=', accountId)
    .where('activated', '=', 0)
    .where('expired_at', 'is', null)
    .execute()
}

export const LOGIN_ABSOLUTE_MS = 28_800_000
export const LOGIN_IDLE_MS = 3_600_000

export function loginDeadlines(row: LoginStateRow): {
  issuedAt: Instant
  lastActivityAt: Instant
  absoluteExpiresAt: Instant
  idleExpiresAt: Instant
} {
  const issuedAt = storedInstant(row.issued_at)
  const lastActivityAt = storedInstant(row.last_activity_at)
  const absolute = issuedAt + LOGIN_ABSOLUTE_MS
  const idle = lastActivityAt + LOGIN_IDLE_MS
  if (!Number.isSafeInteger(absolute) || !Number.isSafeInteger(idle))
    throw new StorageUnavailable('login deadline overflow')
  return {
    issuedAt,
    lastActivityAt,
    absoluteExpiresAt: absolute as Instant,
    idleExpiresAt: idle as Instant,
  }
}

export function trustedNow(clock: Clock): Instant {
  const now = clock.now()
  if (now === 'unavailable') throw new StorageUnavailable('login clock unavailable')
  return now
}

export function loginValidAt(row: LoginStateRow, revision: number, now: Instant): boolean {
  if (storedFlag(row.revoked) || storedRevision(row.credential_revision) !== revision) return false
  const limits = loginDeadlines(row)
  return now < limits.absoluteExpiresAt && now < limits.idleExpiresAt
}

/** Caller holds the common transaction boundary. This function never opens a read connection. */
export async function judgeLoginState(
  tx: ReadTx,
  loginStateId: LoginStateId,
  clock: Clock,
): Promise<{ readonly ok: AccountId } | { readonly failure: 'login-state-rejected' }> {
  const db = narrow<AccountIdentityDb>(tx)
  const state = await db
    .selectFrom(LOGIN_STATE_TABLE)
    .selectAll()
    .where('login_state_id', '=', loginStateId)
    .executeTakeFirst()
  if (state === undefined || storedFlag(state.revoked)) return LOGIN_STATE_REJECTED
  const accountId = storedAccountId(state.account_id)
  const account = await selectAccountById(tx, accountId)
  if (
    account === undefined ||
    !storedFlag(account.activated) ||
    storedRevision(state.credential_revision) !== storedRevision(account.credential_revision)
  )
    return LOGIN_STATE_REJECTED
  return loginValidAt(state, storedRevision(account.credential_revision), trustedNow(clock))
    ? { ok: accountId }
    : LOGIN_STATE_REJECTED
}

const LOGIN_STATE_REJECTED = { failure: 'login-state-rejected' } as const
