import { readJsonText, writeJsonText } from '@omne-harness/json-text'
import {
  DECISION_REPRESENTATION,
  decisionAnswersOf,
  type DecisionAsk,
  type DecisionsModelRequest,
  type FixedModelRequest,
  type Supplier,
} from '@omne-harness/model-contract'
import type { TransportFact } from '@omne-harness/model-contract/provider'
import { describe, expect, it } from 'vitest'
import { bindDecisions } from '../src/decisions/binding.ts'
import { prepareDecision } from '../src/decisions/codec.ts'
import { recordAdoption, recordProvider } from '../src/family-table.ts'
import { sendOf } from '../src/send.ts'
import { LIMITS, REQUEST } from './support/test-family.ts'

const MODEL = 'openai/gpt-6-luna-decisions'
const OWNER = 'test-decisions'
const RECORD = {
  name: MODEL,
  revision: '1',
  route: { provider: 'openrouter', model: MODEL },
  status: 'current',
  decisions: { maxQuestions: '2' },
} as const
const SUPPLIER: Supplier = {
  adoption: recordAdoption(OWNER, RECORD),
  provider: recordProvider(RECORD),
  model: MODEL,
  credential: { layer: 'official' },
}
const ACCOUNTING = {
  place: 'openrouter',
  costUnit: 'openrouter-credit',
  generation: { requestHeader: 'x-generation-id', path: '/api/v1/generation' },
}
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

function requestOf(asked: DecisionAsk = ask): DecisionsModelRequest {
  return {
    kind: 'decisions',
    profile: REQUEST.profile,
    suppliers: [SUPPLIER],
    fallback: false,
    retryPolicy: REQUEST.retryPolicy,
    ask: asked,
    source: REQUEST.source,
  }
}
const binding = () => bindDecisions(OWNER, RECORD, SUPPLIER, 'decisions')
const pairing = (
  request: FixedModelRequest = requestOf(),
  maxDecisionBytes: number | undefined = 4096,
) => sendOf(binding(), request, 0, { maxDecisionBytes, json: LIMITS.json })
const send = (request?: FixedModelRequest, maxDecisionBytes?: number) => {
  const paired = pairing(request, maxDecisionBytes)
  if (!('ok' in paired)) throw new Error(JSON.stringify(paired))
  return paired.ok
}
const frameOf = (body: unknown) => {
  const read = readJsonText(JSON.stringify(body), LIMITS.json)
  if (read.kind !== 'ok') throw new Error('no frame')
  return { kind: 'data', value: read.value } as const
}
const decoder = () => send().createDecoder(ACCOUNTING)
const factsOf = (step: { ok: readonly TransportFact[] } | { failure: unknown }) => {
  if (!('ok' in step)) throw new Error(JSON.stringify(step))
  return step.ok
}

describe('the binding of a decisions record', () => {
  it('is the data of the record for its supplier, and holds nothing to release', async () => {
    const made = binding()
    expect(made).toMatchObject({
      supplier: SUPPLIER,
      adoption: SUPPLIER.adoption,
      endpoint: 'decisions',
      maxQuestions: 2,
    })
    await expect(made.release()).resolves.toBeUndefined()
  })

  it('states no limit on the questions when the record states none', () => {
    const unlimited = { ...RECORD, decisions: { maxQuestions: null } }
    expect(bindDecisions(OWNER, unlimited, SUPPLIER, 'decisions').maxQuestions).toBeNull()
  })

  it('pairs only with a decisions request, and only when the assembly gave a byte limit', () => {
    const adapter = SUPPLIER.adoption
    expect(pairing({ ...REQUEST, suppliers: [SUPPLIER] })).toEqual({
      failure: { kind: 'unsupported', field: 'request.kind', adapter },
    })
    const unlimited = { maxDecisionBytes: undefined, json: LIMITS.json }
    expect(sendOf(binding(), requestOf(), 0, unlimited)).toEqual({
      failure: { kind: 'unsupported', field: 'limits.decisions', adapter },
    })
  })
})

describe('the body of a decision dispatch', () => {
  it('is the ask of the request under the model of the supplier, on the decisions endpoint', () => {
    const made = send()
    expect(made.endpoint).toBe('decisions')
    expect(made.adoption).toEqual(SUPPLIER.adoption)
    const encoded = made.encode([], [])
    if (!('ok' in encoded)) throw new Error(JSON.stringify(encoded))
    expect(JSON.parse(writeJsonText(encoded.ok.body))).toEqual({ model: MODEL, ...ask })
  })

  it('carries nothing of a replay and no media, and is written in the one form of a decision call', async () => {
    const made = send()
    const encoded = made.encode([], [])
    if (!('ok' in encoded)) throw new Error(JSON.stringify(encoded))
    expect(encoded.ok).toMatchObject({ diagnostics: [], replayPrefix: '', replayCarried: false })
    expect(made.replayFormat).toBeNull()
    expect(made.representation).toEqual(DECISION_REPRESENTATION)
    expect(await made.media(undefined, new AbortController().signal)).toEqual({ ok: [] })
  })

  it('is refused for an ask over the byte limit, or one with more questions than the record takes', () => {
    const refused = { failure: { kind: 'invalid', field: 'request', reason: 'not-a-decision' } }
    const tight = send(requestOf(), 16)
    expect(tight.encode([], [])).toEqual(refused)
    expect(() => tight.createDecoder(ACCOUNTING)).toThrow('not the decision that was encoded')
    const third = { ...ask.questions, X2: { type: 'noul' as const } }
    expect(send(requestOf({ ...ask, questions: third })).encode([], [])).toEqual(refused)
  })
})

describe('the request of a decision, as it is fixed before it is sent', () => {
  const limits = { maxRequestBytes: 4096, maxQuestions: null }
  const request = { model: MODEL, ...ask }

  it('is the text of the model and the ask, with the questions the answer is checked against', () => {
    const fixed = prepareDecision(request, limits)
    expect(fixed?.questions).toEqual(ask.questions)
    expect(JSON.parse(fixed?.body.toString('utf8') ?? 'null')).toEqual(request)
  })

  it('fits at exactly the byte limit, and not one byte under it', () => {
    const bytes = prepareDecision(request, limits)?.body.byteLength ?? 0
    expect(bytes).toBeGreaterThan(0)
    expect(prepareDecision(request, { ...limits, maxRequestBytes: bytes })).not.toBeNull()
    expect(prepareDecision(request, { ...limits, maxRequestBytes: bytes - 1 })).toBeNull()
  })

  it.each([
    ['a model that is no text', { ...request, model: 5 }],
    ['an empty model', { ...request, model: '' }],
    ['a member beside the model and the ask', { ...request, extra: true }],
    ['an ask without questions', { model: MODEL, state: 'text' }],
  ])('is nothing for %s', (_name, value) => {
    expect(prepareDecision(value as never, limits)).toBeNull()
  })

  it('takes any number of questions without a limit, and no more than a stated limit', () => {
    expect(prepareDecision(request, { ...limits, maxQuestions: null })).not.toBeNull()
    expect(prepareDecision(request, { ...limits, maxQuestions: 2 })).not.toBeNull()
    expect(prepareDecision(request, { ...limits, maxQuestions: 1 })).toBeNull()
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
