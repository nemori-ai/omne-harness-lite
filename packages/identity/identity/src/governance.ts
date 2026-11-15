import type {
  AccountId,
  LoginStateId,
  OrganizationId,
  TenantId,
} from '@omne-harness/legal-identity'
import type { Duration, Instant } from '@omne-harness/utc-instant'
import type { RoleRef } from './qualification.ts'

export type GovernanceLogin = Readonly<{ login: LoginStateId }>

export type GovernanceActing = GovernanceLogin & Readonly<{ actingTenant: TenantId }>

export type GovernanceDenied = Readonly<{ kind: 'denied' }>

export type GovernanceNotVisible = Readonly<{ kind: 'not-visible' }>

export type GovernanceConflict = Readonly<{ kind: 'conflict' }>

export type GovernanceBasisUnavailable = Readonly<{ kind: 'basis-unavailable'; diagnostic: string }>

export type GovernanceNoChange = Readonly<{ kind: 'no-change' }>

export type CreateOrganizationInput = GovernanceActing &
  Readonly<{
    createCallId: string
    name: string
    governanceModelId: string
  }>

export type CreatedOrganization = Readonly<{
  kind: 'succeeded'
  organization: OrganizationId
  tenant: TenantId
}>

export type CreateOrganizationOutcome =
  | CreatedOrganization
  | GovernanceDenied
  | GovernanceConflict
  | GovernanceBasisUnavailable

export type QueryCreateOrganizationInput = GovernanceLogin &
  Readonly<{ createCallId: string; name: string; governanceModelId: string }>

export type QueryCreateOrganizationOutcome =
  | CreateOrganizationOutcome
  | Readonly<{ kind: 'unknown'; diagnostic: string }>

export type InvitationState = 'open' | 'accepted' | 'rejected' | 'withdrawn' | 'expired'

export type InvitationTerminal = Exclude<InvitationState, 'open'>

export type MemberInvitation = Readonly<{
  invitation: string
  state: InvitationState
  expiresAt: Instant
  organization: OrganizationId
  invitedAccount: AccountId
}>

export type IssueMemberInvitationInput = GovernanceActing &
  Readonly<{
    invitedLoginIdentifier: string
    duration?: Duration
  }>

export type IssueMemberInvitationOutcome =
  | Readonly<{ kind: 'succeeded'; invitation: string; state: 'open'; expiresAt: Instant }>
  | GovernanceDenied
  | GovernanceNotVisible
  | GovernanceBasisUnavailable

export type InvitationDispositionInput = GovernanceActing &
  Readonly<{ invitation: string; expectedState: 'open' }>

export type InvitationDispositionOutcome =
  | Readonly<{ kind: 'succeeded'; invitation: string; state: InvitationTerminal }>
  | Readonly<{ kind: 'no-change'; invitation: string; state: InvitationTerminal }>
  | GovernanceDenied
  | GovernanceNotVisible
  | GovernanceBasisUnavailable

export type QueryInvitationInput = GovernanceActing & Readonly<{ invitation: string }>

export type QueryInvitationOutcome =
  | Readonly<{ kind: 'succeeded'; invitation: MemberInvitation }>
  | GovernanceDenied
  | GovernanceNotVisible
  | GovernanceBasisUnavailable

export type InvitationListOutcome =
  | Readonly<{ kind: 'succeeded'; invitations: readonly MemberInvitation[] }>
  | GovernanceDenied
  | GovernanceBasisUnavailable

export type OwnMembership = Readonly<{
  organization: OrganizationId
  tenant: TenantId
  role: RoleRef
}>

export type OwnMembershipsOutcome =
  | Readonly<{ kind: 'succeeded'; memberships: readonly OwnMembership[] }>
  | GovernanceDenied
  | GovernanceBasisUnavailable

export type QueryOrganizationMembersInput = GovernanceActing &
  Readonly<{
    organization: OrganizationId
    includeRemoved?: boolean
  }>

export type OrganizationMember = Readonly<{ account: AccountId; role: RoleRef }>

export type OrganizationMembersOutcome =
  | Readonly<{ kind: 'succeeded'; members: readonly OrganizationMember[] }>
  | GovernanceDenied
  | GovernanceNotVisible
  | GovernanceBasisUnavailable

export type LeaveOrganizationInput = GovernanceActing

export type LeaveOrganizationOutcome =
  | Readonly<{ kind: 'succeeded' }>
  | GovernanceDenied
  | GovernanceBasisUnavailable

export type RemoveMemberInput = GovernanceActing &
  Readonly<{
    organization: OrganizationId
    account: AccountId
    expectedRole: string
  }>

export type ChangeMemberRoleInput = RemoveMemberInput & Readonly<{ targetRole: string }>

