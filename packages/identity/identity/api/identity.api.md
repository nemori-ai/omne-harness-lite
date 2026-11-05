# @omne-harness/identity 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `ActingForTenantPrincipal` · `principal.d.ts`
- `BusinessAccessReport` · `governance.d.ts`
- `ChangeMemberRoleInput` · `governance.d.ts`
- `ClockReading` · `operations.d.ts`
- `CreateOrganizationInput` · `governance.d.ts`
- `CreateOrganizationOutcome` · `governance.d.ts`
- `CreatedOrganization` · `governance.d.ts`
- `CurrentTenantOutcome` · `governance.d.ts`
- `DEFAULT_TEAM_MODEL` · `qualification.d.ts`
- `DEFAULT_TEAM_ROLES` · `qualification.d.ts`
- `DEFAULT_TEAM_ROLE_MAPPING` · `qualification.d.ts`
- `GovernanceActing` · `governance.d.ts`
- `GovernanceBasisUnavailable` · `governance.d.ts`
- `GovernanceConflict` · `governance.d.ts`
- `GovernanceDenied` · `governance.d.ts`
- `GovernanceLogin` · `governance.d.ts`
- `GovernanceModelRef` · `qualification.d.ts`
- `GovernanceNoChange` · `governance.d.ts`
- `GovernanceNotVisible` · `governance.d.ts`
- `GovernanceOperationRef` · `governance.d.ts`
- `GovernanceRecoveryOutcome` · `governance.d.ts`
- `IdentityClock` · `operations.d.ts`
- `IdentityGovernance` · `governance.d.ts`
- `IdentityGovernanceRecovery` · `governance.d.ts`
- `IdentityOperations` · `operations.d.ts`
- `IdentityOperationsOptions` · `operations.d.ts`
- `InvitationDispositionInput` · `governance.d.ts`
- `InvitationDispositionOutcome` · `governance.d.ts`
- `InvitationListOutcome` · `governance.d.ts`
- `InvitationState` · `governance.d.ts`
- `InvitationTerminal` · `governance.d.ts`
- `InvitationTerms` · `governance.d.ts`
- `InvitationTermsReading` · `governance.d.ts`
- `InvitationTermsSource` · `governance.d.ts`
- `IssueFailure` · `principal.d.ts`
- `IssueLoginInput` · `operations.d.ts`
- `IssueLoginOutcome` · `operations.d.ts`
- `IssueMemberInvitationInput` · `governance.d.ts`
- `IssueMemberInvitationOutcome` · `governance.d.ts`
- `IssuedLogin` · `operations.d.ts`
- `LeaveOrganizationInput` · `governance.d.ts`
- `LeaveOrganizationOutcome` · `governance.d.ts`
- `LoginCredentialInput` · `operations.d.ts`
- `LoginRecognition` · `operations.d.ts`
- `LoginTerms` · `operations.d.ts`
- `LoginTermsReading` · `operations.d.ts`
- `LoginTermsSource` · `operations.d.ts`
- `MemberChangeOutcome` · `governance.d.ts`
- `MemberInvitation` · `governance.d.ts`
- `OrganizationMember` · `governance.d.ts`
- `OrganizationMembersOutcome` · `governance.d.ts`
- `OwnMembership` · `governance.d.ts`
- `OwnMembershipsOutcome` · `governance.d.ts`
- `OwnValidLoginsOutcome` · `governance.d.ts`
- `Principal` · `principal.d.ts`
- `PrincipalAuthority` · `principal.d.ts`
- `PrincipalIssuer` · `principal.d.ts`
- `PrincipalVerification` · `principal.d.ts`
- `PrincipalVerifier` · `principal.d.ts`
- `QUALIFICATIONS` · `qualification.d.ts`
- `Qualification` · `qualification.d.ts`
- `QueryCreateOrganizationInput` · `governance.d.ts`
- `QueryCreateOrganizationOutcome` · `governance.d.ts`
- `QueryInvitationInput` · `governance.d.ts`
- `QueryInvitationOutcome` · `governance.d.ts`
- `QueryOrganizationMembersInput` · `governance.d.ts`
- `RecognizeLoginInput` · `operations.d.ts`
- `RegisterAndActivateInput` · `operations.d.ts`
- `RegisterAndActivateOutcome` · `operations.d.ts`
- `RemoveMemberInput` · `governance.d.ts`
- `RevokeLoginInput` · `governance.d.ts`
- `RevokeLoginOutcome` · `governance.d.ts`
- `RoleMapping` · `qualification.d.ts`
- `RoleQualifications` · `qualification.d.ts`
- `RoleRef` · `qualification.d.ts`
- `RoleResolutionFailure` · `qualification.d.ts`
- `StandingBinding` · `reservations.d.ts`
- `StandingDestinationResolver` · `reservations.d.ts`
- `StandingEvidence` · `standing.d.ts`
- `StandingRecoveryPage` · `reservations.d.ts`
- `StandingReservation` · `reservations.d.ts`
- `StandingReservations` · `reservations.d.ts`
- `StandingReserveOutcome` · `reservations.d.ts`
- `StandingSettleOutcome` · `reservations.d.ts`
- `StandingTerminal` · `reservations.d.ts`
- `SwitchCurrentTenantInput` · `governance.d.ts`
- `SwitchCurrentTenantOutcome` · `governance.d.ts`
- `SystemPrincipal` · `principal.d.ts`
- `TenantStandingReading` · `standing.d.ts`
- `TenantStandingSource` · `standing.d.ts`
- `ValidLogin` · `governance.d.ts`
- `WorkRef` · `principal.d.ts`
- `governanceModelEquals` · `qualification.d.ts`
- `inProcessPrincipalAuthority` · `principal.d.ts`
- `isQualification` · `qualification.d.ts`
- `isStandingBinding` · `reservations.d.ts`
- `isStandingReservation` · `reservations.d.ts`
- `qualificationsOf` · `qualification.d.ts`
- `scopeOf` · `principal.d.ts`
- `standingPrincipalRef` · `reservations.d.ts`
- `standingReservationId` · `reservations.d.ts`

