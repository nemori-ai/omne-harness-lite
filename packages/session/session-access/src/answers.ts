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

export type Target = Readonly<{ access: SessionAccess<Principal>; tenantText: string }>
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
      return 'basis-unavailable'
  }
}

export function refused<K extends Name>(name: K, failure: SessionFailure): Answer<K> {
  const outcomes: Readonly<Record<string, unknown>> = sessionProtocol.operations[name].outcomes
  const outcome = failureOutcome(failure)
  if (!Object.hasOwn(outcomes, outcome)) return UNAVAILABLE as Answer<K>
  if (outcomes[outcome] === true) return { outcome } as Answer<K>
  const said = failure.kind === 'invalid' && (name === 'send-input' || name === 'interrupt-input')
  const body =
    failure.kind === 'limited'
      ? { resource: failure.resource, limit: failure.limit }
      : said
        ? { field: failure.field, reason: failure.reason }
        : {}
  return { outcome, body } as Answer<K>
}

export async function commitCall<T>(call: () => Promise<T>): Promise<T | 'unknown'> {
  try {
    return await call()
  } catch {
    return 'unknown'
  }
}

export async function readCall<T>(call: () => Promise<T>): Promise<T | 'basis-unavailable'> {
  try {
    return await call()
  } catch {
    return 'basis-unavailable'
  }
}
