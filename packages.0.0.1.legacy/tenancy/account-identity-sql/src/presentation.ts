// 登录状态出示物（契约 v2 S-45）：产生、交换表示的解析、LoginStateId 的派生。
// 产生与派生不出包（公开入口只导出解析与品牌类型）：派生规则在本包之外没有第二份。
// 不导出不是访问控制——派生式在契约里公开；挡「自己算出 LoginStateId 再调 S-17」的是品牌参数与接收边界的文本规则。
import { createHash, randomBytes } from 'node:crypto'
import type { LoginStateId } from '@omne-harness-lite/identity-values'
import type { LoginStatePresentation } from '@omne-harness-lite/account-identity'

/** 256 位，恰为契约下限。包内常量，不是 config：可配就可能配到下限以下。 */
export const PRESENTATION_RANDOM_BYTES = 32

/** 密码学安全的随机源。生产路径恒为 `node:crypto.randomBytes`；只有测试装配直接构造实现类时传别的（故障注入）。 */
export type RandomSource = (size: number) => Uint8Array

export const cryptoRandomSource: RandomSource = size => randomBytes(size)

/**
 * 产生一个出示物：32 个随机字节编码为 base64url 无填充（43 个字符）。
 * 随机源失败即抛出，由调用方收成 `storage-unavailable`——**不退化为任何更低熵的来源**；
 * 随机源交回的字节数不对同样抛出（一个短了的源就是低熵的源）。
 */
export function generatePresentation(random: RandomSource): LoginStatePresentation {
  const bytes = random(PRESENTATION_RANDOM_BYTES)
  if (bytes.length !== PRESENTATION_RANDOM_BYTES) {
    throw new RangeError('random source returned the wrong number of bytes')
  }
  return Buffer.from(bytes).toString('base64url') as LoginStatePresentation
}

/**
 * LoginStateId = lowercase-hex( SHA-256( UTF-8( 出示物 ) ) )。确定、无盐、无密钥。
 * 只收过了解析的值，所以「UTF-8 对孤立代理项无定义」在这里不出现。
 * 本包里除 `parseLoginStateId` 之外唯一构造 LoginStateId 的地方。
 */
export function deriveLoginStateId(presentation: LoginStatePresentation): LoginStateId {
  return createHash('sha256').update(presentation, 'utf8').digest('hex') as LoginStateId
}
