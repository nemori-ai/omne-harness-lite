import { canonicalJson } from '../canonical-json.ts'
import {
  OPENROUTER_DECISION_MODELS,
  type DecisionQuestion,
  type DecisionRequest,
  type DecisionResponse,
} from './contract.ts'

type Dict = Record<string, unknown>
function object(value: unknown): value is Dict {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function state(value: unknown): boolean {
  return typeof value === 'string' || Array.isArray(value) || object(value)
}
function guidance(value: unknown): boolean {
  return value === null || state(value)
}
function question(value: unknown): boolean {
  if (
    !object(value) ||
    Object.keys(value).some(key => !['type', 'instructions', 'criteria'].includes(key))
  )
    return false
  if (value.instructions !== undefined && !guidance(value.instructions)) return false
  const criteria = value.criteria
  switch (value.type) {
    case 'noul':
      return (
        criteria === undefined ||
        (object(criteria) &&
          Object.entries(criteria).every(
            ([key, entry]) => (key === 'true' || key === 'false') && guidance(entry),
          ))
      )
    case 'choice':
      return (
        object(criteria) &&
        Object.keys(criteria).length > 0 &&
        Object.values(criteria).every(guidance)
      )
    case 'score':
      return Array.isArray(criteria) && criteria.length > 0 && criteria.every(state)
    default:
      return false
  }
}

/** The bytes sent and the questions used to check the answer are the same owned snapshot. */
export function prepareDecision(request: DecisionRequest, limit: number) {
  try {
    const text = canonicalJson(request)
    if (Buffer.byteLength(text) > limit) return null
    const snapshot: DecisionRequest = JSON.parse(text)
    if (
      !object(snapshot) ||
      Object.keys(snapshot).some(key => !['model', 'state', 'questions'].includes(key)) ||
      !OPENROUTER_DECISION_MODELS.includes(snapshot.model) ||
      !state(snapshot.state) ||
      !object(snapshot.questions)
    )
      return null
    const questions = Object.entries(snapshot.questions)
    if (
      questions.length === 0 ||
      (snapshot.model === 'openai/gpt-6-luna-decisions' && questions.length > 200) ||
      !questions.every(([name, value]) => name.length > 0 && question(value))
    )
      return null
    return { body: Buffer.from(text), questions: snapshot.questions }
  } catch {
    return null
  }
}

function probability(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}
function count(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
function matches(question: DecisionQuestion, answer: unknown): boolean {
  if (!object(answer)) return false
  if (answer.type === 'refusal') return true
  if (
    answer.type !== question.type ||
    (answer.confidence !== undefined && !probability(answer.confidence))
  )
    return false
  const distribution = answer.probabilities
  if (
    distribution !== undefined &&
    (!object(distribution) || !Object.values(distribution).every(probability))
  )
    return false
  switch (question.type) {
    case 'noul':
      return probability(answer.noul)
    case 'choice':
      return (
        typeof answer.choice === 'string' &&
        Object.hasOwn(question.criteria, answer.choice) &&
        (distribution === undefined ||
          (object(distribution) &&
            Object.keys(distribution).every(key => Object.hasOwn(question.criteria, key))))
      )
    case 'score':
      return (
        typeof answer.score === 'number' &&
        Number.isFinite(answer.score) &&
        (answer.legend === undefined ||
          (object(answer.legend) && Object.values(answer.legend).every(state)))
      )
  }
}

export function isDecisionResponse(
  value: unknown,
  questions: DecisionRequest['questions'],
): value is DecisionResponse {
  if (
    !object(value) ||
    typeof value.model !== 'string' ||
    !value.model ||
    (value.id !== undefined && typeof value.id !== 'string') ||
    (value.provider !== undefined && typeof value.provider !== 'string')
  )
    return false
  const { answers, usage } = value
  return (
    object(usage) &&
    count(usage.input_tokens) &&
    count(usage.output_tokens) &&
    (usage.cost === undefined ||
      (typeof usage.cost === 'number' && Number.isFinite(usage.cost) && usage.cost >= 0)) &&
    (usage.is_byok === undefined || typeof usage.is_byok === 'boolean') &&
    object(answers) &&
    Object.keys(answers).length === Object.keys(questions).length &&
    Object.entries(questions).every(
      ([key, q]) => Object.hasOwn(answers, key) && matches(q, answers[key]),
    )
  )
}
