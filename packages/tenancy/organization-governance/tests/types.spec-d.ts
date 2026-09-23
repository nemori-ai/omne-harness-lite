// 失败集合闭合：每个操作的失败字面量集合与契约 ⑥ 逐字相等（类型层）。
import { describe, expectTypeOf, it } from 'vitest'
import type {
  LoginStateId,
  MembershipStandingResult,
  OrganizationId,
} from '@omne-harness-lite/identity-values'
import type { MigrationFragment } from '@omne-harness-lite/storage'
import * as og from '../src/index.ts'

describe('organization-governance 失败集合逐字对契约', () => {
  it('S-20', () => {
    expectTypeOf<og.CreatePersonalFailure>().toEqualTypeOf<
      'accountDoesNotExist' | 'accountRecordExpired' | 'invalidInput' | 'unavailable'
    >()
  })
  it('S-21', () => {
    expectTypeOf<og.CreateTeamFailure>().toEqualTypeOf<
      'accountNotActivated' | 'accountDoesNotExist' | 'invalidInput' | 'unavailable'
    >()
  })
  it('S-22', () => {
    expectTypeOf<og.ReadOrganizationFailure>().toEqualTypeOf<
      'organizationDoesNotExist' | 'invalidInput' | 'unavailable'
    >()
  })
  it('S-23', () => {
    expectTypeOf<og.IssueInvitationFailure>().toEqualTypeOf<
      | 'issuerIsPersonalOrganization'
      | 'notAuthorized'
      | 'accountNotActivated'
      | 'accountDoesNotExist'
      | 'alreadyAnEffectiveMember'
      | 'invalidOfferDuration'
      | 'invalidInput'
      | 'unavailable'
    >()
  })
  it('S-24', () => {
    expectTypeOf<og.WithdrawInvitationFailure>().toEqualTypeOf<
      | 'invitationDoesNotExist'
      | 'notAuthorized'
      | 'alreadyConcluded'
      | 'invalidInput'
      | 'unavailable'
    >()
  })
  it('S-25', () => {
    expectTypeOf<og.AcceptInvitationFailure>().toEqualTypeOf<
      | 'invitationDoesNotExist'
      | 'offerNoLongerValid'
      | 'notTheInvitedAccount'
      | 'accountNotActivated'
      | 'accountDoesNotExist'
      | 'alreadyAnEffectiveMember'
      | 'invalidInput'
      | 'unavailable'
    >()
  })
  it('S-26：闭合和恰两支加表示层', () => {
    expectTypeOf<og.StandingFailure>().toEqualTypeOf<'invalidInput'>()
  })
  it('S-27', () => {
    expectTypeOf<og.MineFailure>().toEqualTypeOf<'unavailable' | 'invalidInput'>()
  })
  it('S-28', () => {
    expectTypeOf<og.ChangeRoleFailure>().toEqualTypeOf<
      | 'notAuthorized'
      | 'membershipNotEffective'
      | 'wouldLeaveNoSuperAdministrator'
      | 'invalidInput'
      | 'unavailable'
    >()
  })
  it('S-29', () => {
    expectTypeOf<og.RemoveMemberFailure>().toEqualTypeOf<
      | 'personalOrganizationMemberCannotLeave'
      | 'notAuthorized'
      | 'membershipNotEffective'
      | 'wouldLeaveNoSuperAdministrator'
      | 'invalidInput'
      | 'unavailable'
    >()
  })
  it('S-30', () => {
    expectTypeOf<og.IssueAffiliationRequestFailure>().toEqualTypeOf<
      | 'personalOrganizationTakesNoPartInAffiliation'
      | 'notAuthorized'
      | 'organizationDoesNotExist'
      | 'wouldFormACycle'
      | 'invalidOfferDuration'
      | 'invalidInput'
      | 'unavailable'
    >()
  })
  it('S-31', () => {
    expectTypeOf<og.WithdrawAffiliationRequestFailure>().toEqualTypeOf<
      | 'affiliationRequestDoesNotExist'
      | 'notAuthorized'
      | 'alreadyConcluded'
      | 'invalidInput'
      | 'unavailable'
    >()
  })
  it('S-32', () => {
    expectTypeOf<og.AcceptAffiliationRequestFailure>().toEqualTypeOf<
      | 'affiliationRequestDoesNotExist'
      | 'offerNoLongerValid'
      | 'notAuthorized'
      | 'alreadyHasAParentOrganization'
      | 'wouldFormACycle'
      | 'personalOrganizationTakesNoPartInAffiliation'
      | 'invalidInput'
      | 'unavailable'
    >()
  })
  it('S-33', () => {
    expectTypeOf<og.DissolveAffiliationFailure>().toEqualTypeOf<
      'noSuchAffiliation' | 'notAuthorized' | 'invalidInput' | 'unavailable'
    >()
  })
  it('S-34', () => {
    expectTypeOf<og.AncestorChainFailure>().toEqualTypeOf<
      'organizationDoesNotExist' | 'invalidInput' | 'unavailable'
    >()
  })
  it('S-35：只有 invalidInput，没有 unavailable', () => {
    expectTypeOf<og.ScopeLayersFailure>().toEqualTypeOf<'invalidInput'>()
  })
  it('S-36', () => {
    expectTypeOf<og.CurrentTenantFailure>().toEqualTypeOf<
      'loginStateNotValid' | 'invalidInput' | 'unavailable'
    >()
  })
  it('S-37', () => {
    expectTypeOf<og.SwitchCurrentTenantFailure>().toEqualTypeOf<
      | 'loginStateNotValid'
      | 'notOwnTenant'
      | 'membershipNotEffective'
      | 'invalidInput'
      | 'unavailable'
    >()
  })
  it('S-53 恰六个', () => {
    expectTypeOf<og.PurgePersonalOrganizationFailure>().toEqualTypeOf<
      | 'organizationIsNotPersonal'
      | 'accountIsActivated'
      | 'accountNotExpired'
      | 'accountDoesNotExist'
      | 'invalidInput'
      | 'unavailable'
    >()
  })
  it('S-55～S-60 六个读面', () => {
    expectTypeOf<og.ReadInvitationFailure>().toEqualTypeOf<
      'invitationDoesNotExist' | 'invalidInput' | 'unavailable'
    >()
    expectTypeOf<og.ReadAffiliationRequestFailure>().toEqualTypeOf<
      'affiliationRequestDoesNotExist' | 'invalidInput' | 'unavailable'
    >()
    expectTypeOf<og.ListReceivedInvitationsFailure>().toEqualTypeOf<
      'invalidInput' | 'unavailable'
    >()
    expectTypeOf<og.ListIssuedFailure>().toEqualTypeOf<
      'notAuthorized' | 'invalidInput' | 'unavailable'
    >()
    expectTypeOf<og.ListMembersFailure>().toEqualTypeOf<
      'notAuthorized' | 'invalidInput' | 'unavailable'
    >()
    expectTypeOf<og.ListReceivedAffiliationRequestsFailure>().toEqualTypeOf<
      'notAuthorized' | 'invalidInput' | 'unavailable'
    >()
  })
  it('S-55 调用方判别式集合封闭', () => {
    expectTypeOf<og.OfferReader['kind']>().toEqualTypeOf<'account' | 'tenant'>()
  })
})

