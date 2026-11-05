// The governance operations of identity (SPEC ID-18): organizations and memberships, the current
// tenant of a login, the logins of an account, and the report of a successful business access.
// Shapes and ports only; a provider implements `IdentityGovernance` over the same records as its
// `IdentityOperations`. The in-process reference double and the contract suite are in `./testing`.
import type {
  AccountId,
  LoginStateId,
  OrganizationId,
  TenantId,
} from '@omne-harness/legal-identity'
import type { Duration, Instant } from '@omne-harness/utc-instant'
import type { RoleRef } from './qualification.ts'

/**
 * The login that makes the call: the `login` of a recognition of the same request. The provider
 * checks again at commit that this login is valid; a login that is not valid then gives `denied`.
 */
export type GovernanceLogin = Readonly<{ login: LoginStateId }>

/**
 * A call that acts for a tenant. `actingTenant` must equal the login's current selection at
 * commit; a different value gives `denied` and does not tell the selection.
 */
export type GovernanceActing = GovernanceLogin & Readonly<{ actingTenant: TenantId }>

export type GovernanceDenied = Readonly<{ kind: 'denied' }>

/** The same answer for an object that does not exist, belongs to another account, or is hidden. */
export type GovernanceNotVisible = Readonly<{ kind: 'not-visible' }>

/** The expected state changed, and the caller can see the object. */
export type GovernanceConflict = Readonly<{ kind: 'conflict' }>

/** A record, the clock or a configuration cannot answer now. Nothing was written. */
export type GovernanceBasisUnavailable = Readonly<{ kind: 'basis-unavailable'; diagnostic: string }>

/** A write that the caller can see and that was already true: nothing new was written. */
export type GovernanceNoChange = Readonly<{ kind: 'no-change' }>

export type CreateOrganizationInput = GovernanceActing &
  Readonly<{
    /** Chosen by the caller; unique among the `createOrganization` calls of the login's account. */
    createCallId: string
    name: string
    /** This stage accepts `default-team` only: the default team model, revision 1. */
    governanceModelId: string
  }>

export type CreatedOrganization = Readonly<{
  kind: 'succeeded'
  organization: OrganizationId
  /** The creator's tenant in the new organization. */
  tenant: TenantId
}>

export type CreateOrganizationOutcome =
  | CreatedOrganization
  | GovernanceDenied
  | GovernanceConflict
  | GovernanceBasisUnavailable

/** Recalls the receipt of one `createOrganization` call with the same three inputs. */
export type QueryCreateOrganizationInput = GovernanceLogin &
  Readonly<{ createCallId: string; name: string; governanceModelId: string }>

/**
 * `succeeded`, `denied` and `basis-unavailable` are the outcome that the receipt keeps (or the
 * login check of this query). `unknown`: there is no receipt of this account for the call, or the
 * receipt cannot be read now; it does not tell whether the creation happened.
 */
export type QueryCreateOrganizationOutcome =
  | CreateOrganizationOutcome
  | Readonly<{ kind: 'unknown'; diagnostic: string }>

export type InvitationState = 'open' | 'accepted' | 'rejected' | 'withdrawn' | 'expired'

export type InvitationTerminal = Exclude<InvitationState, 'open'>

/** One member invitation as a reader sees it. `state` is the state at this read. */
export type MemberInvitation = Readonly<{
  /** Opaque text that the provider emits. */
  invitation: string
  state: InvitationState
  expiresAt: Instant
  organization: OrganizationId
  invitedAccount: AccountId
}>

/** The invitation carries no role: the default team model admits a member. */
export type IssueMemberInvitationInput = GovernanceActing &
  Readonly<{
    invitedLoginIdentifier: string
    /** Absent: the default duration of the invitation terms read at this issue. */
    duration?: Duration
  }>

export type IssueMemberInvitationOutcome =
  | Readonly<{ kind: 'succeeded'; invitation: string; state: 'open'; expiresAt: Instant }>
  | GovernanceDenied
  | GovernanceNotVisible
  | GovernanceBasisUnavailable

export type InvitationDispositionInput = GovernanceActing &
  Readonly<{ invitation: string; expectedState: 'open' }>

