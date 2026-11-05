import { type Context, Service } from '@deepseek-ai/cordis'
import type { StandingReservations, StandingDestinationResolver } from './reservations.ts'
import type { IdentityGovernanceRecovery } from './governance.ts'
import type { IdentityGovernance } from './governance.ts'
import type { IdentityClock, IdentityOperations } from './operations.ts'
import type { PrincipalIssuer, PrincipalVerifier } from './principal.ts'
import type { TenantStandingSource } from './standing.ts'

/** @owner packages/identity/identity */
export abstract class IdentityOperationsService extends Service implements IdentityOperations {
  static readonly provide = 'identityOperations'
  constructor(ctx: Context) {
    super(ctx, IdentityOperationsService.provide)
  }
  abstract readonly registerAndActivate: IdentityOperations['registerAndActivate']
  abstract readonly issueLogin: IdentityOperations['issueLogin']
  abstract readonly recognizeLogin: IdentityOperations['recognizeLogin']
}
export const identityOperationsKey = IdentityOperationsService.provide

/** @owner packages/identity/identity */
export abstract class TenantStandingSourceService extends Service implements TenantStandingSource {
  static readonly provide = 'tenantStanding'
  constructor(ctx: Context) {
    super(ctx, TenantStandingSourceService.provide)
  }
  abstract readonly read: TenantStandingSource['read']
}
export const tenantStandingKey = TenantStandingSourceService.provide

/** @owner packages/identity/identity */
export abstract class PrincipalVerifierService extends Service implements PrincipalVerifier {
  static readonly provide = 'principalVerifier'
  constructor(ctx: Context) {
    super(ctx, PrincipalVerifierService.provide)
  }
  abstract readonly verify: PrincipalVerifier['verify']
}
export const principalVerifierKey = PrincipalVerifierService.provide

/** @owner packages/identity/identity */
export abstract class PrincipalIssuerService extends Service implements PrincipalIssuer {
  static readonly provide = 'principalIssuer'
  constructor(ctx: Context) {
    super(ctx, PrincipalIssuerService.provide)
  }
  abstract readonly issueSystem: PrincipalIssuer['issueSystem']
  abstract readonly issueActingForTenant: PrincipalIssuer['issueActingForTenant']
}
export const principalIssuerKey = PrincipalIssuerService.provide

/**
 * The injected time source of a provider (ID-17 "端口与注入"), as a Cordis seam: the assembly
 * entry provides it, a persistent provider injects it. An additive definition (R1-D27).
 * @owner packages/identity/identity
 */
export abstract class IdentityClockService extends Service implements IdentityClock {
  static readonly provide = 'identityClock'
  constructor(ctx: Context) {
    super(ctx, IdentityClockService.provide)
  }
  abstract readonly now: IdentityClock['now']
}
export const identityClockKey = IdentityClockService.provide

/**
 * The governance port (ID-18) as a Cordis seam: a provider that keeps the identity records
 * provides it next to `identityOperations`. An additive definition (R1-D27, R2-D203).
 * @owner packages/identity/identity
 */
export abstract class IdentityGovernanceService extends Service implements IdentityGovernance {
  static readonly provide = 'identityGovernance'
  constructor(ctx: Context) {
    super(ctx, IdentityGovernanceService.provide)
  }
  abstract readonly createOrganization: IdentityGovernance['createOrganization']
  abstract readonly queryCreateOrganization: IdentityGovernance['queryCreateOrganization']
  abstract readonly issueMemberInvitation: IdentityGovernance['issueMemberInvitation']
  abstract readonly acceptMemberInvitation: IdentityGovernance['acceptMemberInvitation']
  abstract readonly rejectMemberInvitation: IdentityGovernance['rejectMemberInvitation']
  abstract readonly withdrawMemberInvitation: IdentityGovernance['withdrawMemberInvitation']
  abstract readonly queryInvitation: IdentityGovernance['queryInvitation']
  abstract readonly queryReceivedInvitations: IdentityGovernance['queryReceivedInvitations']
  abstract readonly queryIssuedInvitations: IdentityGovernance['queryIssuedInvitations']
  abstract readonly queryOwnMemberships: IdentityGovernance['queryOwnMemberships']
  abstract readonly queryOrganizationMembers: IdentityGovernance['queryOrganizationMembers']
  abstract readonly leaveOrganization: IdentityGovernance['leaveOrganization']
  abstract readonly removeMember: IdentityGovernance['removeMember']
  abstract readonly changeMemberRole: IdentityGovernance['changeMemberRole']
  abstract readonly switchCurrentTenant: IdentityGovernance['switchCurrentTenant']
  abstract readonly queryCurrentTenant: IdentityGovernance['queryCurrentTenant']
  abstract readonly revokeLogin: IdentityGovernance['revokeLogin']
  abstract readonly queryOwnValidLogins: IdentityGovernance['queryOwnValidLogins']
  abstract readonly reportBusinessAccess: IdentityGovernance['reportBusinessAccess']
}
export const identityGovernanceKey = IdentityGovernanceService.provide

/** @owner packages/identity/identity */
export abstract class StandingReservationsService extends Service implements StandingReservations {
  static readonly provide = 'standingReservations'
  constructor(ctx: Context) {
    super(ctx, StandingReservationsService.provide)
  }
  abstract readonly reserve: StandingReservations['reserve']
  abstract readonly settle: StandingReservations['settle']
  abstract readonly recover: StandingReservations['recover']
}
export const standingReservationsKey = StandingReservationsService.provide

/** Trusted assembly provides this optional route. Absence retains every held reservation.
 * @owner packages/identity/identity */
export abstract class StandingDestinationResolverService
  extends Service
  implements StandingDestinationResolver
{
  static readonly provide = 'standingDestinationResolver'
  constructor(ctx: Context) {
    super(ctx, StandingDestinationResolverService.provide)
  }
  abstract readonly seal: StandingDestinationResolver['seal']
}
export const standingDestinationResolverKey = StandingDestinationResolverService.provide

/** @owner packages/identity/identity */
export abstract class IdentityGovernanceRecoveryService
  extends Service
  implements IdentityGovernanceRecovery
{
  static readonly provide = 'identityGovernanceRecovery'
  constructor(ctx: Context) {
    super(ctx, IdentityGovernanceRecoveryService.provide)
  }
  abstract readonly resume: IdentityGovernanceRecovery['resume']
  abstract readonly recover: IdentityGovernanceRecovery['recover']
}
export const identityGovernanceRecoveryKey = IdentityGovernanceRecoveryService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    standingReservations: StandingReservationsService
    standingDestinationResolver: StandingDestinationResolverService
    identityGovernanceRecovery: IdentityGovernanceRecoveryService
    identityOperations: IdentityOperationsService
    tenantStanding: TenantStandingSourceService
    principalVerifier: PrincipalVerifierService
    principalIssuer: PrincipalIssuerService
    identityClock: IdentityClockService
    identityGovernance: IdentityGovernanceService
  }
}
