// 失败集合闭合：每个操作的失败字面量集合与契约 ⑥ 逐字相等（类型层）。
import { describe, expectTypeOf, it } from 'vitest'
import type * as og from '../src/index.ts'

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
