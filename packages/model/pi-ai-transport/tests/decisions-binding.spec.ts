import { readJsonText, writeJsonText } from '@omne-harness/json-text'
import {
  decisionAnswersOf,
  decisionAskMessage,
  type DecisionAsk,
  type FixedModelRequest,
  type Supplier,
} from '@omne-harness/model-contract'
import type { TransportFact } from '@omne-harness/model-contract/provider'
import { describe, expect, it } from 'vitest'
import {
  decisionBinding,
  decisionSupplierOf,
  isDecisionSupplier,
} from '../src/decisions/binding.ts'
import { LIMITS, REQUEST } from './support/test-family.ts'

const MODEL = 'openai/gpt-6-luna-decisions'
const known = decisionSupplierOf(MODEL)
if (known === undefined) throw new Error('no supplier of the decision model')
const SUPPLIER: Supplier = { ...known, credential: { layer: 'official' } }
const ACCOUNTING = { place: 'openrouter', costUnit: 'openrouter-credit' }
const ask: DecisionAsk = {
  state: { goal: 'faster home page' },
  questions: {
    A1: { type: 'choice', criteria: { holds: 'it holds', fails: 'it does not' } },
    X1: { type: 'noul', instructions: 'Did the exit come about?' },
  },
}
const answers = {
  A1: { type: 'choice', choice: 'holds', probabilities: { holds: 0.93, fails: 0.07 } },
  X1: { type: 'noul', noul: 0.1 },
}

function requestOf(asked: DecisionAsk = ask): FixedModelRequest {
  const message = decisionAskMessage(`msg_${'d'.repeat(40)}`, asked)
  if (message === null) throw new Error('no message')
  return { ...REQUEST, suppliers: [SUPPLIER], messages: [message] }
}
const binding = () => decisionBinding(SUPPLIER, { maxRequestBytes: 4096, json: LIMITS.json })
const frameOf = (body: unknown) => {
  const read = readJsonText(JSON.stringify(body), LIMITS.json)
  if (read.kind !== 'ok') throw new Error('no frame')
  return { kind: 'data', value: read.value } as const
}
const decoder = () =>
  binding().createDecoder({ request: requestOf(), accounting: ACCOUNTING } as never)
const factsOf = (step: { ok: readonly TransportFact[] } | { failure: unknown }) => {
  if (!('ok' in step)) throw new Error(JSON.stringify(step))
  return step.ok
}

describe('the supplier of a decision model', () => {
  it('is known by its model, and is the one a request names only with this provider and this exact adoption', () => {
    expect(decisionSupplierOf('openai/gpt-5.6-sol-pro')).toBeUndefined()
    expect(isDecisionSupplier(SUPPLIER)).toBe(true)
    expect(SUPPLIER.adoption).toMatchObject({
      owner: '@omne-harness/pi-ai-transport/decisions',
      name: MODEL,
      revision: '1',
    })
    expect(isDecisionSupplier({ ...SUPPLIER, model: 'openai/gpt-5.6-sol-pro' })).toBe(false)
    expect(isDecisionSupplier({ ...SUPPLIER, provider: 'another' as never })).toBe(false)
    for (const field of ['owner', 'name', 'revision', 'digest'] as const) {
      const adoption = { ...SUPPLIER.adoption, [field]: 'another' }
      expect(isDecisionSupplier({ ...SUPPLIER, adoption })).toBe(false)
    }
  })
})

describe('the body of a decision dispatch', () => {
  it('is the ask of the request under the model of the supplier, on the decisions endpoint', () => {
    const made = binding()
    expect(made.endpoint).toBe('decisions')
    expect(made.adoption).toEqual(SUPPLIER.adoption)
    const encoded = made.encode({ request: requestOf() } as never)
    if (!('ok' in encoded)) throw new Error(JSON.stringify(encoded))
    expect(JSON.parse(writeJsonText(encoded.ok.body))).toEqual({ model: MODEL, ...ask })
  })

  it('carries nothing of a replay and no media, and has no decoder for a request that is no decision', () => {
    const made = binding()
    const encoded = made.encode({ request: requestOf() } as never)
    if (!('ok' in encoded)) throw new Error(JSON.stringify(encoded))
    expect(encoded.ok).toMatchObject({ diagnostics: [], replayPrefix: '', replayCarried: false })
    expect(made.replayFormat).toBeNull()
    expect(made.mediaLimits({} as never)).toBeNull()
    expect(() => made.createDecoder({ request: REQUEST, accounting: ACCOUNTING } as never)).toThrow(
      'not the decision that was encoded',
    )
  })

  it('is refused for a request that is no decision, or one over the byte limit', () => {
    const chat = binding().encode({ request: REQUEST } as never)
    expect(chat).toEqual({
      failure: { kind: 'invalid', field: 'request', reason: 'not-a-decision' },
    })
    const tight = decisionBinding(SUPPLIER, { maxRequestBytes: 16, json: LIMITS.json })
    expect(tight.encode({ request: requestOf() } as never)).toMatchObject({
      failure: { reason: 'not-a-decision' },
    })
  })
})

