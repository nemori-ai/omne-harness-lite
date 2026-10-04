import { describe, expectTypeOf, it } from 'vitest'
import type {
  CredentialMaterial,
  CredentialsService,
  PolicyCheck,
  PresentedCredential,
  VerifyResult,
} from '@omne-harness-lite/account-identity'

describe('credential-verification 服务面类型', () => {
  it('verify 恰三值', () => {
    expectTypeOf<VerifyResult>().toEqualTypeOf<'match' | 'mismatch' | 'unavailable'>()
    expectTypeOf<ReturnType<CredentialsService['verify']>>().toEqualTypeOf<Promise<VerifyResult>>()
  })
  it('derive 不返回半份材料：材料或 unavailable', () => {
    expectTypeOf<ReturnType<CredentialsService['derive']>>().toEqualTypeOf<
      Promise<CredentialMaterial | 'unavailable'>
    >()
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
  it('出示的凭据与材料是两种品牌，普通字符串两边都不收', () => {
    expectTypeOf<string>().not.toMatchTypeOf<PresentedCredential>()
    expectTypeOf<string>().not.toMatchTypeOf<CredentialMaterial>()
    expectTypeOf<PresentedCredential>().not.toMatchTypeOf<CredentialMaterial>()
  })
})
