import { readJsonText, writeJsonText, type JsonLimits } from '@omne-harness/json-text'
import {
  decisionAnswersBlock,
  type DecisionAsk,
  type ModelFault,
  type Supplier,
  type TransportFailure,
} from '@omne-harness/model-contract'
import type { CallAccountReport, TransportFact } from '@omne-harness/model-contract/provider'
import { plainDecimal } from '../chat-completions/decimal.ts'
import type { RouteAccounting } from '../config.ts'
import type { PiDecisionsBinding, PiResponseDecoder } from '../family.ts'
import { recordAdoption, type PiModelRecordHead } from '../family-table.ts'
import type { PiSend } from '../send.ts'
import { isDecisionResponse, prepareDecision } from './codec.ts'
import type { DecisionRequest, DecisionResponse } from './contract.ts'

const ACCOUNT_EVENT = 'usage'
const BLOCK = '0'

/** What a decisions record states beside its head. */
export type DecisionsRecordData = Readonly<{
  decisions: Readonly<{ maxQuestions: string | null }>
}>

/** Binds a decisions record to a supplier: the record is data, and holds nothing to release. */
export function bindDecisions(
  owner: string,
  record: PiModelRecordHead & DecisionsRecordData,
  supplier: Supplier,
): PiDecisionsBinding {
  const { maxQuestions } = record.decisions
  return Object.freeze({
    supplier,
    adoption: recordAdoption(owner, record),
    endpoint: 'decisions',
    maxQuestions: maxQuestions === null ? null : Number(maxQuestions),
    release: async () => {},
  })
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

/** How one ask is written for the interface of a binding, and how its one answer is read back. */
export function decisionsCodec(
  binding: PiDecisionsBinding,
  ask: DecisionAsk,
  limits: Readonly<{ maxRequestBytes: number; json: JsonLimits }>,
): Pick<PiSend, 'encode' | 'createDecoder'> {
  const fixed = prepareDecision(
    { model: binding.supplier.model, ...ask },
    { maxRequestBytes: limits.maxRequestBytes, maxQuestions: binding.maxQuestions },
  )
  return {
    encode() {
      if (fixed === null) return { failure: NOT_A_DECISION }
      const body = readJsonText(fixed.body.toString('utf8'), limits.json)
      if (body.kind !== 'ok') return { failure: NOT_A_DECISION }
      return { ok: { body: body.value, diagnostics: [], replayPrefix: '', replayCarried: false } }
    },
    createDecoder(accounting) {
      if (fixed === null)
        throw new Error('the request of this decoder is not the decision that was encoded')
      return decoderOf(fixed.questions, accounting)
    },
  }
}
