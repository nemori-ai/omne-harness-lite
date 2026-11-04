// A source answer inside its closed set, by the contract SPEC "端口答复的统一处置". The answer is
// parsed whole: a success must carry the value the port promises (a snapshot that `sealSnapshot`
// made, or bytes), and a failure must name a member of `SourceFailure`. A source that rejects or
// throws, gives anything else, or gives an answer that throws while it is read has not answered;
// the services take that for `unavailable`, the one row of the mapping that says "the source
// cannot be reached now". So a defect of the source looks like a source that is down now: the
// operation answers `source-unavailable` and does not throw.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { Bytes } from '@omne-harness/skill-contract'
import type { SourceFailure } from '@omne-harness/skill-contract/provider'
import { fieldOf, has } from './answer-values.ts'
import { isSourceFailure } from './mapping.ts'
import { answered } from './port-answer.ts'

const UNAVAILABLE = Object.freeze({ failure: 'unavailable' } as const)

/** The success of `open`: bytes. */
export function isBytes(value: unknown): value is Bytes {
  return value instanceof Uint8Array
}

function sourceOutcomeOf<T>(
  answer: unknown,
  isOk: (value: unknown) => value is T,
): Outcome<T, SourceFailure> | undefined {
  if (has(answer, 'ok')) {
    const { ok } = answer
    return isOk(ok) ? succeed(ok) : undefined
  }
  const failure = fieldOf(answer, 'failure')
  return isSourceFailure(failure) ? fail(failure) : undefined
}

/** The answer of one source call, with `isOk` for the value of a success. */
export async function sourceAnswer<T>(
  call: () => Promise<unknown>,
  isOk: (value: unknown) => value is T,
): Promise<Outcome<T, SourceFailure>> {
  return (await answered(call, answer => sourceOutcomeOf(answer, isOk))) ?? UNAVAILABLE
}
