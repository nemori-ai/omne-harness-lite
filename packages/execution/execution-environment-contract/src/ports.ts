import type { JsonValue } from '@omne-harness/json-text'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type { FacilityKey, FacilityRequest } from './facility.ts'

/** A recovery reference defined by a provider and kept by the ledger. Never a live handle or a bare PID. */
export interface ManagedResource {
  readonly key: string
  readonly provider: string
  readonly reference: JsonValue
}

/** Needed port: asks whether this operation is still allowed now. The integrator owns the reasons. */
export interface FacilityGuard<P> {
  authorize(
    facility: FacilityKey,
    operation: string,
    request: FacilityRequest<P>,
  ): Promise<'authorized' | 'notAuthorized' | 'unavailable'>
}

/** Needed port: one per acquisition, durable on the integrator side. A permit precedes the first external effect. */
export interface ResourceLedger {
  readonly closed: AbortSignal
  plan(resource: ManagedResource): Promise<'recorded' | 'conflict' | 'closed' | 'unavailable'>
  permit(key: string): Promise<'confirmed' | 'closed' | 'unavailable'>
  /** Hands an existing resource over to this durable adoption. */
  adopt(key: string): Promise<'confirmed' | 'closed' | 'unavailable'>
  stopped(key: string, status: 'confirmed' | 'unconfirmed'): Promise<'recorded' | 'unavailable'>
}

const recoveryAccessMark: unique symbol = Symbol('execution-environment.recovery-access')

/**
 * Recovery access issued by the integrator's maintenance owner, independent of user access. It is a
 * raw object: the symbol mark does not survive serialization, and the authority checks it on each use.
 */
export interface RecoveryAccess {
  readonly [recoveryAccessMark]: true
}

/** Creates a fresh recovery access object. Holding one grants nothing until a `RecoveryAuthority` accepts it. */
export function createRecoveryAccess(): RecoveryAccess {
  const access: RecoveryAccess = { [recoveryAccessMark]: true }
  return Object.freeze(access)
}

/** Needed port: decides whether a recovery access may stop and settle resources of a scope. */
export interface RecoveryAuthority {
  authorizeRecovery(
    access: RecoveryAccess,
    scope: ScopeRef,
    resources: readonly ManagedResource[],
  ): Promise<'authorized' | 'notAuthorized' | 'unavailable'>
}
