// S-36 失败集合闭合：每个操作的失败字面量集合与契约逐字相等（类型层）。
import { describe, expectTypeOf, it } from 'vitest'
import type {
  AccountsService,
  ActivateFailure,
  IssueFailure,
  ListEffectiveFailure,
  LoginsService,
  ProduceFailure,
  ProduceResult,
  PurgeFailure,
  ReadFailure,
  RevokeFailure,
  VerifyLoginFailure,
} from '../src/index.ts'

type FailuresOf<R> = R extends { readonly failure: infer F } ? F : never

describe('account-identity 失败集合逐字对契约', () => {
  it('S-13', () => {
    expectTypeOf<ProduceFailure>().toEqualTypeOf<
      | 'identifier-taken'
      | 'identifier-held-by-expired-record'
      | 'credential-rejected'
      | 'invalid-input'
      | 'storage-unavailable'
    >()
    expectTypeOf<FailuresOf<ProduceResult>>().toEqualTypeOf<ProduceFailure>()
  })
  it('S-14', () => {
    expectTypeOf<ActivateFailure>().toEqualTypeOf<
      | 'account-not-found'
      | 'account-record-expired'
      | 'warrant-invalid'
      | 'invalid-input'
      | 'storage-unavailable'
    >()
  })
  it('S-15', () => {
    expectTypeOf<IssueFailure>().toEqualTypeOf<
      'identifier-or-credential-rejected' | 'invalid-input' | 'storage-unavailable'
    >()
  })
  it('S-16', () => {
    expectTypeOf<RevokeFailure>().toEqualTypeOf<
      'login-state-not-found' | 'not-authorized' | 'invalid-input' | 'storage-unavailable'
    >()
  })
  it('S-17', () => {
    expectTypeOf<VerifyLoginFailure>().toEqualTypeOf<
      'login-state-rejected' | 'invalid-input' | 'storage-unavailable'
    >()
  })
  it('S-18', () => {
    expectTypeOf<ReadFailure>().toEqualTypeOf<
      'account-not-found' | 'invalid-input' | 'storage-unavailable'
    >()
  })
  it('S-37', () => {
    expectTypeOf<ListEffectiveFailure>().toEqualTypeOf<
      'login-state-rejected' | 'invalid-input' | 'storage-unavailable'
    >()
  })
  it('S-38', () => {
    expectTypeOf<PurgeFailure>().toEqualTypeOf<
      'not-expired' | 'purge-warrant-invalid' | 'invalid-input' | 'storage-unavailable'
    >()
  })
  it('两个服务面恰八个方法', () => {
    expectTypeOf<keyof AccountsService>().toEqualTypeOf<'produce' | 'activate' | 'read' | 'purge'>()
    expectTypeOf<keyof LoginsService>().toEqualTypeOf<
      'issue' | 'revoke' | 'verify' | 'listEffective'
    >()
  })
})
