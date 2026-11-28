import { judgeContentBlock } from '@omne-harness/content-block'
import type { ResultPart } from './call-surface.ts'
import type { ModelBlock } from './result.ts'
import type { Adoption } from './root.ts'

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

const DECISION_ANSWERS_BLOCK = 'decision-answers'
const ANSWER_TYPES = new Set(['refusal', 'noul', 'choice', 'score'])
const QUESTION_KEYS = new Set(['type', 'instructions', 'criteria'])

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

function isState(value: unknown): value is DecisionState {
  return typeof value === 'string' || Array.isArray(value) || isDict(value)
}

function isGuidance(value: unknown): boolean {
  return value === null || isState(value)
}

function isQuestion(value: unknown): value is DecisionQuestion {
  if (!isDict(value)) return false
  if (Object.keys(value).some(key => !QUESTION_KEYS.has(key))) return false
  if (value.instructions !== undefined && !isGuidance(value.instructions)) return false
  const { criteria } = value
  switch (value.type) {
    case 'noul':
      return (
        criteria === undefined ||
        (isDict(criteria) &&
          Object.entries(criteria).every(
            ([key, entry]) => (key === 'true' || key === 'false') && isGuidance(entry),
          ))
      )
    case 'choice':
      return (
        isDict(criteria) &&
        Object.keys(criteria).length > 0 &&
        Object.values(criteria).every(isGuidance)
      )
    case 'score':
      return Array.isArray(criteria) && criteria.length > 0 && criteria.every(isState)
    default:
      return false
  }
}

function isAsk(value: unknown): value is DecisionAsk {
  if (!isDict(value) || Object.keys(value).toSorted().join() !== 'questions,state') return false
  const { state, questions } = value
  if (!isState(state) || !isDict(questions)) return false
  const named = Object.entries(questions)
  return named.length > 0 && named.every(([name, asked]) => name.length > 0 && isQuestion(asked))
}

/** The ask as a caller may write it: one material and at least one named question of a known type; null otherwise. */
export function judgeDecisionAsk(value: unknown): DecisionAsk | null {
  return isAsk(value) ? value : null
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