## 入口 `./cordis` · `cordis.d.ts`

- `IdentityClockService` · `cordis.d.ts`
- `IdentityGovernanceRecoveryService` · `cordis.d.ts`
- `IdentityGovernanceService` · `cordis.d.ts`
- `IdentityOperationsService` · `cordis.d.ts`
- `PrincipalIssuerService` · `cordis.d.ts`
- `PrincipalVerifierService` · `cordis.d.ts`
- `StandingDestinationResolverService` · `cordis.d.ts`
- `StandingReservationsService` · `cordis.d.ts`
- `TenantStandingSourceService` · `cordis.d.ts`
- `identityClockKey` · `cordis.d.ts`
- `identityGovernanceKey` · `cordis.d.ts`
- `identityGovernanceRecoveryKey` · `cordis.d.ts`
- `identityOperationsKey` · `cordis.d.ts`
- `principalIssuerKey` · `cordis.d.ts`
- `principalVerifierKey` · `cordis.d.ts`
- `standingDestinationResolverKey` · `cordis.d.ts`
- `standingReservationsKey` · `cordis.d.ts`
- `tenantStandingKey` · `cordis.d.ts`

## 入口 `./testing` · `testing/index.d.ts`

- `AdjustableInvitationTerms` · `testing/controls.d.ts`
- `AdjustableLoginTerms` · `testing/controls.d.ts`
- `IDENTITY_CONTRACT_CASES` · `testing/contract.d.ts`
- `IDENTITY_GOVERNANCE_CONTRACT_CASES` · `testing/governance-contract.d.ts`
- `IdentityContractCaseResult` · `testing/contract.d.ts`
- `IdentityContractFixture` · `testing/contract.d.ts`
- `IdentityContractOptions` · `testing/contract.d.ts`
- `IdentityContractProviderOptions` · `testing/contract.d.ts`
- `IdentityContractReport` · `testing/contract.d.ts`
- `IdentityGovernanceContractCaseResult` · `testing/governance-contract.d.ts`
- `IdentityGovernanceContractFixture` · `testing/governance-contract.d.ts`
- `IdentityGovernanceContractOptions` · `testing/governance-contract.d.ts`
- `IdentityGovernanceContractProviderOptions` · `testing/governance-contract.d.ts`
- `IdentityGovernanceContractReport` · `testing/governance-contract.d.ts`
- `IdentityProviders` · `testing/governance-contract.d.ts`
- `InProcessIdentity` · `testing/governance-double.d.ts`
- `InProcessIdentityGovernanceOptions` · `testing/governance-double.d.ts`
- `InProcessIdentityOptions` · `testing/double.d.ts`
- `ManualIdentityClock` · `testing/controls.d.ts`
- `RecordStore` · `testing/controls.d.ts`
- `RecordStoreFaultControl` · `testing/controls.d.ts`
- `RecordStoreFaults` · `testing/controls.d.ts`
- `adjustableInvitationTerms` · `testing/controls.d.ts`
- `adjustableLoginTerms` · `testing/controls.d.ts`
- `checkIdentityGovernanceContract` · `testing/governance-contract.d.ts`
- `checkIdentityOperationsContract` · `testing/contract.d.ts`
- `inProcessIdentity` · `testing/governance-double.d.ts`
- `inProcessIdentityOperations` · `testing/double.d.ts`
- `manualIdentityClock` · `testing/controls.d.ts`
- `recordStoreFaults` · `testing/controls.d.ts`

## 声明文件 `cordis.d.ts`

