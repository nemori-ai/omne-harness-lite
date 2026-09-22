import { describe, expectTypeOf, it } from 'vitest'
import type {
  AccountId,
  LoginIdentifier,
  MembershipStandingResult,
  ScopeLayerIdentity,
  TenantId,
} from '../src/index.ts'

describe('编译期挡住的条款', () => {
  it('S-2：登录标识与 AccountId 类型不相容', () => {
    expectTypeOf<LoginIdentifier>().not.toMatchTypeOf<AccountId>()
    expectTypeOf<AccountId>().not.toMatchTypeOf<LoginIdentifier>()
  })
  it('S-5：TenantId 恰两个分量', () => {
    expectTypeOf<keyof TenantId>().toEqualTypeOf<'organization' | 'account'>()
  })
  it('S-11：ScopeLayerIdentity 的判别式恰两个取值', () => {
    expectTypeOf<ScopeLayerIdentity['layer']>().toEqualTypeOf<'organization' | 'tenant'>()
  })
  it('S-10：MembershipStandingResult 没有 invalidInput 支', () => {
    expectTypeOf<{ invalidInput: string }>().not.toMatchTypeOf<MembershipStandingResult>()
  })
})
