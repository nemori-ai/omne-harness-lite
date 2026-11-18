import { fail, type Outcome } from '@omne-harness/operation-result'
import type { StaticScopeFailure } from '@omne-harness/runtime-context-contract'

export type Failed = Outcome<never, StaticScopeFailure>
type Answer = Readonly<{ kind: string; reason?: string; cause?: string }>

export const DENIED: StaticScopeFailure = Object.freeze({ kind: 'denied' })

export function unavailable(diagnostic: string): Failed {
  return fail({ kind: 'unavailable', diagnostic })
}

export function refusal(operation: string, answer: Answer): Failed {
  if (answer.kind === 'refused' && answer.reason === 'unauthorized') return fail(DENIED)
  return unavailable(`${operation} answered ${answer.kind}:${answer.reason ?? answer.cause ?? ''}`)
}
