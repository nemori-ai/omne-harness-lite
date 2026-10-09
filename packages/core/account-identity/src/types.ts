// capability.account-identity v3 的服务面类型。契约：packages/core/account-identity/SPEC.md；
// 节点设计：packages/tenancy/account-identity-sql/SPEC.md。
// 失败字面**逐字对契约**（kebab-case），每个方法的失败集合恰为契约所列，无兜底值；类型测试（tests/types.spec-d.ts）守 S-36。
// 参数按「是不是用来认人」分：S-16 的发起方、S-17、S-37 是品牌 `LoginStateId`（契约「按来源读」），其余一律 `unknown`，
// 表示层解析在方法体内做，不合格 ⇒ `invalid-input`（契约「它不是一次判定结果」）。品牌参数在运行期同样先过表示层。
import type { AccountId, LoginIdentifier, LoginStateId } from '@omne-harness-lite/identity-values'
import type { Duration, Instant } from '@omne-harness-lite/offer-expiry'
import type { Ack, Outcome } from '@omne-harness-lite/kernel-basis'
import type { StorageUnit } from '@omne-harness-lite/storage'
import type { LoginStatePresentation } from './presentation.ts'

// ---- S-13 产生账号（未激活） ----
export type ProduceFailure =
  | 'identifier-taken'
  | 'identifier-held-by-expired-record'
  | 'credential-rejected'
  | 'invalid-input'
  | 'storage-unavailable'
export type ProduceResult =
  | { readonly ok: AccountId }
  | { readonly failure: 'identifier-taken' | 'invalid-input' | 'storage-unavailable' }
  /** 携那条已过期记录的 AccountId，供组合就地跑清除链（S-13 ⑤／组合 S-8）。 */
  | { readonly failure: 'identifier-held-by-expired-record'; readonly expiredRecord: AccountId }
  /** `reason` 由政策自己描述（S-26），只附在旁边，不是失败集合的一员。 */
  | { readonly failure: 'credential-rejected'; readonly reason: string }

// ---- S-14 激活账号 ----
export type ActivateFailure =
  | 'account-not-found'
  | 'account-record-expired'
  | 'warrant-invalid'
  | 'invalid-input'
  | 'storage-unavailable'

// ---- S-18 读账号 ----
export interface AccountReading {
  readonly activated: boolean
  /** 单调事实：由首次观测者落盘的 `expiredAt ≠ null`，不是读时重算的时间谓词。 */
  readonly retentionExpired: boolean
}
export type ReadFailure = 'account-not-found' | 'invalid-input' | 'storage-unavailable'

// ---- S-38 清除到期的未激活账号记录 ----
export type PurgeFailure =
  'not-expired' | 'purge-warrant-invalid' | 'invalid-input' | 'storage-unavailable'

/** 服务名 `accounts`：S-13／S-14／S-18／S-38。 */
export interface AccountsService {
  participate(unit: StorageUnit): AccountParticipation
  produce(loginIdentifier: unknown, presentedCredential: unknown): Promise<ProduceResult>
  /** 已激活 ⇒ `ok` 无二次效果，但仍须出示有效依据。 */
  activate(accountId: unknown, activationWarrant: unknown): Promise<Ack<ActivateFailure>>
  /** 这个读面会写：首次观测到已过留存期限时在同一提交内落盘再返回。 */
  read(accountId: unknown): Promise<Outcome<AccountReading, ReadFailure>>
  /** 记录不存在 ⇒ `ok`（先核依据）；被引用约束拒绝 ⇒ `storage-unavailable`。 */
  purge(accountId: unknown, purgeWarrant: unknown): Promise<Ack<PurgeFailure>>
}

// ---- S-15 验证凭据并签发登录状态 ----
export type IssueFailure =
  'identifier-or-credential-rejected' | 'invalid-input' | 'storage-unavailable'
/** S-15 成功：出示物只在这一次返回里出现（S-45），`loginStateId` 是它的不可逆形式。 */
export interface IssuedLoginState {
  readonly presentation: LoginStatePresentation
  readonly loginStateId: LoginStateId
}
// ---- S-16 撤销登录状态 ----
export type RevokeFailure =
  'login-state-not-found' | 'not-authorized' | 'invalid-input' | 'storage-unavailable'
// ---- S-17 校验登录状态（S-44 用同一个失败类型：两者是同一次判定） ----
export type VerifyLoginFailure = 'login-state-rejected' | 'invalid-input' | 'storage-unavailable'
// ---- S-44 按出示物换取身份 ----
export interface ExchangedIdentity {
  readonly loginStateId: LoginStateId
  readonly accountId: AccountId
}
// ---- S-37 列出本账号有效登录状态 ----
export interface EffectiveLoginState {
  readonly loginStateId: LoginStateId
  readonly issuedAt: Instant
  readonly lastActivityAt: Instant
  readonly absoluteExpiresAt: Instant
  readonly idleExpiresAt: Instant
}
export type ListEffectiveFailure = 'login-state-rejected' | 'invalid-input' | 'storage-unavailable'

