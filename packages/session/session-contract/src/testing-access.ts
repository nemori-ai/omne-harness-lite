import type { SessionAccessCheck, SessionAccessDecision, SessionAccessRequest } from './access.ts'

export type SessionAccessScript =
  | SessionAccessDecision
  | Readonly<{ kind: 'throw'; error: unknown }>

export interface ScriptedSessionAccessCheck<P> extends SessionAccessCheck<P> {
  readonly durability: 'none'
  readonly controls: Readonly<{
    /** The received requests in call order, retaining the caller's principal and target identities. */
    asked(): readonly SessionAccessRequest<P>[]
  }>
}

/** An explicit, finite script for tests. Exhaustion is unavailable; there is no default permission. */
export function createScriptedSessionAccessCheck<P>(
  answers: readonly SessionAccessScript[],
): ScriptedSessionAccessCheck<P> {
  const queue = [...answers]
  const asked: SessionAccessRequest<P>[] = []
  const check: SessionAccessCheck<P>['check'] = async input => {
    asked.push(input)
    const answer = queue.shift()
    if (answer === undefined)
      return { kind: 'unavailable', diagnostic: 'the access check script is exhausted' }
    if (answer.kind === 'throw') throw answer.error
    return answer
  }
  return Object.freeze({
    durability: 'none',
    check,
    controls: Object.freeze({ asked: () => [...asked] }),
  })
}
