import type { Context } from '@deepseek-ai/cordis'
import { expectTypeOf } from 'vitest'
import type { LoginStateId, TenantId } from '@omne-harness/legal-identity'
import type {
  BusinessAccessReport,
  IdentityClock,
  IdentityGovernance,
  IdentityOperations,
  InvitationDispositionInput,
  InvitationListOutcome,
  InvitationTermsSource,
  IssueMemberInvitationInput,
  LoginTermsSource,
  RevokeLoginOutcome,
  SwitchCurrentTenantOutcome,
  ValidLogin,
} from '@omne-harness/identity'
import { IdentityGovernanceService, identityGovernanceKey } from '@omne-harness/identity/cordis'
import { inProcessIdentity } from '@omne-harness/identity/testing'

declare const clock: IdentityClock
declare const terms: LoginTermsSource
declare const invitationTerms: InvitationTermsSource
declare const login: LoginStateId
declare const actingTenant: TenantId

expectTypeOf<keyof IdentityOperations>().toEqualTypeOf<
  'registerAndActivate' | 'issueLogin' | 'recognizeLogin'
>()
expectTypeOf<keyof IdentityGovernance>().toEqualTypeOf<
  | 'createOrganization'
  | 'queryCreateOrganization'
  | 'issueMemberInvitation'
  | 'acceptMemberInvitation'
  | 'rejectMemberInvitation'
  | 'withdrawMemberInvitation'
  | 'queryInvitation'
  | 'queryReceivedInvitations'
  | 'queryIssuedInvitations'
  | 'queryOwnMemberships'
  | 'queryOrganizationMembers'
  | 'leaveOrganization'
  | 'removeMember'
  | 'changeMemberRole'
  | 'switchCurrentTenant'
  | 'queryCurrentTenant'
  | 'revokeLogin'
  | 'queryOwnValidLogins'
  | 'reportBusinessAccess'
>()

expectTypeOf<IdentityGovernanceService['revokeLogin']>().toEqualTypeOf<
  IdentityGovernance['revokeLogin']
>()
expectTypeOf<IdentityGovernanceService['reportBusinessAccess']>().toEqualTypeOf<
  IdentityGovernance['reportBusinessAccess']
>()
expectTypeOf<IdentityGovernanceService>().toExtend<IdentityGovernance>()
declare const ctx: Context
expectTypeOf(ctx[identityGovernanceKey]).toEqualTypeOf<IdentityGovernanceService>()
// @ts-expect-error governance is not the operations port
const wrongPort: IdentityOperations = ctx[identityGovernanceKey]
// @ts-expect-error definitions need a concrete provider
new IdentityGovernanceService(ctx)

// @ts-expect-error the invitation terms are required
inProcessIdentity({ clock, terms })
const double: IdentityGovernance = inProcessIdentity({ clock, terms, invitationTerms }).governance

const issue: IssueMemberInvitationInput = { login, actingTenant, invitedLoginIdentifier: 'bob' }
// @ts-expect-error an invitation carries no role
const withRole: IssueMemberInvitationInput = { ...issue, role: 'super-admin' }
const accepted: InvitationDispositionInput = {
  login,
  actingTenant,
  invitation: 'inv',
  // @ts-expect-error a disposition expects the open state
  expectedState: 'accepted',
}

declare const switched: SwitchCurrentTenantOutcome
if (switched.kind === 'succeeded') {
  expectTypeOf(switched.tenant).toEqualTypeOf<TenantId>()
} else {
  // @ts-expect-error only succeeded names a tenant
  void switched.tenant
}

declare const revoked: RevokeLoginOutcome
if (revoked.kind === 'denied' || revoked.kind === 'not-visible') {
  // @ts-expect-error a refusal carries no reason
  void revoked.reason
}
// @ts-expect-error no answer of its own for another account
const foreign: RevokeLoginOutcome = { kind: 'other-account' }

declare const listed: InvitationListOutcome
if (listed.kind === 'basis-unavailable') {
  // @ts-expect-error no partial list
  void listed.invitations
}

declare const valid: ValidLogin
// @ts-expect-error the list carries no proof
void valid.loginProof

declare const report: BusinessAccessReport
if (report.kind === 'not-refreshed') {
  // @ts-expect-error not-refreshed carries no deadline
  void report.idleDeadline
}

void wrongPort
void double
void withRole
void accepted
void foreign