/** 服务名 `logins`：S-15／S-44／S-16／S-17／S-37。 */
export interface AccountParticipation {
  read(accountId: unknown): Promise<Outcome<AccountReading, ReadFailure>>
  resolveActivatedIdentifier(identifier: unknown): Promise<Outcome<AccountId, ReadFailure>>
}
export type ChangeCredentialFailure =
  | 'invalid-input'
  | 'login-state-rejected'
  | 'current-credential-rejected'
  | 'credential-rejected'
  | 'storage-unavailable'
export type PreparedCredentialChange = { readonly credentialChange: unique symbol }
export type PrepareCredentialResult = Outcome<PreparedCredentialChange, ChangeCredentialFailure>
export interface LoginParticipation {
  exchange(presentation: unknown): Promise<Outcome<ExchangedIdentity, VerifyLoginFailure>>
  verify(loginStateId: LoginStateId): Promise<Outcome<AccountId, VerifyLoginFailure>>
  revoke(target: unknown, initiator: LoginStateId): Promise<Ack<RevokeFailure>>
  listEffective(
    caller: LoginStateId,
  ): Promise<Outcome<readonly EffectiveLoginState[], ListEffectiveFailure>>
  finalizeActivity(caller: LoginStateId): Promise<Ack<'invalid-input'>>
  commitCredentialChange(prepared: PreparedCredentialChange): Promise<Ack<ChangeCredentialFailure>>
}
export interface LoginsService {
  participate(unit: StorageUnit): LoginParticipation
  prepareCredentialChange(
    caller: LoginStateId,
    current: unknown,
    next: unknown,
  ): Promise<PrepareCredentialResult>
  changeCredential(
    caller: LoginStateId,
    current: unknown,
    next: unknown,
  ): Promise<Ack<ChangeCredentialFailure>>
  /** 不存在／不匹配／未激活三支落到同一个 `identifier-or-credential-rejected`（S-22、S-31）。 */
  issue(
    loginIdentifier: unknown,
    presentedCredential: unknown,
  ): Promise<Outcome<IssuedLoginState, IssueFailure>>
  /** 普通操作中唯一以出示物为输入的方法（S-30「只有 S-44 认出示物」）；判定就是 `verify` 的判定。 */
  exchange(presentation: unknown): Promise<Outcome<ExchangedIdentity, VerifyLoginFailure>>
  /**
   * 目标不是秘密、可以来自线上（`unknown`）；发起方用来认人（品牌）。
   * 目标不属发起方账号 ⇒ 同一个 `login-state-not-found`；已撤销 ⇒ `ok`，但在两半授权都过之后。
   */
  revoke(
    targetLoginStateId: unknown,
    initiatorLoginStateId: LoginStateId,
  ): Promise<Ack<RevokeFailure>>
  /** 只对进程内调用方开放（品牌参数）；每次现读，无缓存变体。 */
  verify(loginStateId: LoginStateId): Promise<Outcome<AccountId, VerifyLoginFailure>>
  /** 调用方自己那一条必定在内；查出为空视作读失败 ⇒ `storage-unavailable`。 */
  listEffective(
    callerLoginStateId: LoginStateId,
  ): Promise<Outcome<readonly EffectiveLoginState[], ListEffectiveFailure>>
}

// ---- 政策参数（S-26、S-39）与事件 ----
export interface AccountIdentityConfig {
  /** 形状不透明，原样交给 `credentials.checkPolicy`；缺 ⇒ S-13 ② 一律 `credential-rejected`。 */
  readonly credentialPolicy?: unknown
  /** 加载时校验为正，非正 ⇒ 启动失败（契约「取不到 ⇒ storage-unavailable」那一支由启动校验吸收，不可达）。 */
  readonly unactivatedRetention: Duration
  /** 核实激活依据的公钥（PEM SPKI，`activation` 用途）；缺或形状不对 ⇒ 启动失败。 */
  readonly activationVerificationKeyPem: string
  /** 核实清除依据的公钥（PEM SPKI，`purge` 用途）；缺或形状不对 ⇒ 启动失败。 */
  readonly purgeVerificationKeyPem: string
}

/** 三个通知事件（S-14／S-16／S-38）：提交后 `ctx.emit`，不 await 处理者，不开控制事件。载荷里没有出示物。 */
export interface AccountIdentityEvents {
  'account-identity/account-activated'(payload: { readonly accountId: AccountId }): void
  'account-identity/login-revoked'(payload: {
    readonly loginStateId: LoginStateId
    readonly accountId: AccountId
  }): void
  'account-identity/account-expired'(payload: {
    readonly accountId: AccountId
    readonly loginIdentifier: LoginIdentifier
  }): void
}