```ts
import { type Context, Service } from '@deepseek-ai/cordis';
import type { StandingReservations, StandingDestinationResolver } from './reservations.ts';
import type { IdentityGovernanceRecovery } from './governance.ts';
import type { IdentityGovernance } from './governance.ts';
import type { IdentityClock, IdentityOperations } from './operations.ts';
import type { PrincipalIssuer, PrincipalVerifier } from './principal.ts';
import type { TenantStandingSource } from './standing.ts';
export declare abstract class IdentityOperationsService extends Service implements IdentityOperations {
    static readonly provide = "identityOperations";
    constructor(ctx: Context);
    abstract readonly registerAndActivate: IdentityOperations['registerAndActivate'];
    abstract readonly issueLogin: IdentityOperations['issueLogin'];
    abstract readonly recognizeLogin: IdentityOperations['recognizeLogin'];
}
export declare const identityOperationsKey = "identityOperations";
export declare abstract class TenantStandingSourceService extends Service implements TenantStandingSource {
    static readonly provide = "tenantStanding";
    constructor(ctx: Context);
    abstract readonly read: TenantStandingSource['read'];
}
export declare const tenantStandingKey = "tenantStanding";
export declare abstract class PrincipalVerifierService extends Service implements PrincipalVerifier {
    static readonly provide = "principalVerifier";
    constructor(ctx: Context);
    abstract readonly verify: PrincipalVerifier['verify'];
}
export declare const principalVerifierKey = "principalVerifier";
export declare abstract class PrincipalIssuerService extends Service implements PrincipalIssuer {
    static readonly provide = "principalIssuer";
    constructor(ctx: Context);
    abstract readonly issueSystem: PrincipalIssuer['issueSystem'];
    abstract readonly issueActingForTenant: PrincipalIssuer['issueActingForTenant'];
}
export declare const principalIssuerKey = "principalIssuer";
export declare abstract class IdentityClockService extends Service implements IdentityClock {
    static readonly provide = "identityClock";
    constructor(ctx: Context);
    abstract readonly now: IdentityClock['now'];
}
export declare const identityClockKey = "identityClock";
export declare abstract class IdentityGovernanceService extends Service implements IdentityGovernance {
    static readonly provide = "identityGovernance";
    constructor(ctx: Context);
    abstract readonly createOrganization: IdentityGovernance['createOrganization'];
    abstract readonly queryCreateOrganization: IdentityGovernance['queryCreateOrganization'];
    abstract readonly issueMemberInvitation: IdentityGovernance['issueMemberInvitation'];
    abstract readonly acceptMemberInvitation: IdentityGovernance['acceptMemberInvitation'];
    abstract readonly rejectMemberInvitation: IdentityGovernance['rejectMemberInvitation'];
    abstract readonly withdrawMemberInvitation: IdentityGovernance['withdrawMemberInvitation'];
    abstract readonly queryInvitation: IdentityGovernance['queryInvitation'];
    abstract readonly queryReceivedInvitations: IdentityGovernance['queryReceivedInvitations'];
    abstract readonly queryIssuedInvitations: IdentityGovernance['queryIssuedInvitations'];
    abstract readonly queryOwnMemberships: IdentityGovernance['queryOwnMemberships'];
    abstract readonly queryOrganizationMembers: IdentityGovernance['queryOrganizationMembers'];
    abstract readonly leaveOrganization: IdentityGovernance['leaveOrganization'];
    abstract readonly removeMember: IdentityGovernance['removeMember'];
    abstract readonly changeMemberRole: IdentityGovernance['changeMemberRole'];
    abstract readonly switchCurrentTenant: IdentityGovernance['switchCurrentTenant'];
    abstract readonly queryCurrentTenant: IdentityGovernance['queryCurrentTenant'];
    abstract readonly revokeLogin: IdentityGovernance['revokeLogin'];
    abstract readonly queryOwnValidLogins: IdentityGovernance['queryOwnValidLogins'];
    abstract readonly reportBusinessAccess: IdentityGovernance['reportBusinessAccess'];
}
export declare const identityGovernanceKey = "identityGovernance";
export declare abstract class StandingReservationsService extends Service implements StandingReservations {
    static readonly provide = "standingReservations";
    constructor(ctx: Context);
    abstract readonly reserve: StandingReservations['reserve'];
    abstract readonly settle: StandingReservations['settle'];
    abstract readonly recover: StandingReservations['recover'];
}
export declare const standingReservationsKey = "standingReservations";
export declare abstract class StandingDestinationResolverService extends Service implements StandingDestinationResolver {
    static readonly provide = "standingDestinationResolver";
    constructor(ctx: Context);
    abstract readonly seal: StandingDestinationResolver['seal'];
}
export declare const standingDestinationResolverKey = "standingDestinationResolver";
export declare abstract class IdentityGovernanceRecoveryService extends Service implements IdentityGovernanceRecovery {
    static readonly provide = "identityGovernanceRecovery";
    constructor(ctx: Context);
    abstract readonly resume: IdentityGovernanceRecovery['resume'];
    abstract readonly recover: IdentityGovernanceRecovery['recover'];
}
export declare const identityGovernanceRecoveryKey = "identityGovernanceRecovery";
declare module '@deepseek-ai/cordis' {
    interface Context {
        standingReservations: StandingReservationsService;
        standingDestinationResolver: StandingDestinationResolverService;
        identityGovernanceRecovery: IdentityGovernanceRecoveryService;
        identityOperations: IdentityOperationsService;
        tenantStanding: TenantStandingSourceService;
        principalVerifier: PrincipalVerifierService;
        principalIssuer: PrincipalIssuerService;
        identityClock: IdentityClockService;
        identityGovernance: IdentityGovernanceService;
    }
}
```

## 声明文件 `governance.d.ts`