describe('E-4：S-36／S-37 的登录状态参数是 LoginStateId 品牌（D-028；AI v2 S-30 第 10 行）', () => {
  it('交 LoginStateId 编译通过；交 unknown 或 string 编译失败（去掉 @ts-expect-error 即红）', () => {
    const memberships = {} as og.MembershipsService
    const branded = 'ls-1' as LoginStateId
    const wire: string = 'ls-1'
    const anything: unknown = 'ls-1'
    // 类型层只检查调用形状，不运行
    const check = () => {
      void memberships.currentTenant(branded)
      void memberships.switchCurrentTenant(branded, { organization: 'o', account: 'a' })
      // @ts-expect-error 线上收到的串交不进来
      void memberships.currentTenant(wire)
      // @ts-expect-error unknown 不能冒充品牌
      void memberships.currentTenant(anything)
      // @ts-expect-error 线上收到的串交不进来
      void memberships.switchCurrentTenant(wire, { organization: 'o', account: 'a' })
      // @ts-expect-error unknown 不能冒充品牌
      void memberships.switchCurrentTenant(anything, { organization: 'o', account: 'a' })
    }
    expectTypeOf(check).toBeFunction()
    expectTypeOf<
      Parameters<og.MembershipsService['currentTenant']>[0]
    >().toEqualTypeOf<LoginStateId>()
    expectTypeOf<
      Parameters<og.MembershipsService['switchCurrentTenant']>[0]
    >().toEqualTypeOf<LoginStateId>()
  })
})

describe('S-26 返回值是闭合和：invalidInput | MembershipStandingResult（右支恰两支）', () => {
  it('不把 invalidInput 塞进 MembershipStandingResult', () => {
    type StandingReturn = Awaited<ReturnType<og.MembershipsService['standing']>>
    expectTypeOf<StandingReturn>().toEqualTypeOf<
      MembershipStandingResult | { readonly failure: 'invalidInput' }
    >()
    expectTypeOf<Extract<MembershipStandingResult, { failure: unknown }>>().toEqualTypeOf<{
      readonly failure: 'unavailable'
    }>()
  })
})

describe('S-34 读面的成功值不再嵌套一层失败', () => {
  it('ancestorChain 成功是组织序列、shareAncestor 成功是布尔', () => {
    type Chain = Awaited<ReturnType<og.OrganizationsService['ancestorChain']>>
    type Share = Awaited<ReturnType<og.OrganizationsService['shareAncestor']>>
    expectTypeOf<Extract<Chain, { ok: unknown }>['ok']>().toEqualTypeOf<readonly OrganizationId[]>()
    expectTypeOf<Extract<Share, { ok: unknown }>['ok']>().toEqualTypeOf<boolean>()
  })
})

describe('I-4 迁移工厂的导出形状（tenancy-host 消费，不改）', () => {
  it('({ ownerAccountReference: { table, column }, ownerAccountForeignKey }) ⇒ readonly MigrationFragment[]', () => {
    expectTypeOf(og.organizationGovernanceMigrations)
      .parameter(0)
      .toEqualTypeOf<og.OrganizationGovernanceMigrationOptions>()
    expectTypeOf<og.OrganizationGovernanceMigrationOptions>().toEqualTypeOf<{
      readonly ownerAccountReference: { readonly table: string; readonly column: string }
      readonly ownerAccountForeignKey: string
    }>()
    expectTypeOf(og.organizationGovernanceMigrations).returns.toEqualTypeOf<
      readonly MigrationFragment[]
    >()
  })
})
