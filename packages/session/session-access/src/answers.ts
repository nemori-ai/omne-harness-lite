import type { AnswerOf, BodyOf } from '@omne-harness/access-cordis-contract'
import type { SessionAccess, SessionFailure } from '@omne-harness/session-contract'
import type { Principal } from '@omne-harness/access-cordis-contract'
import { sessionProtocol, type SessionProtocol } from '@omne-harness/session-protocol'
import type { PrincipalFact, PrincipalFacts, SessionAccessFaces } from './ports.ts'

type Operations = SessionProtocol['operations']
export type Name = keyof Operations & string
export type Answer<K extends Name> = AnswerOf<Operations[K]>
export type Body<K extends Name> = BodyOf<Operations[K]>

export type Refusal = Readonly<{ outcome: 'denied' | 'basis-unavailable' }>
export const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })

/** The target of one call: the principal for the target tenant and the session it names. */
export type Target = Readonly<{ access: SessionAccess<Principal>; tenantText: string }>
/** A target and the Session faces of the moment. */
export type Admitted = Target & Readonly<{ faces: SessionAccessFaces }>

export function describedBy(
  facts: PrincipalFacts,
  principal: Principal,
): PrincipalFact | undefined {
  try {
    return facts.describe(principal)
  } catch {
    return undefined
  }
}

/** The outcome of a Session failure, as the session location maps it. */
function failureOutcome(failure: SessionFailure): string {
  switch (failure.kind) {
    case 'limited':
    case 'denied':
    case 'invalid':
    case 'conflict':
    case 'archived':
    case 'frozen':
    case 'unsupported':
    case 'not-found':
      return failure.kind
    case 'nothing-pending':
      return 'no-change'
    case 'commit-unknown':
      return 'unknown'
    default:
      // `unavailable`, `quarantined`, and a kind outside the public result set: the session cannot
      // say allowed now.
      return 'basis-unavailable'
  }
}

/**
 * The answer of operation `name` to a Session failure. An outcome outside the operation's contract
 * is `basis-unavailable`. A codec outcome carries its body: the limit of `limited`, else empty.
 */
export function refused<K extends Name>(name: K, failure: SessionFailure): Answer<K> {
  const outcomes: Readonly<Record<string, unknown>> = sessionProtocol.operations[name].outcomes
  const outcome = failureOutcome(failure)
  if (!Object.hasOwn(outcomes, outcome)) return UNAVAILABLE as Answer<K>
  if (outcomes[outcome] === true) return { outcome } as Answer<K>
  const body =
    failure.kind === 'limited' ? { resource: failure.resource, limit: failure.limit } : {}
  return { outcome, body } as Answer<K>
}

/** A commit-class Session call: a throw after the call began is `unknown`. */
export async function commitCall<T>(call: () => Promise<T>): Promise<T | 'unknown'> {
  try {
    return await call()
  } catch {
    return 'unknown'
  }
}

/** A read-class Session call: a throw is `basis-unavailable`, nothing was committed. */
export async function readCall<T>(call: () => Promise<T>): Promise<T | 'basis-unavailable'> {
  try {
    return await call()
  } catch {
    return 'basis-unavailable'
  }
}