```ts
import type { AccountId, LoginStateId, OrganizationId, TenantId } from '@omne-harness/legal-identity';
import type { Duration, Instant } from '@omne-harness/utc-instant';
import type { RoleRef } from './qualification.ts';
export type GovernanceLogin = Readonly<{
    login: LoginStateId;
}>;
export type GovernanceActing = GovernanceLogin & Readonly<{
    actingTenant: TenantId;
}>;
export type GovernanceDenied = Readonly<{
    kind: 'denied';
}>;
export type GovernanceNotVisible = Readonly<{
    kind: 'not-visible';
}>;
export type GovernanceConflict = Readonly<{
    kind: 'conflict';
}>;
export type GovernanceBasisUnavailable = Readonly<{
    kind: 'basis-unavailable';
    diagnostic: string;
}>;
export type GovernanceNoChange = Readonly<{
    kind: 'no-change';
}>;
export type CreateOrganizationInput = GovernanceActing & Readonly<{
    createCallId: string;
    name: string;
    governanceModelId: string;
}>;
export type CreatedOrganization = Readonly<{
    kind: 'succeeded';
    organization: OrganizationId;
    tenant: TenantId;
}>;
export type CreateOrganizationOutcome = CreatedOrganization | GovernanceDenied | GovernanceConflict | GovernanceBasisUnavailable;
export type QueryCreateOrganizationInput = GovernanceLogin & Readonly<{
    createCallId: string;
    name: string;
    governanceModelId: string;
}>;
export type QueryCreateOrganizationOutcome = CreateOrganizationOutcome | Readonly<{
    kind: 'unknown';
    diagnostic: string;
}>;
export type InvitationState = 'open' | 'accepted' | 'rejected' | 'withdrawn' | 'expired';
export type InvitationTerminal = Exclude<InvitationState, 'open'>;
export type MemberInvitation = Readonly<{
    invitation: string;
    state: InvitationState;
    expiresAt: Instant;
    organization: OrganizationId;
    invitedAccount: AccountId;
}>;
export type IssueMemberInvitationInput = GovernanceActing & Readonly<{
    invitedLoginIdentifier: string;
    duration?: Duration;
}>;
export type IssueMemberInvitationOutcome = Readonly<{
    kind: 'succeeded';
    invitation: string;
    state: 'open';
    expiresAt: Instant;
}> | GovernanceDenied | GovernanceNotVisible | GovernanceBasisUnavailable;
export type InvitationDispositionInput = GovernanceActing & Readonly<{
    invitation: string;
    expectedState: 'open';
}>;
export type InvitationDispositionOutcome = Readonly<{
    kind: 'succeeded';
    invitation: string;
    state: InvitationTerminal;
}> | Readonly<{
    kind: 'no-change';
    invitation: string;
    state: InvitationTerminal;
}> | GovernanceDenied | GovernanceNotVisible | GovernanceBasisUnavailable;
export type QueryInvitationInput = GovernanceActing & Readonly<{
    invitation: string;
}>;
export type QueryInvitationOutcome = Readonly<{
    kind: 'succeeded';
    invitation: MemberInvitation;
}> | GovernanceDenied | GovernanceNotVisible | GovernanceBasisUnavailable;
export type InvitationListOutcome = Readonly<{
    kind: 'succeeded';
    invitations: readonly MemberInvitation[];
}> | GovernanceDenied | GovernanceBasisUnavailable;
export type OwnMembership = Readonly<{
    organization: OrganizationId;
    tenant: TenantId;
    role: RoleRef;
}>;
export type OwnMembershipsOutcome = Readonly<{
    kind: 'succeeded';
    memberships: readonly OwnMembership[];
}> | GovernanceDenied | GovernanceBasisUnavailable;
export type QueryOrganizationMembersInput = GovernanceActing & Readonly<{
    organization: OrganizationId;
    includeRemoved?: boolean;
}>;
export type OrganizationMember = Readonly<{
    account: AccountId;
    role: RoleRef;
}>;
export type OrganizationMembersOutcome = Readonly<{
    kind: 'succeeded';
    members: readonly OrganizationMember[];
}> | GovernanceDenied | GovernanceNotVisible | GovernanceBasisUnavailable;
export type LeaveOrganizationInput = GovernanceActing;
export type LeaveOrganizationOutcome = Readonly<{
    kind: 'succeeded';
}> | GovernanceDenied | GovernanceBasisUnavailable;
export type RemoveMemberInput = GovernanceActing & Readonly<{
    organization: OrganizationId;
    account: AccountId;
    expectedRole: string;
}>;
export type ChangeMemberRoleInput = RemoveMemberInput & Readonly<{
    targetRole: string;
}>;
export type MemberChangeOutcome = Readonly<{
    kind: 'succeeded';
}> | GovernanceDenied | GovernanceNotVisible | GovernanceConflict | GovernanceBasisUnavailable;
export type SwitchCurrentTenantInput = GovernanceActing & Readonly<{
    tenant: TenantId;
}>;
export type SwitchCurrentTenantOutcome = Readonly<{
    kind: 'succeeded';
    tenant: TenantId;
}> | GovernanceNoChange | GovernanceDenied | GovernanceBasisUnavailable;
export type CurrentTenantOutcome = Readonly<{
    kind: 'succeeded';
    tenant: TenantId;
}> | GovernanceDenied | GovernanceBasisUnavailable;
export type RevokeLoginInput = GovernanceLogin & Readonly<{
    target: LoginStateId;
}>;
export type RevokeLoginOutcome = Readonly<{
    kind: 'succeeded';
}> | GovernanceNoChange | GovernanceDenied | GovernanceNotVisible | GovernanceBasisUnavailable;
export type ValidLogin = Readonly<{
    login: LoginStateId;
    issuedAt: Instant;
    maxDeadline: Instant;
    idleDeadline: Instant;
}>;
export type OwnValidLoginsOutcome = Readonly<{
    kind: 'succeeded';
    logins: readonly ValidLogin[];
}> | GovernanceDenied | GovernanceBasisUnavailable;
export type BusinessAccessReport = Readonly<{
    kind: 'refreshed';
    idleDeadline: Instant;
}> | Readonly<{
    kind: 'not-refreshed';
}> | GovernanceBasisUnavailable;
export interface IdentityGovernance {
    createOrganization(input: CreateOrganizationInput): Promise<CreateOrganizationOutcome>;
    queryCreateOrganization(input: QueryCreateOrganizationInput): Promise<QueryCreateOrganizationOutcome>;
    issueMemberInvitation(input: IssueMemberInvitationInput): Promise<IssueMemberInvitationOutcome>;
    acceptMemberInvitation(input: InvitationDispositionInput): Promise<InvitationDispositionOutcome>;
    rejectMemberInvitation(input: InvitationDispositionInput): Promise<InvitationDispositionOutcome>;
    withdrawMemberInvitation(input: InvitationDispositionInput): Promise<InvitationDispositionOutcome>;
    queryInvitation(input: QueryInvitationInput): Promise<QueryInvitationOutcome>;
    queryReceivedInvitations(input: GovernanceLogin): Promise<InvitationListOutcome>;
    queryIssuedInvitations(input: GovernanceActing): Promise<InvitationListOutcome>;
    queryOwnMemberships(input: GovernanceLogin): Promise<OwnMembershipsOutcome>;
    queryOrganizationMembers(input: QueryOrganizationMembersInput): Promise<OrganizationMembersOutcome>;
    leaveOrganization(input: LeaveOrganizationInput): Promise<LeaveOrganizationOutcome>;
    removeMember(input: RemoveMemberInput): Promise<MemberChangeOutcome>;
    changeMemberRole(input: ChangeMemberRoleInput): Promise<MemberChangeOutcome>;
    switchCurrentTenant(input: SwitchCurrentTenantInput): Promise<SwitchCurrentTenantOutcome>;
    queryCurrentTenant(input: GovernanceLogin): Promise<CurrentTenantOutcome>;
    revokeLogin(input: RevokeLoginInput): Promise<RevokeLoginOutcome>;
    queryOwnValidLogins(input: GovernanceLogin): Promise<OwnValidLoginsOutcome>;
    reportBusinessAccess(input: GovernanceLogin): Promise<BusinessAccessReport>;
}
export type InvitationTerms = Readonly<{
    defaultDuration: Duration;
    maxDuration: Duration;
}>;
export type InvitationTermsReading = Readonly<{
    kind: 'read';
    terms: InvitationTerms;
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export interface InvitationTermsSource {
    read(): Promise<InvitationTermsReading>;
}
export type GovernanceOperationRef = Readonly<{
    operationId: string;
}>;
export type GovernanceRecoveryOutcome = Readonly<{
    kind: 'finished';
    operation: GovernanceOperationRef;
    outcome: LeaveOrganizationOutcome | MemberChangeOutcome | InvitationDispositionOutcome;
}> | Readonly<{
    kind: 'pending';
    operation: GovernanceOperationRef;
}> | GovernanceDenied | GovernanceNotVisible | GovernanceBasisUnavailable;
export interface IdentityGovernanceRecovery {
    resume(input: GovernanceLogin & Readonly<{
        operation: GovernanceOperationRef;
    }>): Promise<GovernanceRecoveryOutcome>;
    recover(input?: Readonly<{
        after?: string;
        limit?: number;
    }>): Promise<Readonly<{
        kind: 'recovered';
        examined: number;
        finished: number;
        next: string | null;
    }> | GovernanceBasisUnavailable>;
}
```

