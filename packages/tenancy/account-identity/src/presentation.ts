// 登录状态出示物（契约 v2 S-45）：产生、交换表示的解析、LoginStateId 的派生。
// 产生与派生不出包（公开入口只导出解析与品牌类型）：派生规则在本包之外没有第二份。
// 不导出不是访问控制——派生式在契约里公开；挡「自己算出 LoginStateId 再调 S-17」的是品牌参数与接收边界的文本规则。
import { createHash, randomBytes } from 'node:crypto'
import {
  type Branded,
  type LoginStateId,
  type Parsed,
  invalidInput,
  isOk,
  ok,
  parseOpaqueIdentifier,
} from '@omne-harness-lite/identity-values'

/** 出示物：持有即被认（bearer）。与 `LoginStateId` 互不可赋值。 */
export type LoginStatePresentation = Branded<string, 'LoginStatePresentation'>

/** 256 位，恰为契约下限。包内常量，不是 config：可配就可能配到下限以下。 */
export const PRESENTATION_RANDOM_BYTES = 32
/** S-45 交换表示的上界（候选值，随 v2 接受一起定）。 */
export const MAX_PRESENTATION_SCALAR_VALUES = 1024

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
 * S-45 交换表示的全部四条：非空、首末不在 IV S-31 的空白码点集合里（与不透明标识同一个函数）、
 * 不含孤立代理码点、至多 1024 个 Unicode 标量值。只看形状，不解析内容；拒绝理由不带输入值。
 * 入口层判出示物的表示层用的就是这一个函数（S-44 第 1 步）。
 */
export function parseLoginStatePresentation(value: unknown): Parsed<LoginStatePresentation> {
  const opaque = parseOpaqueIdentifier(value, 'LoginStatePresentation')
  if (!isOk(opaque)) return invalidInput(opaque.invalidInput)
  const text: string = opaque.ok
  if (!text.isWellFormed()) return invalidInput('LoginStatePresentation: lone surrogate')
  // 每个标量值至多两个 UTF-16 码元：码元数超过两倍上界时不必逐个数
  if (
    text.length > 2 * MAX_PRESENTATION_SCALAR_VALUES ||
    Array.from(text).length > MAX_PRESENTATION_SCALAR_VALUES
  ) {
    return invalidInput('LoginStatePresentation: too long')
  }
  return ok(text as LoginStatePresentation)
}

/**
 * LoginStateId = lowercase-hex( SHA-256( UTF-8( 出示物 ) ) )。确定、无盐、无密钥。
 * 只收过了解析的值，所以「UTF-8 对孤立代理项无定义」在这里不出现。
 * 本包里除 `parseLoginStateId` 之外唯一构造 LoginStateId 的地方。
 */
export function deriveLoginStateId(presentation: LoginStatePresentation): LoginStateId {
  return createHash('sha256').update(presentation, 'utf8').digest('hex') as LoginStateId
}
