// The violators of the resend rule, built over one method of a port. A resend or a read that
// comes after another read of the same operation never moves backwards, and what was answered for
// good is recalled as it was. Each helper breaks one half of that rule on the method that it wraps:
// the wrapper answers like `real` until the rule can be broken, and then breaks it.
import { isProgress, type AnswerRow } from '@omne-harness/tool-contract/testing'

/** The method that a violator wraps: an input in, an answer out. */
export type Method<Input, Answer> = (input: Input) => Promise<Answer>

/** What a violator needs to know of the method: its row of the answer table and its operations. */
export type ResendSubject<Input> = Readonly<{
  row: AnswerRow
  /** The operation that an input asks about: a resend of it has the same key. */
  key(input: Input): string
}>

const isSuccess = (answer: unknown): boolean =>
  typeof answer === 'object' && answer !== null && 'ok' in answer

/**
 * A method that goes back after its operation was answered for good: the first final success of an
 * operation is real, and every later success of it says `progress` again (an answer that the
 * operation had left behind). A refusal is not a final success and is passed on.
 */
export function regressesAfterFinal<Input, Answer>(
  subject: ResendSubject<NoInfer<Input>> &
    Readonly<{ progress(input: NoInfer<Input>): NoInfer<Answer> }>,
  real: Method<Input, Answer>,
): Method<Input, Answer> {
  const answered = new Set<string>()
  return async input => {
    const answer = await real(input)
    if (isProgress(answer, subject.row) || !isSuccess(answer)) return answer
    const key = subject.key(input)
    if (!answered.has(key)) {
      answered.add(key)
      return answer
    }
    return subject.progress(input)
  }
}

/**
 * A method that answers a final during progress which is not the one that lands: while `real` is
 * still in progress for an operation, the first answer is that progress and every resend or read
 * of it answers `other`, a final that the operation never gets. When the work has landed, `real`
 * answers its own final, and that differs from `other`.
 */
export function answersAnotherFinalDuringProgress<Input, Answer>(
  subject: ResendSubject<NoInfer<Input>> &
    Readonly<{ other(input: NoInfer<Input>): NoInfer<Answer> }>,
  real: Method<Input, Answer>,
): Method<Input, Answer> {
  const asked = new Set<string>()
  return async input => {
    const answer = await real(input)
    if (!isProgress(answer, subject.row)) return answer
    const key = subject.key(input)
    if (!asked.has(key)) {
      asked.add(key)
      return answer
    }
    return subject.other(input)
  }
}
