// A source answer inside its closed set, by the contract SPEC "端口答复的统一处置": a source that
// rejects, answers something that is not an outcome, or names a failure outside `SourceFailure`
// has not answered; the services take it for `unavailable`, the one row of the mapping that
// says "the source cannot be reached now". A success is passed through: the digests of the
// snapshot and of every entry are checked by the callers themselves.
import type { Outcome } from '@omne-harness/operation-result'
import type { SourceFailure } from '@omne-harness/skill-contract/provider'
import { isSourceFailure } from './mapping.ts'
import { answered } from './port-answer.ts'

const UNAVAILABLE = Object.freeze({ failure: 'unavailable' } as const)

export async function sourceAnswer<T>(
  call: () => Promise<Outcome<T, SourceFailure>>,
): Promise<Outcome<T, SourceFailure>> {
  const answer = await answered(call)
  if (typeof answer !== 'object' || answer === null) return UNAVAILABLE
  if ('ok' in answer) return answer
  return 'failure' in answer && isSourceFailure(answer.failure) ? answer : UNAVAILABLE
}
