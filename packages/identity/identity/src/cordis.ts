import { type Context, Service } from '@deepseek-ai/cordis'
import type { IdentityOperations } from './operations.ts'
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

declare module '@deepseek-ai/cordis' {
  interface Context {
    identityOperations: IdentityOperationsService
    tenantStanding: TenantStandingSourceService
    principalVerifier: PrincipalVerifierService
    principalIssuer: PrincipalIssuerService
  }
}