## 声明文件 `index.d.ts`

```ts
export { inProcessPrincipalAuthority, scopeOf } from './principal.ts';
export type { ActingForTenantPrincipal, IssueFailure, Principal, PrincipalAuthority, PrincipalIssuer, PrincipalVerification, PrincipalVerifier, SystemPrincipal, WorkRef, } from './principal.ts';
export { DEFAULT_TEAM_MODEL, DEFAULT_TEAM_ROLES, DEFAULT_TEAM_ROLE_MAPPING, QUALIFICATIONS, governanceModelEquals, isQualification, qualificationsOf, } from './qualification.ts';
export type { GovernanceModelRef, Qualification, RoleMapping, RoleQualifications, RoleRef, RoleResolutionFailure, } from './qualification.ts';
export type { StandingEvidence, TenantStandingReading, TenantStandingSource } from './standing.ts';
export type { ClockReading, IdentityClock, IdentityOperations, IdentityOperationsOptions, IssuedLogin, IssueLoginInput, IssueLoginOutcome, LoginCredentialInput, LoginRecognition, LoginTerms, LoginTermsReading, LoginTermsSource, RecognizeLoginInput, RegisterAndActivateInput, RegisterAndActivateOutcome, } from './operations.ts';
export type { BusinessAccessReport, ChangeMemberRoleInput, CreatedOrganization, CreateOrganizationInput, CreateOrganizationOutcome, CurrentTenantOutcome, GovernanceActing, GovernanceBasisUnavailable, GovernanceConflict, GovernanceDenied, GovernanceLogin, GovernanceNoChange, GovernanceNotVisible, IdentityGovernance, InvitationDispositionInput, InvitationDispositionOutcome, InvitationListOutcome, InvitationState, InvitationTerminal, InvitationTerms, InvitationTermsReading, InvitationTermsSource, IssueMemberInvitationInput, IssueMemberInvitationOutcome, LeaveOrganizationInput, LeaveOrganizationOutcome, MemberChangeOutcome, MemberInvitation, OrganizationMember, OrganizationMembersOutcome, OwnMembership, OwnMembershipsOutcome, OwnValidLoginsOutcome, QueryCreateOrganizationInput, QueryCreateOrganizationOutcome, QueryInvitationInput, QueryInvitationOutcome, QueryOrganizationMembersInput, RemoveMemberInput, RevokeLoginInput, RevokeLoginOutcome, SwitchCurrentTenantInput, SwitchCurrentTenantOutcome, ValidLogin, } from './governance.ts';
export { standingPrincipalRef, standingReservationId, isStandingBinding, isStandingReservation, } from './reservations.ts';
export type { StandingBinding, StandingReservation, StandingTerminal, StandingDestinationResolver, StandingReserveOutcome, StandingSettleOutcome, StandingRecoveryPage, StandingReservations, } from './reservations.ts';
export type { GovernanceOperationRef, GovernanceRecoveryOutcome, IdentityGovernanceRecovery, } from './governance.ts';
```

## 声明文件 `operations.d.ts`

```ts
import type { AccountId, LoginStateId, OrganizationId, TenantId } from '@omne-harness/legal-identity';
import type { Duration, Instant } from '@omne-harness/utc-instant';
export type LoginCredentialInput = Readonly<{
    loginIdentifier: string;
    credential: string;
}>;
export type RegisterAndActivateInput = LoginCredentialInput;
export type RegisterAndActivateOutcome = Readonly<{
    kind: 'succeeded';
    account: AccountId;
    organization: OrganizationId;
    tenant: TenantId;
}> | Readonly<{
    kind: 'not-loginable';
}>;
export type IssueLoginInput = LoginCredentialInput;
export type IssuedLogin = Readonly<{
    login: LoginStateId;
    account: AccountId;
    loginIdentifier: string;
    issuedAt: Instant;
    maxDeadline: Instant;
    idleDeadline: Instant;
    tenant: TenantId;
    loginProof: string;
}>;
export type IssueLoginOutcome = (Readonly<{
    kind: 'succeeded';
}> & IssuedLogin) | Readonly<{
    kind: 'uniform-auth-failure';
}> | Readonly<{
    kind: 'basis-unavailable';
    diagnostic: string;
}>;
export type RecognizeLoginInput = Readonly<{
    loginProof: string;
}>;
export type LoginRecognition = Readonly<{
    kind: 'recognized';
    account: AccountId;
    login: LoginStateId;
    tenant: TenantId;
}> | Readonly<{
    kind: 'invalid';
}> | Readonly<{
    kind: 'basis-unavailable';
    diagnostic: string;
}>;
export interface IdentityOperations {
    registerAndActivate(input: RegisterAndActivateInput): Promise<RegisterAndActivateOutcome>;
    issueLogin(input: IssueLoginInput): Promise<IssueLoginOutcome>;
    recognizeLogin(input: RecognizeLoginInput): Promise<LoginRecognition>;
}
export type ClockReading = Readonly<{
    kind: 'read';
    instant: Instant;
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export interface IdentityClock {
    now(): Promise<ClockReading>;
}
export type LoginTerms = Readonly<{
    maxLifetime: Duration;
    idlePeriod: Duration;
}>;
export type LoginTermsReading = Readonly<{
    kind: 'read';
    terms: LoginTerms;
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export interface LoginTermsSource {
    read(): Promise<LoginTermsReading>;
}
export type IdentityOperationsOptions = Readonly<{
    clock: IdentityClock;
    terms: LoginTermsSource;
}>;
```

