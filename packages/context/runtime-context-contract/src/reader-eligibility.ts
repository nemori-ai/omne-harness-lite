import type { TenantId } from '@omne-harness/legal-identity'
import type { EligibilityId } from './registration.js'
import type { ConsumerClass, ScopeRef } from './shared.js'

export type ReaderEligibilityRequest<P = unknown> = Readonly<{
  principal: P
  tenant: TenantId
  scope: ScopeRef
  consumer: ConsumerClass
}>

export type ReaderEligibilityResult =
  | Readonly<{ kind: 'current'; eligibility: EligibilityId }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'refused' }>
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export interface ReaderEligibilityHandoff<P = unknown> {
  current(request: ReaderEligibilityRequest<P>): Promise<ReaderEligibilityResult>
}
