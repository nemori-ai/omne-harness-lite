import type { TenantId } from '@omne-harness-lite/identity-values'

export type HoldingTenantResult =
  | { readonly tenant: TenantId }
  | { readonly failure: 'invalidInput' | 'sessionNotFound' | 'unavailable' }
export interface SessionTenancyService {
  holdingTenant(session: unknown): Promise<HoldingTenantResult>
}