export type MemberChangeOutcome =
  | Readonly<{ kind: 'succeeded' }>
  | GovernanceDenied
  | GovernanceNotVisible
  | GovernanceConflict
  | GovernanceBasisUnavailable

export type SwitchCurrentTenantInput = GovernanceActing & Readonly<{ tenant: TenantId }>

export type SwitchCurrentTenantOutcome =
  | Readonly<{ kind: 'succeeded'; tenant: TenantId }>
  | GovernanceNoChange
  | GovernanceDenied
  | GovernanceBasisUnavailable

export type CurrentTenantOutcome =
  | Readonly<{ kind: 'succeeded'; tenant: TenantId }>
  | GovernanceDenied
  | GovernanceBasisUnavailable

export type RevokeLoginInput = GovernanceLogin & Readonly<{ target: LoginStateId }>

export type RevokeLoginOutcome =
  | Readonly<{ kind: 'succeeded' }>
  | GovernanceNoChange
  | GovernanceDenied
  | GovernanceNotVisible
  | GovernanceBasisUnavailable

export type ValidLogin = Readonly<{
  login: LoginStateId
  issuedAt: Instant
  maxDeadline: Instant
  idleDeadline: Instant
}>

export type OwnValidLoginsOutcome =
  | Readonly<{ kind: 'succeeded'; logins: readonly ValidLogin[] }>
  | GovernanceDenied
  | GovernanceBasisUnavailable

export type BusinessAccessReport =
  | Readonly<{ kind: 'refreshed'; idleDeadline: Instant }>
  | Readonly<{ kind: 'not-refreshed' }>
  | GovernanceBasisUnavailable

export interface IdentityGovernance {
  createOrganization(input: CreateOrganizationInput): Promise<CreateOrganizationOutcome>
  queryCreateOrganization(
    input: QueryCreateOrganizationInput,
  ): Promise<QueryCreateOrganizationOutcome>
  issueMemberInvitation(input: IssueMemberInvitationInput): Promise<IssueMemberInvitationOutcome>
  acceptMemberInvitation(input: InvitationDispositionInput): Promise<InvitationDispositionOutcome>
  rejectMemberInvitation(input: InvitationDispositionInput): Promise<InvitationDispositionOutcome>
  withdrawMemberInvitation(input: InvitationDispositionInput): Promise<InvitationDispositionOutcome>
  queryInvitation(input: QueryInvitationInput): Promise<QueryInvitationOutcome>
  queryReceivedInvitations(input: GovernanceLogin): Promise<InvitationListOutcome>
  queryIssuedInvitations(input: GovernanceActing): Promise<InvitationListOutcome>
  queryOwnMemberships(input: GovernanceLogin): Promise<OwnMembershipsOutcome>
  queryOrganizationMembers(
    input: QueryOrganizationMembersInput,
  ): Promise<OrganizationMembersOutcome>
  leaveOrganization(input: LeaveOrganizationInput): Promise<LeaveOrganizationOutcome>
  removeMember(input: RemoveMemberInput): Promise<MemberChangeOutcome>
  changeMemberRole(input: ChangeMemberRoleInput): Promise<MemberChangeOutcome>
  switchCurrentTenant(input: SwitchCurrentTenantInput): Promise<SwitchCurrentTenantOutcome>
  queryCurrentTenant(input: GovernanceLogin): Promise<CurrentTenantOutcome>
  revokeLogin(input: RevokeLoginInput): Promise<RevokeLoginOutcome>
  queryOwnValidLogins(input: GovernanceLogin): Promise<OwnValidLoginsOutcome>
  reportBusinessAccess(input: GovernanceLogin): Promise<BusinessAccessReport>
}

export type InvitationTerms = Readonly<{ defaultDuration: Duration; maxDuration: Duration }>

export type InvitationTermsReading =
  | Readonly<{ kind: 'read'; terms: InvitationTerms }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export interface InvitationTermsSource {
  read(): Promise<InvitationTermsReading>
}

export type GovernanceOperationRef = Readonly<{ operationId: string }>

export type GovernanceRecoveryOutcome =
  | Readonly<{
      kind: 'finished'
      operation: GovernanceOperationRef
      outcome: LeaveOrganizationOutcome | MemberChangeOutcome | InvitationDispositionOutcome
    }>
  | Readonly<{ kind: 'pending'; operation: GovernanceOperationRef }>
  | GovernanceDenied
  | GovernanceNotVisible
  | GovernanceBasisUnavailable

export interface IdentityGovernanceRecovery {
  resume(
    input: GovernanceLogin & Readonly<{ operation: GovernanceOperationRef }>,
  ): Promise<GovernanceRecoveryOutcome>
  recover(
    input?: Readonly<{ after?: string; limit?: number }>,
  ): Promise<
    | Readonly<{ kind: 'recovered'; examined: number; finished: number; next: string | null }>
    | GovernanceBasisUnavailable
  >
}
