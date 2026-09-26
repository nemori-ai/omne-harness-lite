import { randomBytes } from 'node:crypto'

/**
 * 不透明标识的词法候选（G-04 未裁）：128 位 CSPRNG、小写 base32 无填充，共 26 个字符。
 * 在各持有节点的存储提交内生成；唯一性由主键约束兑现，不由随机性兑现——碰撞 ⇒ 提交失败。
 * 消费者不得解析它、不得按前缀分组。
 */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'

export function generateOpaqueIdentifier(): string {
  const bytes = randomBytes(16)
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}