describe('the one body a decision answers with', () => {
  const usage = { input_tokens: 1163, output_tokens: 0, cost: 0.0001163 }

  it('becomes one sealed block of the answers and one account, then the end of the call', () => {
    const reading = decoder()
    const facts = factsOf(
      reading.accept(frameOf({ model: MODEL, provider: 'OpenAI', answers, usage })),
    )
    expect(facts.map(fact => fact.kind)).toEqual([
      'block-open',
      'block-delta',
      'block-seal',
      'account',
    ])
    const sealed = facts.find(fact => fact.kind === 'block-seal')
    if (sealed?.kind !== 'block-seal') throw new Error('no sealed block')
    expect(decisionAnswersOf([{ kind: 'sealed', block: sealed.block, trims: [] }])).toEqual(answers)
    const account = facts.find(fact => fact.kind === 'account')
    expect(account).toMatchObject({
      value: {
        usage: [
          { name: 'input', state: 'known', lexeme: '1163', unit: 'token' },
          { name: 'output', state: 'known', lexeme: '0', unit: 'token' },
        ],
        cost: [
          { state: 'known', lexeme: '0.0001163', unit: 'openrouter-credit', source: 'billable' },
        ],
        place: 'openrouter/OpenAI',
      },
    })
    expect(factsOf(reading.end())).toEqual([
      { kind: 'ended', termination: { kind: 'completed', reason: 'stop' } },
    ])
  })

  it('opens its block as appended text at the first place, and accounts what the body does not say as unknown', () => {
    const facts = factsOf(decoder().accept(frameOf({ model: MODEL, answers, usage })))
    expect(facts[0]).toEqual({ kind: 'block-open', index: '0', mode: 'append', content: 'text' })
    expect(facts[1]).toMatchObject({ kind: 'block-delta', index: '0' })
    expect(facts[2]).toMatchObject({ kind: 'block-seal', index: '0' })
    expect(facts[3]).toMatchObject({
      kind: 'account',
      event: 'usage',
      value: {
        trimmed: { state: 'unknown', unit: 'token' },
        duration: { state: 'unknown' },
        revision: '1',
      },
    })
  })

  it('accounts a very small cost as a plain decimal, not in the exponent form a number prints in', () => {
    const body = { model: MODEL, answers, usage: { ...usage, cost: 1e-7 } }
    const facts = factsOf(decoder().accept(frameOf(body)))
    expect(facts.find(fact => fact.kind === 'account')).toMatchObject({
      value: { cost: [{ state: 'known', lexeme: '0.0000001', unit: 'openrouter-credit' }] },
    })
  })

  it('accounts no cost when the body names none, and names the place unknown when the body names no provider', () => {
    const body = { model: MODEL, answers, usage: { input_tokens: 5, output_tokens: 1 } }
    const facts = factsOf(decoder().accept(frameOf(body)))
    expect(facts.find(fact => fact.kind === 'account')).toMatchObject({
      value: { cost: [], place: 'openrouter/unknown' },
    })
  })

  it('does not count when it leaves a question out, answers one of another type, or comes twice', () => {
    const protocol = (diagnostic: string) => ({
      failure: { cause: 'upstream-protocol', diagnostic, upstreamStatus: null },
    })
    const partial = { model: MODEL, answers: { A1: answers.A1 }, usage }
    expect(decoder().accept(frameOf(partial))).toEqual(protocol('decision-answers-do-not-match'))
    const wrong = { model: MODEL, answers: { ...answers, X1: answers.A1 }, usage }
    expect(decoder().accept(frameOf(wrong))).toEqual(protocol('decision-answers-do-not-match'))
    const twice = decoder()
    factsOf(twice.accept(frameOf({ model: MODEL, answers, usage })))
    expect(twice.accept(frameOf({ model: MODEL, answers, usage }))).toEqual(
      protocol('decision-second-body'),
    )
    expect(decoder().accept({ kind: 'end' } as never)).toEqual(protocol('decision-second-body'))
  })

  it('ends as a protocol failure when no body came', () => {
    expect(decoder().end()).toEqual({
      failure: {
        cause: 'upstream-protocol',
        diagnostic: 'decision-no-answer',
        upstreamStatus: null,
      },
    })
  })
})