## 声明文件 `principal.d.ts`

```ts
import { type ActingScope, type TenantId } from '@omne-harness/legal-identity';
import { type Outcome } from '@omne-harness/operation-result';
export type SystemPrincipal = Readonly<{
    kind: 'system';
    component: string;
}>;
export type WorkRef = Readonly<{
    owner: string;
    work: string;
}>;
export type ActingForTenantPrincipal = Readonly<{
    kind: 'acting-for-tenant';
    actor: SystemPrincipal;
    tenant: TenantId;
    work: WorkRef;
}>;
export type Principal = SystemPrincipal | ActingForTenantPrincipal;
export type IssueFailure = Readonly<{
    field: 'component' | 'actor' | 'tenant' | 'work.owner' | 'work.work';
    reason: 'type' | 'empty' | 'unissued' | 'unminted';
}>;
export interface PrincipalIssuer {
    issueSystem(input: Readonly<{
        component: string;
    }>): Outcome<SystemPrincipal, IssueFailure>;
    issueActingForTenant(input: Readonly<{
        actor: SystemPrincipal;
        tenant: TenantId;
        work: WorkRef;
    }>): Outcome<ActingForTenantPrincipal, IssueFailure>;
}
export type PrincipalVerification = Readonly<{
    kind: 'verified';
    principal: Principal;
}> | Readonly<{
    kind: 'rejected';
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export interface PrincipalVerifier {
    verify(value: unknown): Promise<PrincipalVerification>;
}
export type PrincipalAuthority = Readonly<{
    issuer: PrincipalIssuer;
    verifier: PrincipalVerifier;
}>;
export declare function scopeOf(principal: Principal): ActingScope;
export declare function inProcessPrincipalAuthority(): PrincipalAuthority;
```

## 声明文件 `qualification.d.ts`

```ts
import { type Outcome } from '@omne-harness/operation-result';
export declare const QUALIFICATIONS: readonly [
    "organization-cost-ledger-read"
];
export type Qualification = (typeof QUALIFICATIONS)[number];
export declare function isQualification(value: unknown): value is Qualification;
export type GovernanceModelRef = Readonly<{
    model: string;
    revision: string;
}>;
export type RoleRef = Readonly<{
    model: GovernanceModelRef;
    role: string;
}>;
export type RoleQualifications = Readonly<{
    role: string;
    qualifications: readonly Qualification[];
}>;
export type RoleMapping = Readonly<{
    model: GovernanceModelRef;
    roles: readonly RoleQualifications[];
}>;
export type RoleResolutionFailure = Readonly<{
    reason: 'model-mismatch' | 'unknown-role';
}>;
export declare const DEFAULT_TEAM_MODEL: GovernanceModelRef;
export declare const DEFAULT_TEAM_ROLES: Readonly<{
    readonly superAdmin: 'super-admin';
    readonly member: 'member';
}>;
export declare const DEFAULT_TEAM_ROLE_MAPPING: RoleMapping;
export declare function governanceModelEquals(left: GovernanceModelRef, right: GovernanceModelRef): boolean;
export declare function qualificationsOf(mapping: RoleMapping, role: RoleRef): Outcome<readonly Qualification[], RoleResolutionFailure>;
```

## 声明文件 `reservations.d.ts`

```ts
import type { ActingForTenantPrincipal } from './principal.ts';
import { type Qualification } from './qualification.ts';
export type StandingBinding = Readonly<{
    version: 'standing/1';
    owner: string;
    operationId: string;
    principalRef: string;
    destination: string;
    scopeRef: string;
    targetRef: string;
    inputDigest: string;
}>;
export type StandingReservation = Readonly<{
    id: string;
    binding: StandingBinding;
    required: readonly Qualification[];
}>;
export type StandingTerminal = Readonly<{
    kind: 'terminal';
    reservation: StandingReservation;
    outcome: 'committed' | 'aborted';
}>;
export interface StandingDestinationResolver {
    seal(reservation: StandingReservation): Promise<StandingTerminal | Readonly<{
        kind: 'unavailable';
        diagnostic: string;
    }>>;
}
export type StandingReserveOutcome = Readonly<{
    kind: 'held';
    reservation: StandingReservation;
}> | StandingTerminal | Readonly<{
    kind: 'denied' | 'operation-conflict' | 'blocked';
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export type StandingSettleOutcome = StandingTerminal | Readonly<{
    kind: 'not-found';
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export type StandingRecoveryPage = Readonly<{
    kind: 'recovered';
    examined: number;
    settled: number;
    next: string | null;
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export interface StandingReservations {
    reserve(input: Readonly<{
        principal: ActingForTenantPrincipal;
        binding: StandingBinding;
        required: readonly Qualification[];
    }>): Promise<StandingReserveOutcome>;
    settle(id: string): Promise<StandingSettleOutcome>;
    recover(input?: Readonly<{
        after?: string;
        limit?: number;
    }>): Promise<StandingRecoveryPage>;
}
export declare function standingPrincipalRef(principal: ActingForTenantPrincipal): string;
export declare function standingReservationId(binding: StandingBinding, required: readonly Qualification[]): string;
export declare function isStandingBinding(value: unknown): value is StandingBinding;
export declare function isStandingReservation(value: unknown): value is StandingReservation;
```

## 声明文件 `standing.d.ts`

```ts
import type { TenantId } from '@omne-harness/legal-identity';
import type { Qualification, RoleRef } from './qualification.ts';
export type StandingEvidence = Readonly<{
    record: string;
    revision: string;
}>;
export type TenantStandingReading = Readonly<{
    kind: 'member';
    role: RoleRef;
    qualifications: readonly Qualification[];
    evidence: StandingEvidence;
}> | Readonly<{
    kind: 'not-member';
    evidence: StandingEvidence;
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export interface TenantStandingSource {
    read(input: Readonly<{
        tenant: TenantId;
    }>): Promise<TenantStandingReading>;
}
```

