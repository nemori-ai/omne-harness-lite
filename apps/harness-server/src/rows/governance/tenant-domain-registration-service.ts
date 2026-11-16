import { type Context, Service } from '@deepseek-ai/cordis'

export type TenantDomainRegistrationResult =
  | Readonly<{ kind: 'ready' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type TenantDomainRegistration = Readonly<{
  ensure(input: Readonly<{ tenant: string }>): Promise<TenantDomainRegistrationResult>
}>

export abstract class TenantDomainRegistrationService
  extends Service
  implements TenantDomainRegistration
{
  static readonly provide = 'tenantDomainRegistration'
  constructor(ctx: Context) {
    super(ctx, TenantDomainRegistrationService.provide)
  }
  abstract readonly ensure: TenantDomainRegistration['ensure']
}

export const tenantDomainRegistrationKey = TenantDomainRegistrationService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    tenantDomainRegistration: TenantDomainRegistrationService
  }
}
