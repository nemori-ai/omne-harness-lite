import { isProgress, type AnswerRow } from '@omne-harness/tool-contract/testing'

export type Method<Input, Answer> = (input: Input) => Promise<Answer>

export type ResendSubject<Input> = Readonly<{
  row: AnswerRow
  key(input: Input): string
}>

const isSuccess = (answer: unknown): boolean =>
  typeof answer === 'object' && answer !== null && 'ok' in answer

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
