// What the double reports about each call that reaches it. An arrival holds classes and verdicts
// only: no principal object, no credential, no login proof. An assembler that needs the evidence
// (the end-to-end test of the line) passes an observer to `createSessionProviderRow`.
import type { SessionFailure } from '@omne-harness/session-contract'

export type SessionProviderMethod =
  | 'management.create'
  | 'work.accept'
  | 'work.queryOperation'
  | 'work.cancelRun'
  | 'work.stopCall'
  | 'history.begin'
  | 'history.next'

export type SessionProviderArrival = Readonly<{
  method: SessionProviderMethod
  /** The kind of principal that reached the face. `unrecognized` is any other shape. */
  principalKind: 'system' | 'acting-for-tenant' | 'unrecognized'
  /** The component name of the system part behind the principal, if the principal has one. */
  actorComponent: string | null
  /** What the access check answered for this call. */
  access: 'allowed' | 'denied' | 'unavailable'
  /** `ok`, or the kind of the failure that the face answered. */
  outcome: 'ok' | SessionFailure['kind']
}>

export type ArrivalObserver = (arrival: SessionProviderArrival) => void

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
}

export function classifyPrincipal(
  principal: unknown,
): Pick<SessionProviderArrival, 'principalKind' | 'actorComponent'> {
  if (isRecord(principal)) {
    if (principal.kind === 'system' && typeof principal.component === 'string')
      return { principalKind: 'system', actorComponent: principal.component }
    if (
      principal.kind === 'acting-for-tenant' &&
      isRecord(principal.actor) &&
      typeof principal.actor.component === 'string'
    )
      return { principalKind: 'acting-for-tenant', actorComponent: principal.actor.component }
  }
  return { principalKind: 'unrecognized', actorComponent: null }
}
