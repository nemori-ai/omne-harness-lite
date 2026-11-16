import { fail, type Outcome } from '@omne-harness/operation-result'
import type { SessionFailure } from '@omne-harness/session-contract'

export const OWNERS = Object.freeze({
  session: 'session',
  accessCheck: 'sessionAccessCheck',
  delegated: 'sessionDelegatedTransactions',
  directory: 'sessionTransactions',
  workPrincipals: 'sessionWorkPrincipals',
  identity: 'sessionIdentity',
  evidence: 'sessionEvidence',
  context: 'sessionContextInput',
  idle: 'sessionIdleInput',
  clock: 'sessionClock',
  admission: 'sessionAdmission',
} as const)
export type Owner = (typeof OWNERS)[keyof typeof OWNERS]

export function denied(action: string): Extract<SessionFailure, { kind: 'denied' }> {
  return { kind: 'denied', action }
}

export function unavailable(
  owner: Owner,
  diagnostic: string,
): Extract<SessionFailure, { kind: 'unavailable' }> {
  return { kind: 'unavailable', owner, diagnostic }
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function guarded<T>(
  owner: Owner,
  what: string,
  call: () => Promise<Outcome<T, SessionFailure>>,
): Promise<Outcome<T, SessionFailure>> {
  try {
    return await call()
  } catch (error) {
    return fail(unavailable(owner, `${what} threw: ${messageOf(error)}`))
  }
}
