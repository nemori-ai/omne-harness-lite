import type { JsonValue } from '@omne-harness/json-text'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type { FacilityKey, FacilityRequest } from './facility.ts'

/** A recovery reference defined by a provider and kept by the ledger. Never a live handle or a bare PID. */
export interface ManagedResource {
  readonly key: string
  readonly provider: string
  readonly reference: JsonValue
}

export interface FacilityGuard<P> {
  authorize(
    facility: FacilityKey,
    operation: string,
    request: FacilityRequest<P>,
  ): Promise<'authorized' | 'notAuthorized' | 'unavailable'>
}

export interface ResourceLedger {
  readonly closed: AbortSignal
  plan(resource: ManagedResource): Promise<'recorded' | 'conflict' | 'closed' | 'unavailable'>
  permit(key: string): Promise<'confirmed' | 'closed' | 'unavailable'>
  adopt(key: string): Promise<'confirmed' | 'closed' | 'unavailable'>
  stopped(key: string, status: 'confirmed' | 'unconfirmed'): Promise<'recorded' | 'unavailable'>
}

/** A second lifetime: shell ownership remains with this scope after the creating acquisition ends. */
export type RetainedTerminalLedger = Pick<ResourceLedger, 'closed' | 'plan' | 'permit' | 'stopped'>

export type RetainedProcessLedger = Pick<
  ResourceLedger,
  'closed' | 'plan' | 'adopt' | 'stopped'
> & {
  ended?(key: string): Promise<'confirmed' | 'none' | 'unavailable'>
}

export type SessionTerminalRetention = Readonly<{
  scope: ScopeRef
  ledger: RetainedTerminalLedger
  processes?: RetainedProcessLedger
}>

const recoveryAccessMark: unique symbol = Symbol('execution-environment.recovery-access')

export interface RecoveryAccess {
  readonly [recoveryAccessMark]: true
}

export function createRecoveryAccess(): RecoveryAccess {
  const access: RecoveryAccess = { [recoveryAccessMark]: true }
  return Object.freeze(access)
}

export function isRecoveryAccess(value: unknown): value is RecoveryAccess {
  return (
    typeof value === 'object' && value !== null && Reflect.get(value, recoveryAccessMark) === true
  )
}

export interface RecoveryAuthority {
  authorizeRecovery(
    access: RecoveryAccess,
    scope: ScopeRef,
    resources: readonly ManagedResource[],
  ): Promise<'authorized' | 'notAuthorized' | 'unavailable'>
}
