// `credentials` 服务面与它的密码实现。四个方法就是全部——没有「按标识找材料」：
// 材料在 account-identity 的记录里，本包看不到账号记录，也不 inject `accounts`。
import { type Parsed, invalidInput, ok } from '@omne-harness-lite/identity-values'
import { type PolicyCheck, checkPasswordPolicy } from './policy.ts'
import {
  type CredentialMaterial,
  type DerivationParameters,
  type PresentedCredential,
  type VerifyResult,
  deriveMaterial,
  verifyMaterial,
} from './scrypt.ts'

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
  /** 政策形状归本包；`policy` 不合形状 ⇒ `unavailable`（account-identity 据此给 `credential-rejected`）。 */
  checkPolicy(policy: unknown, presented: PresentedCredential): PolicyCheck
}

export function parseCredential(raw: unknown): Parsed<PresentedCredential> {
  if (typeof raw !== 'string') return invalidInput('credential: not a string')
  if (raw.length === 0) return invalidInput('credential: empty')
  return ok(raw as PresentedCredential)
}

/** 密码实现。无状态：四个方法都是纯计算，实例只持有派生参数。 */
export function createPasswordCredentials(params: DerivationParameters): CredentialsService {
  return {
    parse: parseCredential,
    derive: presented => deriveMaterial(presented, params),
    verify: (material, presented) => verifyMaterial(material, presented),
    checkPolicy: checkPasswordPolicy,
  }
}
