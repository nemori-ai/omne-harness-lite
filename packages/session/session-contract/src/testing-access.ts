import type { SessionAccessCheck, SessionAccessDecision, SessionAccessRequest } from './access.ts'

export type SessionAccessScript =
  | SessionAccessDecision
  | Readonly<{ kind: 'throw'; error: unknown }>

export interface ScriptedSessionAccessCheck<P> extends SessionAccessCheck<P> {
  readonly durability: 'none'
  readonly controls: Readonly<{
    asked(): readonly SessionAccessRequest<P>[]
  }>
}

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

export function createPolicySessionAccessCheck<P>(
  policy: (request: SessionAccessRequest<P>) => SessionAccessScript,
): ScriptedSessionAccessCheck<P> {
  const asked: SessionAccessRequest<P>[] = []
  const check: SessionAccessCheck<P>['check'] = async input => {
    asked.push(input)
    const answer = policy(input)
    if (answer.kind === 'throw') throw answer.error
    return answer
  }
  return Object.freeze({
    durability: 'none',
    check,
    controls: Object.freeze({ asked: () => [...asked] }),
  })
}

/** A check whose allowed answers name a member where the wrapped check named no subject kind. */
export function withMemberSubject<P>(check: SessionAccessCheck<P>): SessionAccessCheck<P> {
  return {
    check: async request => {
      const answer = await check.check(request)
      return answer.kind !== 'allowed' || answer.subject !== undefined
        ? answer
        : { ...answer, subject: { kind: 'member' } }
    },
  }
}
