// credential_policy 的形状与判定（契约 capability.account-identity S-26）：形状归本包，account-identity 原样透传。
// 政策管「一份凭据可不可接受」；哈希参数管「材料长什么样」，不在政策里。
import { z } from 'zod'
import type { PresentedCredential, PolicyCheck } from '@omne-harness-lite/account-identity'

export const CHARACTER_CLASSES = ['lowercase', 'uppercase', 'digit', 'symbol'] as const
export type CharacterClass = (typeof CHARACTER_CLASSES)[number]

/** 密码方案的政策：最短长度（按 Unicode 标量值计）与必须出现的字符类别。多余成员一律视为不合形状。 */
export const PasswordPolicy = z
  .object({
    minLength: z.number().int().positive(),
    requiredCharacterClasses: z.array(z.enum(CHARACTER_CLASSES)).optional(),
  })
  .strict()
export type PasswordPolicy = z.infer<typeof PasswordPolicy>

const CLASS_PATTERNS: Readonly<Record<CharacterClass, RegExp>> = {
  lowercase: /\p{Ll}/u,
  uppercase: /\p{Lu}/u,
  digit: /\p{Nd}/u,
  symbol: /[^\p{L}\p{N}\p{White_Space}]/u,
}

/**
 * 形状不合 ⇒ `unavailable`（account-identity 据此给 `credential-rejected`：取不到不退化为不校验）；
 * 不满足 ⇒ `rejected`，理由逐条指认不满足的规则（`min-length:<n>`、`character-class:<类别>`），不含凭据本身。
 */
export function checkPasswordPolicy(policy: unknown, presented: PresentedCredential): PolicyCheck {
  const parsed = PasswordPolicy.safeParse(policy)
  if (!parsed.success) return 'unavailable'
  const unmet: string[] = []
  if (Array.from(presented).length < parsed.data.minLength) {
    unmet.push(`min-length:${parsed.data.minLength}`)
  }
  for (const characterClass of parsed.data.requiredCharacterClasses ?? []) {
    if (!CLASS_PATTERNS[characterClass].test(presented))
      unmet.push(`character-class:${characterClass}`)
  }
  return unmet.length === 0 ? 'ok' : { rejected: unmet.join(',') }
}
