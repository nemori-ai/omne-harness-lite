// composition.account-registration v2 的服务面类型。契约：.meta_harness/design/spec/compositions/account-registration/v2/contract.md；
// 节点设计：.meta_harness/design/realization/packages/tenancy/account-registration/design.md。
import type { PurgeFailure as AccountPurgeFailure } from '@omne-harness-lite/account-identity'
import type { AccountId } from '@omne-harness-lite/identity-values'
import type { PurgePersonalOrganizationFailure } from '@omne-harness-lite/organization-governance'

export type { AccountPurgeFailure }

/** S-5 终结结果集合：恰四值，没有第五个，也没有「其他」。 */
export const TERMINAL_OUTCOMES = [
  'registered',
  'identifier-taken',
  'credential-rejected',
  'interrupted',
] as const
export type TerminalOutcome = (typeof TERMINAL_OUTCOMES)[number]

/** S-34 三分类：终止型／缺陷型／抖动型。 */
export const PURGE_FAILURE_CLASSES = ['terminal', 'defect', 'transient'] as const
export type PurgeFailureClass = (typeof PURGE_FAILURE_CLASSES)[number]

/**
 * 清除链的收场：两步的失败值**原样带出**（两套拼法不翻译、不归并），贴三分类标签与坐标。
 * `from` 是出自哪一步：S-53（organization-governance）或 S-38（account-identity）。
 */
export type PurgeExpiredResult =
  | 'ok'
  | {
      readonly from: 'S-53'
      readonly failure: PurgePersonalOrganizationFailure
      readonly class: PurgeFailureClass
    }
  | {
      readonly from: 'S-38'
      readonly failure: AccountPurgeFailure
      readonly class: PurgeFailureClass
    }

/**
 * 缺陷可观测记录（映射表「另记什么」列）：不进返回值，不并入普通 `interrupted` 计数。
 * - `entry-defect`：① 的 `invalid-input`（表示层校验归注册入口）；
 * - `composition-defect`：②③ 与清除链上「本组合传错了东西／次序或携带坏了」的缺陷型；
 * - `contract-violation`：主链路径上不可达却出现的终止型、清除链 ② 的 `not-expired`、清除链 ① 的 `accountDoesNotExist`
 *   （「个人组织存在 ⇒ 账号记录存在」被破的观测点）。
 * `accountId` 只作关联，① 的入口缺陷没有它；记录里不带登录标识与凭据。
 */
export interface RegistrationDefectRecord {
  readonly kind: 'composition-defect' | 'entry-defect' | 'contract-violation'
  readonly step: 1 | 2 | 3 | 'purge-1' | 'purge-2'
  readonly failure: string
  readonly accountId?: AccountId
}

/** 服务名 `registration`。三个参与方都是必需 inject，任一缺席 ⇒ 本 fiber PENDING。 */
export interface RegistrationService {
  /**
   * S-8 三步主链：产生 → 建个人组织（成功即签发激活依据）→ 激活。
   * 不包事务、不加锁；`identifier-held-by-expired-record` ⇒ 就地跑清除链，两步都 ok 则重跑①恰一次。
   * 每步之前检查本插件这一代仍在，否则停在当前位置返回 `interrupted`（S-22）。
   */
  register(loginIdentifier: unknown, presentedCredential: unknown): Promise<TerminalOutcome>
  /**
   * S-34 清除链：S-53 → S-38，依据由 ① 产出、② 核实，本节点逐字携带。
   * 编排者在链途中被卸载 ⇒ 以 `RegistrationStopped` 拒绝（等同崩溃，「什么也收不到」），不是返回面的一员。
   */
  purgeExpired(accountId: unknown): Promise<PurgeExpiredResult>
}

/** 本插件私有的激活签名私钥（PEM PKCS8，Ed25519）；缺或形状不对 ⇒ 启动失败。 */
export interface AccountRegistrationConfig {
  readonly activationSigningKeyPem: string
}

/**
 * 编排者在清除链途中被卸载或换代：链条停在当前步（等同崩溃，契约 S-22）。
 * 只由 `purgeExpired` 抛出——它的返回面只装参与方失败值，「停下」不是其中之一，契约的收场是「什么也收不到」；
 * `register` 在同一情形下返回 `interrupted`。
 */
export class RegistrationStopped extends Error {
  constructor(readonly step: 'purge-1' | 'purge-2') {
    super(`account-registration was unloaded before purge step ${step}; the chain stopped there`)
    this.name = 'RegistrationStopped'
  }
}
