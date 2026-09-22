import { describe, expectTypeOf, it } from 'vitest'
import type { CredentialsService, PolicyCheck, VerifyResult } from '../src/index.ts'

describe('credential-verification 服务面类型', () => {
  it('verify 恰三值', () => {
    expectTypeOf<VerifyResult>().toEqualTypeOf<'match' | 'mismatch' | 'unavailable'>()
  })
  it('checkPolicy 恰三支', () => {
    expectTypeOf<PolicyCheck>().toEqualTypeOf<
      'ok' | { readonly rejected: string } | 'unavailable'
    >()
  })
  it('服务面恰四个方法', () => {
    expectTypeOf<keyof CredentialsService>().toEqualTypeOf<
      'parse' | 'derive' | 'verify' | 'checkPolicy'
    >()
  })
})
