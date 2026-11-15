import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolDecision } from '@omne-harness/tool-contract'
import { askCommandNames, type AskResponse, type AskState } from './ask-protocol.ts'

type Answer = AskResponse['answers'][number]
type Question = AskState['questions'][number]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function readAskState(bytes: Uint8Array): Outcome<AskState, string> {
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    return fail('ask-state-unreadable')
  }
  if (
    !isRecord(value) ||
    !askCommandNames.some(name => name === value['command']) ||
    !Array.isArray(value['questions'])
  )
    return fail('ask-state-unreadable')
  for (const question of value['questions'] as unknown[])
    if (
      !isRecord(question) ||
      typeof question['cardId'] !== 'string' ||
      typeof question['title'] !== 'string' ||
      !Array.isArray(question['options'])
    )
      return fail('ask-state-unreadable')
  return succeed(value as AskState)
}

const quoted = (text: string) => JSON.stringify(text)

function questionLine(at: number, question: Question, answer: Answer): string | null {
  const head = `Q${at + 1} ${question.title}:`
  if (answer.kind === 'no-answer') return `${head} no answer (the person skipped this question)`
  if (answer.kind === 'text') return `${head} the person wrote: ${quoted(answer.text)}`
  const option = question.options.find(item => item.id === answer.optionId)
  return option === undefined ? null : `${head} selected ${quoted(option.label)}`
}

function approvalText(question: Question, answer: Answer): string | null {
  if (answer.kind === 'no-answer')
    return 'No decision: the person did not approve or reject. This is not permission.'
  if (answer.kind === 'text')
    return `No decision. The person wrote: ${quoted(answer.text)}. This is not permission.`
  if (answer.optionId === 'approve') return `Approved: ${question.title}`
  if (answer.optionId === 'reject') return `Not approved: ${question.title}`
  return null
}

export function askClosedResult(command: AskState['command']): string {
  return command === 'request_approval'
    ? 'No approval was obtained: the request was closed before the person decided. Do not perform the action.'
    : 'No selection was made: the question was closed before the person answered.'
}

export function askResult(
  state: AskState,
  decision: ToolDecision<unknown>,
): Outcome<string, string> {
  if (decision.kind === 'declined') return succeed('The person declined to reply.')
  const approval = state.command === 'request_approval'
  if (decision.kind === 'no-answer')
    return succeed(
      approval
        ? 'No decision: the person did not approve or reject. This is not permission.'
        : 'The person did not answer any question.',
    )
  const answers = isRecord(decision.value) ? decision.value['answers'] : undefined
  if (!Array.isArray(answers) || answers.length !== state.questions.length)
    return fail('ask-response-mismatch')
  const lines: string[] = []
  for (const [at, question] of state.questions.entries()) {
    const answer = answers[at] as Answer
    if (!isRecord(answer) || answer.cardId !== question.cardId) return fail('ask-response-mismatch')
    const line = approval ? approvalText(question, answer) : questionLine(at, question, answer)
    if (line === null) return fail('ask-response-mismatch')
    lines.push(line)
  }
  return succeed(lines.join('\n'))
}
