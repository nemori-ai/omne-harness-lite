// 类型层的静态义务：S-36 失败集合闭合（九个方法）、参数类型（哪些是品牌、哪些收 unknown）、
// 登录状态记录的结构、出示物与 LoginStateId 互不可赋值、出示物不作诊断输出的实参（no-presentation-in-diagnostics 的类型一形）。
import { describe, expectTypeOf, it } from 'vitest'
import type { AccountId, LoginIdentifier } from '@omne-harness-lite/identity-values'
import type { Outcome } from '@omne-harness-lite/kernel-basis'
import type {
  AccountIdentityEvents,
  AccountsService,
  ActivateFailure,
  ExchangedIdentity,
  IssueFailure,
  IssuedLoginState,
  ListEffectiveFailure,
  LoginStateId,
  LoginStatePresentation,
  LoginsService,
  ProduceFailure,
  ProduceResult,
  PurgeFailure,
  ReadFailure,
  RevokeFailure,
  VerifyLoginFailure,
} from '@omne-harness-lite/account-identity'
import type { AccountRow, LoginStateRow } from '../src/schema.ts'
import { defect, type Diagnostics, type Notifier } from '../src/diagnostics.ts'

type FailuresOf<R> = R extends { readonly failure: infer F } ? F : never
type Resolved<M extends (...args: never[]) => unknown> = Awaited<ReturnType<M>>

