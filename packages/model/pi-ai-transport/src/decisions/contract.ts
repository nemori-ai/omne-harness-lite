import type {
  DecisionAnswer,
  DecisionAsk,
  DecisionQuestion,
  DecisionState,
} from '@omne-harness/model-contract'

export type { DecisionAnswer, DecisionQuestion, DecisionState }

/** The body of one decisions request: the ask, and the model that answers it. */
export type DecisionRequest = DecisionAsk & Readonly<{ model: string }>
/** What bounds one request: the bytes the assembly allows, and the questions the model takes. */
export type DecisionLimits = Readonly<{ maxRequestBytes: number; maxQuestions: number | null }>

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