/**
 * `succeeded` formed the terminal `state`; `no-change` carries the one terminal that was already
 * formed. Accepting while already an active member is `no-change` with `state: 'accepted'`.
 */
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

/** A whole list, or `basis-unavailable` with no list: never a partial or an empty stand-in. */
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
    /** Absent or false: the active members. True: the removed members only. */
    includeRemoved?: boolean
  }>

/** For a removed member, `role` is the role it held when it left or was removed. */
export type OrganizationMember = Readonly<{ account: AccountId; role: RoleRef }>

export type OrganizationMembersOutcome =
  | Readonly<{ kind: 'succeeded'; members: readonly OrganizationMember[] }>
  | GovernanceDenied
  | GovernanceNotVisible
  | GovernanceBasisUnavailable

/** The organization is the one of `actingTenant`; the member is the login's account. */
export type LeaveOrganizationInput = GovernanceActing

export type LeaveOrganizationOutcome =
  | Readonly<{ kind: 'succeeded' }>
  | GovernanceDenied
  | GovernanceBasisUnavailable

export type RemoveMemberInput = GovernanceActing &
  Readonly<{
    organization: OrganizationId
    account: AccountId
    /** The role name the caller saw, in the organization's governance model. */
    expectedRole: string
  }>

export type ChangeMemberRoleInput = RemoveMemberInput & Readonly<{ targetRole: string }>

export type MemberChangeOutcome =
  | Readonly<{ kind: 'succeeded' }>
  | GovernanceDenied
  | GovernanceNotVisible
  | GovernanceConflict
  | GovernanceBasisUnavailable

/** `actingTenant` is the selection before the switch; `tenant` is the target. */
export type SwitchCurrentTenantInput = GovernanceActing & Readonly<{ tenant: TenantId }>

/** Only `succeeded` names a tenant: a failure never tells the selection. */
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

/** One valid login of the account. It carries no proof and no credential. */
export type ValidLogin = Readonly<{
  login: LoginStateId
  issuedAt: Instant
  maxDeadline: Instant
  /** The idle deadline now, after the latest refresh. */
  idleDeadline: Instant
}>

export type OwnValidLoginsOutcome =
  | Readonly<{ kind: 'succeeded'; logins: readonly ValidLogin[] }>
  | GovernanceDenied
  | GovernanceBasisUnavailable

/**
 * `refreshed`: the login was valid at commit and its idle deadline is now the clock reading plus
 * the idle period frozen at issue. `not-refreshed`: the login is unknown, revoked or ended; it is
 * not revived. A report never changes the outcome that the caller already gave.
 */
export type BusinessAccessReport =
  | Readonly<{ kind: 'refreshed'; idleDeadline: Instant }>
  | Readonly<{ kind: 'not-refreshed' }>
  | GovernanceBasisUnavailable

/**
 * The governance port. Every operation checks at commit that `login` is valid; an acting call
 * also checks `actingTenant` against the current selection. No operation throws for a malformed
 * input. A rejected Promise means the outcome is unknown to the caller (ID-09).
 */
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

/**
 * The member invitation durations of the deployment. Both are longer than zero and the default is
 * not longer than the maximum. Neither has a built-in value.
 */
export type InvitationTerms = Readonly<{ defaultDuration: Duration; maxDuration: Duration }>

export type InvitationTermsReading =
  | Readonly<{ kind: 'read'; terms: InvitationTerms }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/** The injected invitation terms configuration. A provider reads it at every issue. */
export interface InvitationTermsSource {
  read(): Promise<InvitationTermsReading>
}

/** Provider-owned identity of one durable membership mutation. */
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
  /** The caller uses a valid login of the initiating account. Applying still checks the original login. */
  resume(
    input: GovernanceLogin & Readonly<{ operation: GovernanceOperationRef }>,
  ): Promise<GovernanceRecoveryOutcome>
  /** Bounded trusted recovery uses each intent's original initiating login. */
  recover(
    input?: Readonly<{ after?: string; limit?: number }>,
  ): Promise<
    | Readonly<{ kind: 'recovered'; examined: number; finished: number; next: string | null }>
    | GovernanceBasisUnavailable
  >
}
