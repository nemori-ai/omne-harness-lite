// Ask 的结果投影：把检查点里的题目与人的答复写成给模型的结果文字。
// 格式归 SPEC「段」。文本一律用 JSON 字符串字面量加引号，所以引号与换行不会让结果有歧义。
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolDecision } from '@omne-harness/tool-contract'
import { askCommandNames, type AskResponse, type AskState } from './ask-protocol.ts'

type Answer = AskResponse['answers'][number]
type Question = AskState['questions'][number]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** 读回检查点。字节由 initial 段写出，但从存储读回，所以在这里核一次形状。 */
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

/** 一题一行的答复文字。选项身份不在本题里时返回 null。 */
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

/**
 * 等待被控制关闭时这次调用的结果文字：叫停、归档、中断或插队在人作答之前解除了等待。
 * 它说明没有发生什么，不是人的答复。两条命令各一句，模型据此知道动作没有获得批准，或没有选择。
 */
export function askClosedResult(command: AskState['command']): string {
  return command === 'request_approval'
    ? 'No approval was obtained: the request was closed before the person decided. Do not perform the action.'
    : 'No selection was made: the question was closed before the person answered.'
}

/**
 * 把一次等待的决定投影成结果文字。答复要与检查点的题目逐张对上：卡片数、顺序与身份相同，
 * 选中的选项属于该题。对不上时返回失败，不猜。
 */
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
