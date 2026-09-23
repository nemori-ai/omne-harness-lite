// 记录读取与两处共用的判定：账号行的占用分类（S-13）、过期事实的首次落盘（S-13／S-14／S-18／S-38）、
// 登录状态的判定（S-17 与 S-44 共用同一个函数——「不是第二份判据」由此兑现）。
import type { CredentialMaterial } from '@omne-harness-lite/credential-verification'
import type { AccountId, LoginIdentifier, LoginStateId } from '@omne-harness-lite/identity-values'
import { type Clock, type Instant, compareInstants } from '@omne-harness-lite/offer-expiry'
import { narrow, type ReadTx, type WriteTx } from '@omne-harness-lite/storage'
import {
  ACCOUNT_TABLE,
  type AccountIdentityDb,
  type AccountRow,
  LOGIN_STATE_TABLE,
  storedAccountId,
  storedFlag,
  storedInstant,
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
  // 材料列只由 S-13 的插入写入一次，写进去的就是 `credentials.derive` 的返回；本包只存不读它的内部（SC-CV-1）
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

/**
 * S-17 的判定（S-44 调同一个函数）：查不到／已撤销／所属账号未激活 ⇒ 同一个 `login-state-rejected`；
 * 返回类型里没有 `invalid-input`——S-44 表里「S-17 出口 `invalid-input` ⇒ 结构上到不了」由类型兑现。
 * 读不到的存储以异常到达调用方，由它收成 `storage-unavailable`。
 */
export async function judgeLoginState(
  tx: ReadTx,
  loginStateId: LoginStateId,
): Promise<{ readonly ok: AccountId } | { readonly failure: 'login-state-rejected' }> {
  const db = narrow<AccountIdentityDb>(tx)
  const state = await db
    .selectFrom(LOGIN_STATE_TABLE)
    .select(['account_id', 'revoked'])
    .where('login_state_id', '=', loginStateId)
    .executeTakeFirst()
  if (state === undefined || storedFlag(state.revoked)) return LOGIN_STATE_REJECTED
  const accountId = storedAccountId(state.account_id)
  const account = await db
    .selectFrom(ACCOUNT_TABLE)
    .select(['activated'])
    .where('account_id', '=', accountId)
    .executeTakeFirst()
  if (account === undefined || !storedFlag(account.activated)) return LOGIN_STATE_REJECTED
  return { ok: accountId }
}

const LOGIN_STATE_REJECTED = { failure: 'login-state-rejected' } as const
