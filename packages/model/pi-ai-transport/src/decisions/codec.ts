import { judgeDecisionAsk } from '@omne-harness/model-contract'
import { canonicalJson } from '../canonical-json.ts'
import type {
  DecisionLimits,
  DecisionQuestion,
  DecisionRequest,
  DecisionResponse,
} from './contract.ts'

type Dict = Record<string, unknown>
function object(value: unknown): value is Dict {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function state(value: unknown): boolean {
  return typeof value === 'string' || Array.isArray(value) || object(value)
}

/** The bytes sent and the questions used to check the answer are the same owned snapshot. */
export function prepareDecision(request: DecisionRequest, limits: DecisionLimits) {
  try {
    const text = canonicalJson(request)
    if (Buffer.byteLength(text) > limits.maxRequestBytes) return null
    const snapshot: unknown = JSON.parse(text)
    if (!object(snapshot) || typeof snapshot.model !== 'string' || snapshot.model.length === 0)
      return null
    const ask = judgeDecisionAsk({ state: snapshot.state, questions: snapshot.questions })
    if (ask === null || Object.keys(snapshot).length !== 3) return null
    const { maxQuestions } = limits
    if (maxQuestions !== null && Object.keys(ask.questions).length > maxQuestions) return null
    return { body: Buffer.from(text), questions: ask.questions }
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
