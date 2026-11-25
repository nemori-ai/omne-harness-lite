import { judgeContentBlock } from '@omne-harness/content-block'
import { judgeMessage, type Message } from '@omne-harness/message'
import type { ResultPart } from './call-surface.ts'
import type { ModelBlock } from './result.ts'
import type { Adoption, FixedModelRequest } from './root.ts'

export type DecisionJson =
  | string
  | number
  | boolean
  | null
  | { readonly [key: string]: DecisionJson }
  | readonly DecisionJson[]
export type DecisionState = Exclude<DecisionJson, number | boolean | null>

export type DecisionQuestion = Readonly<{ instructions?: DecisionState | null }> &
  (
    | Readonly<{
        type: 'noul'
        criteria?: Partial<Readonly<Record<'true' | 'false', DecisionState | null>>>
      }>
    | Readonly<{ type: 'choice'; criteria: Readonly<Record<string, DecisionState | null>> }>
    | Readonly<{ type: 'score'; criteria: readonly DecisionState[] }>
  )
/** What one decision call asks: one material and its named questions. It has no stream and suggests no tool. */
export type DecisionAsk = Readonly<{
  state: DecisionState
  questions: Readonly<Record<string, DecisionQuestion>>
}>

export type DecisionAnswer =
  | Readonly<{ type: 'refusal' }>
  | Readonly<{ type: 'noul'; noul: number; confidence?: number }>
  | Readonly<{
      type: 'choice'
      choice: string
      confidence?: number
      probabilities?: Readonly<Record<string, number>>
    }>
  | Readonly<{
      type: 'score'
      score: number
      legend?: Readonly<Record<string, DecisionState>>
      confidence?: number
      probabilities?: Readonly<Record<string, number>>
    }>
export type DecisionAnswers = Readonly<Record<string, DecisionAnswer>>

export const DECISION_REPRESENTATION: Adoption = Object.freeze({
  owner: 'model-contract',
  name: 'decision-call',
  revision: '1',
  digest: '6f03fde97adcc0f91ae9d6c6e8e887d71d685acd774bce8b7fdb2e7d91a93889',
})

const DECISION_ASK_BLOCK = 'decision-ask'
const DECISION_ANSWERS_BLOCK = 'decision-answers'
const ANSWER_TYPES = new Set(['refusal', 'noul', 'choice', 'score'])

type Dict = Readonly<Record<string, unknown>>
const isDict = (value: unknown): value is Dict =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered)
  if (!isDict(value)) return value
  const keys = Object.keys(value).toSorted()
  return Object.fromEntries(keys.map(key => [key, ordered(value[key])]))
}

function decisionText(value: unknown): string {
  return JSON.stringify(ordered(value))
}

function parsed(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** The one message of a decision request: the ask as one block of text. Null when the id is no message id. */
export function decisionAskMessage(id: string, ask: DecisionAsk): Message | null {
  const judged = judgeMessage({
    id,
    role: 'user',
    blocks: [
      {
        kind: 'text',
        id: DECISION_ASK_BLOCK,
        visibility: { toHuman: false, toModel: true },
        text: decisionText(ask),
      },
    ],
  })
  return 'rejected' in judged ? null : judged.ok
}

/** The text of the one block of the one user message a decision request is; null for a request of any other shape. */
function askTextOf(
  request: Pick<FixedModelRequest, 'system' | 'messages' | 'tools'>,
): string | null {
  const [message, ...more] = request.messages
  if (message?.role !== 'user' || more.length > 0) return null
  if (request.system.length > 0 || request.tools.length > 0) return null
  const [block, ...rest] = message.blocks
  if (block?.kind !== 'text' || rest.length > 0) return null
  return block.id === DECISION_ASK_BLOCK ? block.text : null
}

/** The ask a fixed request carries, as it was written; null when the request is not one decision message. */
export function decisionAskOf(
  request: Pick<FixedModelRequest, 'system' | 'messages' | 'tools'>,
): Readonly<{ state: unknown; questions: unknown }> | null {
  const text = askTextOf(request)
  const ask = text === null ? null : parsed(text)
  if (!isDict(ask) || Object.keys(ask).toSorted().join() !== 'questions,state') return null
  return { state: ask.state, questions: ask.questions }
}

/** The one block of a decision result: the answers by the name of their question. */
export function decisionAnswersBlock(answers: DecisionAnswers): ModelBlock {
  const judged = judgeContentBlock({
    kind: 'text',
    id: DECISION_ANSWERS_BLOCK,
    visibility: { toHuman: false, toModel: false },
    text: decisionText(answers),
  })
  if ('rejected' in judged) throw new TypeError('the answers of a decision are one text block')
  return judged.ok
}

/** The answers a settled result carries; null when the result is not one whole decision block. */
export function decisionAnswersOf(parts: readonly ResultPart[]): DecisionAnswers | null {
  const [part, ...more] = parts
  if (part?.kind !== 'sealed' || more.length > 0) return null
  const { block } = part
  if (block.kind !== 'text' || block.id !== DECISION_ANSWERS_BLOCK) return null
  const answers = parsed(block.text)
  return isAnswers(answers) ? answers : null
}

function isAnswers(value: unknown): value is DecisionAnswers {
  if (!isDict(value)) return false
  return Object.values(value).every(
    answer => isDict(answer) && typeof answer.type === 'string' && ANSWER_TYPES.has(answer.type),
  )
}
