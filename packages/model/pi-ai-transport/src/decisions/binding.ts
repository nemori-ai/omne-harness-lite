import { readJsonText, writeJsonText, type JsonLimits } from '@omne-harness/json-text'
import {
  decisionAnswersBlock,
  decisionAskOf,
  type Adoption,
  type ModelFault,
  type ProviderName,
  type Supplier,
  type TransportFailure,
} from '@omne-harness/model-contract'
import type { CallAccountReport, TransportFact } from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import { plainDecimal } from '../chat-completions/decimal.ts'
import type { RouteAccounting } from '../config.ts'
import type { PiResponseDecoder, PiSendBinding } from '../family.ts'
import { recordAdoption, recordProvider, type PiModelRecordHead } from '../family-table.ts'
import { isDecisionResponse, prepareDecision } from './codec.ts'
import {
  OPENROUTER_DECISION_MODELS,
  type DecisionRequest,
  type DecisionResponse,
} from './contract.ts'

export const DECISIONS_OWNER = '@omne-harness/pi-ai-transport/decisions'
const ACCOUNT_EVENT = 'usage'
const BLOCK = '0'

const RECORDS: readonly PiModelRecordHead[] = OPENROUTER_DECISION_MODELS.map(model =>
  Object.freeze({
    name: model,
    revision: '1',
    route: Object.freeze({ provider: 'openrouter', model }),
    status: 'current',
  }),
)

export type DecisionSupplier = Readonly<{
  adoption: Adoption
  provider: ProviderName
  model: string
}>

const SUPPLIERS: ReadonlyMap<string, DecisionSupplier> = new Map(
  RECORDS.map(record => [
    record.name,
    Object.freeze({
      adoption: recordAdoption(DECISIONS_OWNER, record),
      provider: recordProvider(record),
      model: record.route.model,
    }),
  ]),
)

/** The supplier of a decision model before a credential layer is chosen; undefined for any other model. */
export function decisionSupplierOf(model: string): DecisionSupplier | undefined {
  return SUPPLIERS.get(model)
}

export function isDecisionSupplier(supplier: Pick<Supplier, 'adoption' | 'provider' | 'model'>) {
  const known = SUPPLIERS.get(supplier.model)
  if (known === undefined || known.provider !== supplier.provider) return false
  const { owner, name, revision, digest } = supplier.adoption
  const { adoption } = known
  return (
    owner === adoption.owner &&
    name === adoption.name &&
    revision === adoption.revision &&
    digest === adoption.digest
  )
}

const NOT_A_DECISION: TransportFailure = Object.freeze({
  kind: 'invalid',
  field: 'request',
  reason: 'not-a-decision',
})
const protocol = (diagnostic: string): ModelFault => ({
  cause: 'upstream-protocol',
  diagnostic,
  upstreamStatus: null,
})

function costOf(usage: DecisionResponse['usage'], unit: string): CallAccountReport['cost'] {
  if (usage.cost === undefined) return []
  const lexeme = plainDecimal(String(usage.cost))
  return lexeme === null
    ? [{ state: 'unknown', unit, source: 'billable' }]
    : [{ state: 'known', lexeme, unit, source: 'billable' }]
}

function reportOf(response: DecisionResponse, accounting: RouteAccounting): CallAccountReport {
  const { usage } = response
  return {
    usage: [
      { name: 'input', state: 'known', lexeme: String(usage.input_tokens), unit: 'token' },
      { name: 'output', state: 'known', lexeme: String(usage.output_tokens), unit: 'token' },
    ],
    cost: costOf(usage, accounting.costUnit),
    trimmed: { state: 'unknown', unit: 'token' },
    place: `${accounting.place}/${response.provider ?? 'unknown'}`,
    duration: { state: 'unknown' },
    revision: '1',
  }
}

function answerFacts(response: DecisionResponse, accounting: RouteAccounting): TransportFact[] {
  const block = decisionAnswersBlock(response.answers)
  if (block.kind !== 'text') throw new Error('the answers of a decision are one text block')
  return [
    { kind: 'block-open', index: BLOCK, mode: 'append', content: 'text' },
    { kind: 'block-delta', index: BLOCK, delta: block.text },
    { kind: 'block-seal', index: BLOCK, block },
    { kind: 'account', event: ACCOUNT_EVENT, value: reportOf(response, accounting) },
  ]
}

/** Reads the one body of a decision: an answer to every question as asked, or the whole reply does not count. */
function decoderOf(
  questions: DecisionRequest['questions'],
  accounting: RouteAccounting,
): PiResponseDecoder {
  let answered = false
  return {
    accept(frame) {
      if (frame.kind !== 'data' || answered) return { failure: protocol('decision-second-body') }
      const value: unknown = JSON.parse(writeJsonText(frame.value))
      if (!isDecisionResponse(value, questions))
        return { failure: protocol('decision-answers-do-not-match') }
      answered = true
      return { ok: answerFacts(value, accounting) }
    },
    end() {
      if (!answered) return { failure: protocol('decision-no-answer') }
      return { ok: [{ kind: 'ended', termination: { kind: 'completed', reason: 'stop' } }] }
    },
  }
}

/** The binding of one decision dispatch: the ask of the request is its body, and the questions sent are the ones the answer is checked against. */
export function decisionBinding(
  supplier: Supplier,
  limits: Readonly<{ maxRequestBytes: number; json: JsonLimits }>,
): PiSendBinding {
  const prepared = (request: Parameters<PiSendBinding['createDecoder']>[0]['request']) => {
    const ask = decisionAskOf(request)
    if (ask === null) return null
    const candidate = { model: supplier.model, ...ask } as DecisionRequest
    return prepareDecision(candidate, limits.maxRequestBytes)
  }
  return {
    adoption: supplier.adoption,
    endpoint: 'decisions',
    replayFormat: null,
    mediaLimits: () => null,
    encode({ request }): Outcome<ReturnType<typeof encoded>, TransportFailure> {
      const fixed = prepared(request)
      if (fixed === null) return { failure: NOT_A_DECISION }
      const body = readJsonText(fixed.body.toString('utf8'), limits.json)
      if (body.kind !== 'ok') return { failure: NOT_A_DECISION }
      return { ok: encoded(body.value) }
    },
    createDecoder({ request, accounting }) {
      const fixed = prepared(request)
      if (fixed === null)
        throw new Error('the request of this decoder is not the decision that was encoded')
      return decoderOf(fixed.questions, accounting)
    },
    release: async () => {},
  }
}

function encoded(body: Extract<ReturnType<typeof readJsonText>, { kind: 'ok' }>['value']) {
  return { body, diagnostics: [], replayPrefix: '', replayCarried: false }
}
