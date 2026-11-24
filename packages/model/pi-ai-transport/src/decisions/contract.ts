/** OpenRouter's common text/JSON Decisions vocabulary for Jev and GPT-6 Luna. */
export const OPENROUTER_DECISION_MODELS = Object.freeze([
  'typesafe/jev-1.13',
  'typesafe/jev-1.14',
  'openai/gpt-6-luna-decisions',
] as const)
export type DecisionModel = (typeof OPENROUTER_DECISION_MODELS)[number]

type Json = string | number | boolean | null | JsonObject | readonly Json[]
type JsonObject = { readonly [key: string]: Json }
export type DecisionState = string | JsonObject | readonly Json[]

export type DecisionQuestion = Readonly<{ instructions?: DecisionState | null }> &
  (
    | Readonly<{
        type: 'noul'
        criteria?: Partial<Readonly<Record<'true' | 'false', DecisionState | null>>>
      }>
    | Readonly<{ type: 'choice'; criteria: Readonly<Record<string, DecisionState | null>> }>
    | Readonly<{ type: 'score'; criteria: readonly DecisionState[] }>
  )
export type DecisionRequest = Readonly<{
  model: DecisionModel
  state: DecisionState
  questions: Readonly<Record<string, DecisionQuestion>>
}>

type Confidence = Readonly<{ confidence?: number }>
type Distribution = Confidence & Readonly<{ probabilities?: Readonly<Record<string, number>> }>
export type DecisionAnswer =
  | Readonly<{ type: 'refusal' }>
  | (Readonly<{ type: 'noul'; noul: number }> & Confidence)
  | (Readonly<{ type: 'choice'; choice: string }> & Distribution)
  | (Readonly<{ type: 'score'; score: number; legend?: Readonly<Record<string, DecisionState>> }> &
      Distribution)

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
