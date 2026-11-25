import type {
  DecisionAnswer,
  DecisionAsk,
  DecisionQuestion,
  DecisionState,
} from '@omne-harness/model-contract'

export type { DecisionAnswer, DecisionQuestion, DecisionState }

/** OpenRouter's common text/JSON Decisions vocabulary for Jev and GPT-6 Luna. */
export const OPENROUTER_DECISION_MODELS = Object.freeze([
  'typesafe/jev-1.13',
  'typesafe/jev-1.14',
  'openai/gpt-6-luna-decisions',
] as const)
export type DecisionModel = (typeof OPENROUTER_DECISION_MODELS)[number]

export type DecisionRequest = DecisionAsk & Readonly<{ model: DecisionModel }>

export type DecisionResponse = Readonly<{
  id?: string
  model: string
  provider?: string
  answers: Readonly<Record<string, DecisionAnswer>>
  usage: Readonly<{ input_tokens: number; output_tokens: number; cost?: number; is_byok?: boolean }>
}>

export type DecisionFailure = Readonly<{
  kind:
    | 'invalid-request'
    | 'credential-unavailable'
    | 'cancelled'
    | 'unavailable'
    | 'timeout'
    | 'http-error'
    | 'invalid-response'
    | 'response-too-large'
  dispatch: 'not-sent' | 'possibly-sent' | 'responded'
  status?: number
}>
