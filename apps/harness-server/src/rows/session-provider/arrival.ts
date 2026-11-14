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
  principalKind: 'system' | 'acting-for-tenant' | 'unrecognized'
  actorComponent: string | null
  access: 'allowed' | 'denied' | 'unavailable'
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