## 声明文件 `testing/contract.d.ts`

```ts
import { type Duration, type Instant } from '@omne-harness/utc-instant';
import type { IdentityOperations, IdentityOperationsOptions, LoginCredentialInput } from '../operations.ts';
import { type RecordStoreFaults } from './controls.ts';
export type IdentityContractProviderOptions = IdentityOperationsOptions & Readonly<{
    faults: RecordStoreFaults;
}>;
export interface IdentityContractFixture {
    create(options: IdentityContractProviderOptions): IdentityOperations | Promise<IdentityOperations>;
    injectsRecordFaults?: boolean;
    registerWithoutActivation?(operations: IdentityOperations, input: LoginCredentialInput): Promise<void>;
}
export type IdentityContractOptions = Readonly<{
    start: Instant;
    short: Duration;
    long: Duration;
}>;
export type IdentityContractCaseResult = Readonly<{
    id: string;
    rule: string;
    status: 'passed' | 'failed' | 'not-applicable';
    detail?: string;
}>;
export type IdentityContractReport = Readonly<{
    passed: boolean;
    cases: readonly IdentityContractCaseResult[];
}>;
export declare const IDENTITY_CONTRACT_CASES: readonly Readonly<{
    id: string;
    rule: string;
}>[];
export declare function checkIdentityOperationsContract(fixture: IdentityContractFixture, options: IdentityContractOptions): Promise<IdentityContractReport>;
```

## 声明文件 `testing/controls.d.ts`

```ts
import type { Duration, Instant } from '@omne-harness/utc-instant';
import type { InvitationTerms, InvitationTermsSource } from '../governance.ts';
import type { IdentityClock, LoginTerms, LoginTermsSource } from '../operations.ts';
export type ManualIdentityClock = Readonly<{
    clock: IdentityClock;
    current(): Instant;
    advanceBy(duration: Duration): void;
    setTo(instant: Instant): void;
    makeUnavailable(diagnostic: string): void;
    restore(): void;
}>;
export declare function manualIdentityClock(start: Instant): ManualIdentityClock;
export type RecordStore = 'accounts' | 'logins' | 'organizations';
export interface RecordStoreFaults {
    unavailable(store: RecordStore): string | undefined;
}
export type RecordStoreFaultControl = Readonly<{
    faults: RecordStoreFaults;
    makeUnavailable(store: RecordStore, diagnostic: string): void;
    restore(): void;
}>;
export declare function recordStoreFaults(): RecordStoreFaultControl;
export type AdjustableLoginTerms = Readonly<{
    source: LoginTermsSource;
    set(terms: LoginTerms): void;
    makeUnavailable(diagnostic: string): void;
    restore(): void;
}>;
export declare function adjustableLoginTerms(initial: LoginTerms): AdjustableLoginTerms;
export type AdjustableInvitationTerms = Readonly<{
    source: InvitationTermsSource;
    set(terms: InvitationTerms): void;
    makeUnavailable(diagnostic: string): void;
    restore(): void;
}>;
export declare function adjustableInvitationTerms(initial: InvitationTerms): AdjustableInvitationTerms;
```

## 声明文件 `testing/double.d.ts`

```ts
import type { IdentityOperations, IdentityOperationsOptions, LoginTermsSource } from '../operations.ts';
import type { RecordStoreFaults } from './controls.ts';
import { type IdentityRecords, type Instance } from './records.ts';
export type InProcessIdentityOptions = IdentityOperationsOptions & Readonly<{
    faults?: RecordStoreFaults;
}>;
export declare const NO_FAULTS: RecordStoreFaults;
export declare function operationsOver(records: IdentityRecords, instance: Instance, terms: LoginTermsSource): IdentityOperations;
export declare function inProcessIdentityOperations(options: InProcessIdentityOptions): IdentityOperations;
```

## 声明文件 `testing/governance-contract.d.ts`

```ts
import type { IdentityGovernance, InvitationTermsSource } from '../governance.ts';
import type { IdentityOperations } from '../operations.ts';
import type { IdentityContractOptions, IdentityContractProviderOptions } from './contract.ts';
export type IdentityProviders = Readonly<{
    operations: IdentityOperations;
    governance: IdentityGovernance;
}>;
export type IdentityGovernanceContractProviderOptions = IdentityContractProviderOptions & Readonly<{
    invitationTerms: InvitationTermsSource;
}>;
export interface IdentityGovernanceContractFixture {
    create(options: IdentityGovernanceContractProviderOptions): IdentityProviders | Promise<IdentityProviders>;
    injectsRecordFaults?: boolean;
    restart?(providers: IdentityProviders): Promise<IdentityProviders>;
}
export type IdentityGovernanceContractOptions = IdentityContractOptions;
export type IdentityGovernanceContractCaseResult = Readonly<{
    id: string;
    rule: string;
    status: 'passed' | 'failed' | 'not-applicable';
    detail?: string;
}>;
export type IdentityGovernanceContractReport = Readonly<{
    passed: boolean;
    cases: readonly IdentityGovernanceContractCaseResult[];
}>;
export declare const IDENTITY_GOVERNANCE_CONTRACT_CASES: readonly Readonly<{
    id: string;
    rule: string;
}>[];
export declare function checkIdentityGovernanceContract(fixture: IdentityGovernanceContractFixture, options: IdentityGovernanceContractOptions): Promise<IdentityGovernanceContractReport>;
```

## 声明文件 `testing/governance-double.d.ts`

```ts
import type { IdentityGovernance, InvitationTermsSource } from '../governance.ts';
import type { IdentityOperations } from '../operations.ts';
import { type InProcessIdentityOptions } from './double.ts';
import { type DoubleCheck, type IdentityRecords, type Instance } from './records.ts';
export type InProcessIdentityGovernanceOptions = InProcessIdentityOptions & Readonly<{
    invitationTerms: InvitationTermsSource;
}>;
export type InProcessIdentity = Readonly<{
    operations: IdentityOperations;
    governance: IdentityGovernance;
    restart(): InProcessIdentity;
}>;
export declare function governanceOver(records: IdentityRecords, instance: Instance, invitationTerms: InvitationTermsSource): IdentityGovernance;
export declare function inProcessIdentity(options: InProcessIdentityGovernanceOptions): InProcessIdentity;
export declare function inProcessIdentityWithout(options: InProcessIdentityGovernanceOptions, off: readonly DoubleCheck[]): InProcessIdentity;
```

