// The second wire shape of a decision: the material as input, the questions and answers as named lists.
import type { DecisionQuestion, DecisionState } from '@omne-harness/model-contract'
import { canonicalJson } from '../canonical-json.ts'
import { isDecisionResponse, preparedIn, type OwnedAsk } from './codec.ts'
import type { DecisionRequest, DecisionResponse } from './contract.ts'

type Dict = Record<string, unknown>
const object = (value: unknown): value is Dict =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const textOf = (value: DecisionState): string =>
  typeof value === 'string' ? value : canonicalJson(value)

// Text is the material itself; anything else goes in as data, in one message.
function inputOf(state: DecisionState): unknown {
  return typeof state === 'string'
    ? state
    : [{ role: 'user', content: [{ type: 'input_json', data: state }] }]
}

// The wire has no criteria for a yes-or-no question, so they are written into its instructions.
function instructionsOf(question: DecisionQuestion): string | undefined {
  const parts = question.instructions == null ? [] : [textOf(question.instructions)]
  if (question.type === 'noul') {
    const yes = question.criteria?.true
    const no = question.criteria?.false
    if (yes != null) parts.push(`True when: ${textOf(yes)}`)
    if (no != null) parts.push(`False when: ${textOf(no)}`)
  }
  return parts.length === 0 ? undefined : parts.join('\n\n')
}

function questionOf(name: string, question: DecisionQuestion): Dict {
  const instructions = instructionsOf(question)
  const named = { name, ...(instructions === undefined ? {} : { instructions }) }
  switch (question.type) {
    case 'noul':
      return { type: 'predicate', ...named }
    case 'choice':
      return {
        type: 'choice',
        ...named,
        choices: Object.entries(question.criteria).map(([value, about]) =>
          about === null ? { value } : { value, description: textOf(about) },
        ),
      }
    case 'score':
      return {
        type: 'score',
        ...named,
        levels: question.criteria.map((level, at) => ({
          label: String(at),
          description: textOf(level),
        })),
      }
  }
}

function bodyOf({ model, ask }: OwnedAsk): string {
  const questions = Object.entries(ask.questions).map(([name, question]) =>
    questionOf(name, question),
  )
  return canonicalJson({ model, input: inputOf(ask.state), questions })
}

export const prepareDecisionV1 = preparedIn(bodyOf)

function distributionOf(
  value: unknown,
  keyOf: (option: Dict) => string | null,
): Record<string, unknown> | null | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return null
  const distribution: Record<string, unknown> = {}
  for (const option of value) {
    const key = object(option) ? keyOf(option) : null
    if (key === null || Object.hasOwn(distribution, key)) return null
    distribution[key] = option['probability']
  }
  return distribution
}

const choiceKey = (option: Dict) => (typeof option['value'] === 'string' ? option['value'] : null)
const levelKey = (option: Dict) =>
  Number.isSafeInteger(option['value']) ? String(option['value']) : null

// The shape of one answer as the ask names it; the check after says whether it answers the question.
function answerOf(item: Dict): Dict {
  const { confidence } = item
  switch (item['type']) {
    case 'predicate':
      return { type: 'noul', noul: item['probability'], confidence }
    case 'choice': {
      const probabilities = distributionOf(item['probabilities'], choiceKey)
      return { type: 'choice', choice: item['choice'], confidence, probabilities }
    }
    case 'score': {
      const probabilities = distributionOf(item['probabilities'], levelKey)
      return { type: 'score', score: item['score'], confidence, probabilities }
    }
    default:
      return { type: item['type'] }
  }
}

// The answers by name; an answer that is no named object, or a second one to a name, is no list.
function answersOf(list: readonly unknown[]): Record<string, Dict> | null {
  const answers: Record<string, Dict> = {}
  for (const item of list) {
    if (!object(item) || typeof item['name'] !== 'string' || Object.hasOwn(answers, item['name']))
      return null
    answers[item['name']] = answerOf(item)
  }
  return answers
}

function responseOf(value: unknown): Dict | null {
  if (!object(value) || !Array.isArray(value['answers']) || !object(value['usage'])) return null
  const { input_tokens, output_tokens } = value['usage']
  return {
    model: value['model'],
    answers: answersOf(value['answers']),
    usage: { input_tokens, output_tokens },
  }
}

/** The answers read back in the shape of the first wire, then held to the same check: every question answered as asked. */
export function readDecisionV1(
  value: unknown,
  questions: DecisionRequest['questions'],
): DecisionResponse | null {
  const read = responseOf(value)
  return isDecisionResponse(read, questions) ? read : null
}