describe('S-36 失败集合逐字对契约（九个方法）', () => {
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
    expectTypeOf<Resolved<LoginsService['issue']>>().toEqualTypeOf<
      Outcome<IssuedLoginState, IssueFailure>
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
  it('S-44 的失败类型与 S-17 的是同一个', () => {
    expectTypeOf<Resolved<LoginsService['exchange']>>().toEqualTypeOf<
      Outcome<ExchangedIdentity, VerifyLoginFailure>
    >()
    expectTypeOf<FailuresOf<Resolved<LoginsService['exchange']>>>().toEqualTypeOf<
      FailuresOf<Resolved<LoginsService['verify']>>
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
  it('两个服务面的v3操作集合', () => {
    expectTypeOf<keyof AccountsService>().toEqualTypeOf<
      'produce' | 'activate' | 'read' | 'purge' | 'participate'
    >()
    expectTypeOf<keyof LoginsService>().toEqualTypeOf<
      | 'issue'
      | 'exchange'
      | 'revoke'
      | 'verify'
      | 'listEffective'
      | 'participate'
      | 'prepareCredentialChange'
      | 'changeCredential'
    >()
  })
})

describe('参数类型：用来认人的是品牌 LoginStateId，其余收 unknown', () => {
  it('exchange 与 S-16 的目标是 unknown；S-16 的发起方、S-17、S-37 是 LoginStateId', () => {
    expectTypeOf<Parameters<LoginsService['exchange']>>().toEqualTypeOf<[presentation: unknown]>()
    expectTypeOf<Parameters<LoginsService['revoke']>[0]>().toEqualTypeOf<unknown>()
    expectTypeOf<Parameters<LoginsService['revoke']>[1]>().toEqualTypeOf<LoginStateId>()
    expectTypeOf<Parameters<LoginsService['verify']>[0]>().toEqualTypeOf<LoginStateId>()
    expectTypeOf<Parameters<LoginsService['listEffective']>[0]>().toEqualTypeOf<LoginStateId>()
  })
  it('普通字符串与出示物都交不进品牌参数（线上的串交不进认人的位置）', () => {
    const logins = {} as LoginsService
    const wire = 'from-the-wire' as string
    const presentation = 'p' as LoginStatePresentation
    // @ts-expect-error 线上的串不是 LoginStateId
    void logins.verify(wire)
    // @ts-expect-error 出示物不是 LoginStateId
    void logins.verify(presentation)
    // @ts-expect-error 出示物不是 LoginStateId
    void logins.listEffective(presentation)
    // @ts-expect-error 交换实参：线上的串交不进发起方
    void logins.revoke('target', wire)
  })
  it('produce／activate／read／purge／issue 全部 unknown', () => {
    expectTypeOf<Parameters<AccountsService['produce']>>().toEqualTypeOf<
      [loginIdentifier: unknown, presentedCredential: unknown]
    >()
    expectTypeOf<Parameters<AccountsService['read']>>().toEqualTypeOf<[accountId: unknown]>()
    expectTypeOf<Parameters<LoginsService['issue']>>().toEqualTypeOf<
      [loginIdentifier: unknown, presentedCredential: unknown]
    >()
  })
})

describe('I-8 冻结的消费面（OG 按这几样写代码）', () => {
  it('AccountsService.read 与 LoginsService.verify 的返回类型', () => {
    expectTypeOf<Resolved<AccountsService['read']>>().toEqualTypeOf<
      Outcome<{ readonly activated: boolean; readonly retentionExpired: boolean }, ReadFailure>
    >()
    expectTypeOf<Resolved<LoginsService['verify']>>().toEqualTypeOf<
      Outcome<AccountId, VerifyLoginFailure>
    >()
  })
})

describe('记录结构（S-9、S-45「永不以可读形式保存」、S-35）', () => {
  it('登录状态行包含期限与代次，没有出示物', () => {
    expectTypeOf<keyof LoginStateRow>().toEqualTypeOf<
      | 'login_state_id'
      | 'account_id'
      | 'issued_at'
      | 'revoked'
      | 'last_activity_at'
      | 'credential_revision'
    >()
  })
  it('账号行只有一个 AccountId 列（S-11／S-35 的类型层）', () => {
    expectTypeOf<keyof AccountRow>().toEqualTypeOf<
      | 'account_id'
      | 'login_identifier'
      | 'credential_material'
      | 'credential_revision'
      | 'activated'
      | 'produced_at'
      | 'retention_deadline'
      | 'expired_at'
    >()
  })
  it('出示物与 LoginStateId 互不可赋值；普通字符串两边都不是', () => {
    expectTypeOf<LoginStatePresentation>().not.toMatchTypeOf<LoginStateId>()
    expectTypeOf<LoginStateId>().not.toMatchTypeOf<LoginStatePresentation>()
    expectTypeOf<string>().not.toMatchTypeOf<LoginStatePresentation>()
  })
  it('三个事件载荷的字段全是品牌标识，出示物赋不进去', () => {
    type Payloads = {
      [K in keyof AccountIdentityEvents]: Parameters<AccountIdentityEvents[K]>[0]
    }
    expectTypeOf<Payloads['account-identity/login-revoked']>().toEqualTypeOf<{
      readonly loginStateId: LoginStateId
      readonly accountId: AccountId
    }>()
    expectTypeOf<Payloads['account-identity/account-expired']>().toEqualTypeOf<{
      readonly accountId: AccountId
      readonly loginIdentifier: LoginIdentifier
    }>()
    expectTypeOf<Payloads['account-identity/account-activated']>().toEqualTypeOf<{
      readonly accountId: AccountId
    }>()
  })
})

describe('no-presentation-in-diagnostics（类型一形）：出示物不得作诊断、事件、错误构造的实参', () => {
  it('诊断外观、错误构造与通知出口拒绝出示物', () => {
    const diagnostics = {} as Diagnostics
    const notifier = {} as Notifier
    const presentation = 'p' as LoginStatePresentation
    const loginStateId = 'id' as LoginStateId
    const accountId = 'a' as AccountId
    // 对照：普通字段照收
    diagnostics.warn('event', { operation: 'issue', attempts: 2 })
    // @ts-expect-error 出示物不能当事件名
    diagnostics.warn(presentation)
    // @ts-expect-error 出示物不能当字段值
    diagnostics.error('event', { value: presentation })
    // @ts-expect-error 出示物不能当错误说明
    void defect(presentation)
    // @ts-expect-error 出示物赋不进事件载荷
    notifier.loginRevoked({ loginStateId: presentation, accountId })
    notifier.loginRevoked({ loginStateId, accountId })
  })
})