## 声明文件 `testing/index.d.ts`

```ts
export { checkIdentityOperationsContract, IDENTITY_CONTRACT_CASES } from './contract.ts';
export type { IdentityContractCaseResult, IdentityContractFixture, IdentityContractOptions, IdentityContractProviderOptions, IdentityContractReport, } from './contract.ts';
export { adjustableInvitationTerms, adjustableLoginTerms, manualIdentityClock, recordStoreFaults, } from './controls.ts';
export type { AdjustableInvitationTerms, AdjustableLoginTerms, ManualIdentityClock, RecordStore, RecordStoreFaultControl, RecordStoreFaults, } from './controls.ts';
export { inProcessIdentityOperations } from './double.ts';
export type { InProcessIdentityOptions } from './double.ts';
export { checkIdentityGovernanceContract, IDENTITY_GOVERNANCE_CONTRACT_CASES, } from './governance-contract.ts';
export type { IdentityGovernanceContractCaseResult, IdentityGovernanceContractFixture, IdentityGovernanceContractOptions, IdentityGovernanceContractProviderOptions, IdentityGovernanceContractReport, IdentityProviders, } from './governance-contract.ts';
export { inProcessIdentity } from './governance-double.ts';
export type { InProcessIdentity, InProcessIdentityGovernanceOptions } from './governance-double.ts';
```

## 声明文件 `testing/records.d.ts`

```ts
import type { AccountId, IdentityTextCodec, LoginStateId, OrganizationId, TenantId } from '@omne-harness/legal-identity';
import { type Duration, type Instant } from '@omne-harness/utc-instant';
import type { CreateOrganizationOutcome, InvitationState } from '../governance.ts';
import type { IdentityClock } from '../operations.ts';
import type { RecordStore, RecordStoreFaults } from './controls.ts';
export type AccountRecord = Readonly<{
    account: AccountId;
    loginIdentifier: string;
    personal: OrganizationId;
    tenant: TenantId;
    salt: Uint8Array;
    digest: Uint8Array;
}>;
export type OrganizationRecord = Readonly<{
    organization: OrganizationId;
    kind: 'personal' | 'team';
}>;
export type MembershipRecord = {
    readonly organization: OrganizationId;
    readonly account: AccountId;
    readonly tenant: TenantId;
    state: 'active' | 'removed';
    role: string;
};
export type LoginRecord = {
    readonly login: LoginStateId;
    readonly account: AccountId;
    readonly issuedAt: Instant;
    readonly maxDeadline: Instant;
    readonly idlePeriod: Duration;
    idleDeadline: Instant;
    selection: TenantId;
    revoked: boolean;
};
export type InvitationRecord = {
    readonly invitation: string;
    readonly organization: OrganizationId;
    readonly invitedAccount: AccountId;
    readonly expiresAt: Instant;
    state: InvitationState;
};
export type CreateReceipt = Readonly<{
    name: string;
    governanceModelId: string;
    outcome: CreateOrganizationOutcome;
}>;
export type IdentityRecords = Readonly<{
    accountsByIdentifier: Map<string, AccountRecord>;
    accountsById: Map<string, AccountRecord>;
    organizations: Map<string, OrganizationRecord>;
    memberships: Map<string, MembershipRecord>;
    loginsByProof: Map<string, LoginRecord>;
    loginsById: Map<string, LoginRecord>;
    invitations: Map<string, InvitationRecord>;
    receipts: Map<string, CreateReceipt>;
}>;
export declare function newRecords(): IdentityRecords;
export declare function memberKey(organization: OrganizationId, account: AccountId): string;
export type DoubleCheck = 'acting-tenant' | 'atomic-commit' | 'create-binding' | 'duration-range' | 'expected-role' | 'expiry-persisted' | 'initiator-valid' | 'invitation-visibility' | 'invitee-only' | 'last-admin' | 'list-completeness' | 'model' | 'personal-organization' | 'refresh-live-only' | 'removed-requires-admin' | 'revocation-ends-recognition' | 'single-terminal' | 'super-admin' | 'switch-membership' | 'uniform-not-visible';
export type Unavailable = Readonly<{
    kind: 'basis-unavailable';
    diagnostic: string;
}>;
export type TimeBasis = Readonly<{
    kind: 'read';
    instant: Instant;
}> | Unavailable;
export type Instance = {
    readonly clock: IdentityClock;
    readonly faults: RecordStoreFaults;
    readonly off: ReadonlySet<DoubleCheck>;
    latest: Instant | undefined;
};
export declare function randomBody(): string;
export declare function emit<T>(codec: IdentityTextCodec<T>, prefix: string): T;
export declare function isFilledText(value: unknown): value is string;
export declare function field(input: unknown, name: string): unknown;
export declare function unavailable(diagnostic: string): Unavailable;
export declare function readTime(instance: Instance): Promise<TimeBasis>;
export declare function storeDown(instance: Instance, store: RecordStore): Unavailable | undefined;
export declare function isLive(record: LoginRecord, now: Instant): boolean;
```

## 声明文件 `testing/time.d.ts`

```ts
import { type Duration, type Instant } from '@omne-harness/utc-instant';
export declare function addDuration(instant: Instant, duration: Duration): Instant | undefined;
export declare function isPositive(duration: Duration): boolean;
export declare function justBefore(instant: Instant): Instant | undefined;
export declare function spansLeapSecond(from: Instant, to: Instant): boolean;
export declare function compareDurations(left: Duration, right: Duration): number;
export declare function timesDuration(duration: Duration, factor: number): Duration;
export declare function halfDuration(duration: Duration): Duration;
```
