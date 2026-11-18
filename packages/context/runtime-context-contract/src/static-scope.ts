import type { TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type { SuppliedBlockDescriptor } from './descriptor.js'
import type { NeedBinding } from './need.js'
import type { EligibilityId } from './registration.js'
import type { ConsumerClass, ContextBlockKey, ScopeRef } from './shared.js'

/** A supplied block only: a static scope has no stateful block, so it has no step (CX-46). */
export type StaticBlock = SuppliedBlockDescriptor<ContextBlockKey, unknown>

/** What one deployment registers in every scope of a static kind: the same for each tenant. */
export type StaticRegistration = Readonly<{
  blocks: readonly StaticBlock[]
  needs: readonly NeedBinding[]
}>

export type StaticScopeFailure =
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type StaticReaderRequest = Readonly<{
  consumer: ConsumerClass
  blocks: readonly ContextBlockKey[]
  needs: readonly string[]
}>

export type StaticReaderGrant = Readonly<{
  eligibility: EligibilityId
  /** What the reader asked for and this deployment does not register: missing, never empty. */
  missing: Readonly<{ blocks: readonly ContextBlockKey[]; needs: readonly string[] }>
}>

export interface StaticScopeHolder<P = unknown> {
  /** Deterministic: the same tenant gives the same reference. */
  scopeOf(tenant: TenantId): ScopeRef
  /** Recovers the scope once, then brings its registrations to the current content. Repeatable. */
  ensure(principal: P, tenant: TenantId): Promise<Outcome<ScopeRef, StaticScopeFailure>>
  issue(
    principal: P,
    tenant: TenantId,
    reader: StaticReaderRequest,
  ): Promise<Outcome<StaticReaderGrant, StaticScopeFailure>>
}

export type StaticContribution = Readonly<{
  blocks?: readonly StaticBlock[]
  needs?: readonly NeedBinding[]
}>
