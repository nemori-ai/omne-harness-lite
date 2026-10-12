import type { Branded, Parsed } from '@omne-harness-lite/identity-values'
/** 调用方出示的凭据（表示层已过）。品牌化，避免把任意字符串当凭据传进比对。 */
export type PresentedCredential = Branded<string, 'PresentedCredential'>

/**
 * 存储在账号记录里的凭据材料：**不透明字符串**，account-identity 只存不读（S-8 第 1 条）。
 * 内部编码（方案、参数、盐、哈希）归本包，静态检查 SC-CV-1 守「account-identity 不解开它」。
 */
export type CredentialMaterial = Branded<string, 'CredentialMaterial'>

export type VerifyResult = 'match' | 'mismatch' | 'unavailable'

export type PolicyCheck = 'ok' | { readonly rejected: string } | 'unavailable'

/** 服务名 `credentials`。 */
export interface CredentialsService {
  /** 表示层：缺席、空、非字符串 ⇒ `invalidInput`（account-identity 映射为 `invalid-input`）。 */
  parse(raw: unknown): Parsed<PresentedCredential>
  /**
   * 派生存储材料；派生不了（随机源、计算失败）⇒ `unavailable`，不返回半份材料。
   * 异步：scrypt 是 CPU 密集计算，在线程池上跑，不占事件循环。
   */
  derive(presented: PresentedCredential): Promise<CredentialMaterial | 'unavailable'>
  /** 三值：scheme 不认识 ⇒ `mismatch`；比不了 ⇒ `unavailable`，不得折成 `mismatch`。 */
  verify(material: CredentialMaterial, presented: PresentedCredential): Promise<VerifyResult>
  /** 政策形状归提供者；`policy` 不合形状 ⇒ `unavailable`（account-identity 据此给 `credential-rejected`）。 */
  checkPolicy(policy: unknown, presented: PresentedCredential): PolicyCheck
}
