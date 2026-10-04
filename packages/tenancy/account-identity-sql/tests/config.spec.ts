// 契约 S-27：`credentialPolicy` 缺席不是启动失败——config 里没有这个键与键在值为 undefined 同义。
import { describe, expect, it } from 'vitest'
import { AccountIdentityConfigSchema } from '@omne-harness-lite/account-identity-sql'
import { RETENTION, warrantKeys } from './support.ts'

describe('account-identity config', () => {
  it('S-27：config 里没有 credentialPolicy 键也通过校验', () => {
    const keys = warrantKeys()
    const result = AccountIdentityConfigSchema.safeParse({
      unactivatedRetention: RETENTION,
      activationVerificationKeyPem: keys.activationPublicPem,
      purgeVerificationKeyPem: keys.purgePublicPem,
    })
    expect(result.success).toBe(true)
  })
})
