// 凭据校验提供者的服务面。契约来源：capability.account-identity v1 S-8（凭据材料）、S-26（credential_policy）；
// 节点设计：.meta_harness/design/realization/packages/tenancy/credential-verification/design.md。
// 第一程只定形状；插件与实现在第二程。方法名一律候选。
import type { Branded, Parsed } from '@omne-harness-lite/identity-values'

/** 调用方出示的凭据（表示层已过）。品牌化，避免把任意字符串当凭据传进比对。 */
export type PresentedCredential = Branded<string, 'PresentedCredential'>

/**
 * 存储在账号记录里的凭据材料：**不透明字符串**，account-identity 只存不读（S-8 第 1 条）。
 * 内部编码（方案、参数、盐、哈希）归本包，静态检查 SC-CV-1 守「account-identity 不解开它」。
 */
export type CredentialMaterial = Branded<string, 'CredentialMaterial'>

export type VerifyResult = 'match' | 'mismatch' | 'unavailable'

/** 政策判定：`rejected` 携政策自己描述的理由，理由只附在 account-identity 的 `credential-rejected` 旁，不进其失败集合。 */
export type PolicyCheck = 'ok' | { readonly rejected: string } | 'unavailable'

/** 服务名候选：`credentials`。四个方法就是全部——没有「按标识找材料」。 */
export interface CredentialsService {
  /** 表示层：缺席、空、非字符串 ⇒ `invalidInput`（account-identity 映射为 `invalid-input`）。 */
  parse(raw: unknown): Parsed<PresentedCredential>
  /** 派生存储材料；派生不了（参数损坏等）⇒ `unavailable`，不返回半份材料。 */
  derive(presented: PresentedCredential): CredentialMaterial | 'unavailable'
  /** 三值：scheme 不认识 ⇒ `mismatch`；比不了 ⇒ `unavailable`，不得折成 `mismatch`。 */
  verify(material: CredentialMaterial, presented: PresentedCredential): VerifyResult
  /** 政策形状归本包；`policy` 不合形状 ⇒ `unavailable`（account-identity 据此给 `credential-rejected`）。 */
  checkPolicy(policy: unknown, presented: PresentedCredential): PolicyCheck
}

export const CREDENTIALS_SERVICE = 'credentials' as const
