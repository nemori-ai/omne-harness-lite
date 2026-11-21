import type { TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type { SuppliedBlockDescriptor } from './descriptor.js'
import type { NeedBinding } from './need.js'
import type { SupplyCallback } from './producer.js'
import type { PerReadEntry } from './reader.js'
import type { EligibilityId } from './registration.js'
import type { ConsumerClass, ContextBlockKey, ScopeRef } from './shared.js'

/** A block of a static scope: asked for at each read, never stored, with no step (CX-46). */
export type StaticBlock<P = unknown> = Readonly<{
  declaration: SuppliedBlockDescriptor<ContextBlockKey, unknown> & { volatility: 'per-read' }
  supply: SupplyCallback<unknown, P>
}>

export type StaticRegistration<P = unknown> = Readonly<{
  blocks: readonly StaticBlock<P>[]
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

export type StaticRead = Readonly<{
  entries: readonly PerReadEntry[]
  missing: StaticReaderGrant['missing']
}>

export interface StaticScopeHolder<P = unknown> {
  scopeOf(tenant: TenantId): ScopeRef
  ensure(principal: P, tenant: TenantId): Promise<Outcome<ScopeRef, StaticScopeFailure>>
  issue(
    principal: P,
    tenant: TenantId,
    reader: StaticReaderRequest,
  ): Promise<Outcome<StaticReaderGrant, StaticScopeFailure>>
  /** Ensures, then reads. The reader is kept for the request object: pass the same object. */
  read(
    principal: P,
    tenant: TenantId,
    reader: StaticReaderRequest,
  ): Promise<Outcome<StaticRead, StaticScopeFailure>>
}

export type StaticContribution<P = unknown> = Readonly<{
  blocks?: readonly StaticBlock<P>[]
  needs?: readonly NeedBinding[]
}>
