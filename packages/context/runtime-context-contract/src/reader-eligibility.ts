import type { TenantId } from '@omne-harness/legal-identity'
import type { EligibilityId } from './registration.js'
import type { ConsumerClass, ScopeRef } from './shared.js'

/** Who asks for the reader eligibility of which scope and consumer class (RC-03). */
export type ReaderEligibilityRequest<P = unknown> = Readonly<{
  principal: P
  tenant: TenantId
  scope: ScopeRef
  consumer: ConsumerClass
}>

/**
 * The answer of the scope holder. `current` names an eligibility the holder issued, before or for
 * this request; `absent` means the holder has none and issues none. A tenant that the scope does not
 * belong to is `refused`.
 */
export type ReaderEligibilityResult =
  | Readonly<{ kind: 'current'; eligibility: EligibilityId }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'refused' }>
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/**
 * The scope holder hands an eligibility id to the party that builds a reader. The handoff grants no
 * read: the reader binds the id, and every read checks the eligibility (RC-03).
 */
export interface ReaderEligibilityHandoff<P = unknown> {
  current(request: ReaderEligibilityRequest<P>): Promise<ReaderEligibilityResult>
}
