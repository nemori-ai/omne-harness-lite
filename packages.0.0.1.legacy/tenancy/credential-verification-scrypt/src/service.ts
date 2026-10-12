import type { CredentialsService, PresentedCredential } from '@omne-harness-lite/account-identity'
// `credentials` 服务面与它的密码实现。四个方法就是全部——没有「按标识找材料」：
// 材料在 account-identity 的记录里，本包看不到账号记录，也不 inject `accounts`。
import { type Parsed, invalidInput, ok } from '@omne-harness-lite/identity-values'
import { checkPasswordPolicy } from './policy.ts'
import { type DerivationParameters, deriveMaterial, verifyMaterial } from './scrypt.ts'

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
