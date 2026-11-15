import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { Bytes } from '@omne-harness/skill-contract'
import type { SourceFailure } from '@omne-harness/skill-contract/provider'
import { fieldOf, has } from './answer-values.ts'
import { isSourceFailure } from './mapping.ts'
import { answered } from './port-answer.ts'

const UNAVAILABLE = Object.freeze({ failure: 'unavailable' } as const)

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

export async function sourceAnswer<T>(
  call: () => Promise<unknown>,
  isOk: (value: unknown) => value is T,
): Promise<Outcome<T, SourceFailure>> {
  return (await answered(call, answer => sourceOutcomeOf(answer, isOk))) ?? UNAVAILABLE
}
