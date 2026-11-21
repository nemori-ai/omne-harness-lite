import type {} from '@deepseek-ai/cordis'

export const TENANT_DOMAIN_REGISTERED = 'harness/tenant-domain-registered' as const

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * A tenant's storage domain was registered in this process. A wake-up hint only: losing it
     * changes when the tenant's governance opens, never whether a call is judged.
     *
     * @mode parallel
     */
    'harness/tenant-domain-registered'(tenant: string): void
  }
}
