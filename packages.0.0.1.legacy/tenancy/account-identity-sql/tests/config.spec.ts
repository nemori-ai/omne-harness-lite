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

// Integration config carries data. Credential implementations and runtime handles use DI.
it.each([() => undefined, new Map(), new AbortController()])(
  'rejects live values in credentialPolicy',
  credentialPolicy => {
    const keys = warrantKeys()
    expect(
      AccountIdentityConfigSchema.safeParse({
        credentialPolicy,
        unactivatedRetention: RETENTION,
        activationVerificationKeyPem: keys.activationPublicPem,
        purgeVerificationKeyPem: keys.purgePublicPem,
      }).success,
    ).toBe(false)
  },
)

it.each([
  { value: undefined },
  { value: { required: ['length'], minimum: 8 } },
  { value: ['a', 1, true, null] },
])('preserves absent and JSON credential policies', ({ value: credentialPolicy }) => {
  const keys = warrantKeys()
  expect(
    AccountIdentityConfigSchema.safeParse({
      credentialPolicy,
      unactivatedRetention: RETENTION,
      activationVerificationKeyPem: keys.activationPublicPem,
      purgeVerificationKeyPem: keys.purgePublicPem,
    }).success,
  ).toBe(true)
})
