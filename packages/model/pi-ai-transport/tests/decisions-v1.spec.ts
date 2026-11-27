import { readJsonText, writeJsonText } from '@omne-harness/json-text'
import {
  decisionAnswersOf,
  type DecisionAsk,
  type DecisionsModelRequest,
  type Supplier,
} from '@omne-harness/model-contract'
import type { TransportFact } from '@omne-harness/model-contract/provider'
import { describe, expect, it } from 'vitest'
import { bindDecisions } from '../src/decisions/binding.ts'
import { DECISION_WIRES } from '../src/decisions/wire.ts'
import { recordAdoption, recordProvider } from '../src/family-table.ts'
import { sendOf } from '../src/send.ts'
import { LIMITS, REQUEST } from './support/test-family.ts'

const MODEL = 'judge-1'
const OWNER = 'test-decisions-v1'
const RECORD = {
  name: MODEL,
  revision: '1',
  route: { provider: 'upstream', model: MODEL },
  status: 'current',
  decisions: { maxQuestions: '3' },
} as const
const SUPPLIER: Supplier = {
  adoption: recordAdoption(OWNER, RECORD),
  provider: recordProvider(RECORD),
  model: MODEL,
  credential: { layer: 'official' },
}
// A provider that answers itself and looks no cost up afterwards.
const ACCOUNTING = { place: 'upstream', costUnit: 'usd' }
const ask: DecisionAsk = {
  state: 'The home page loads in 0.7 seconds.',
  questions: {
    met: {
      type: 'noul',
      instructions: 'Is the goal met?',
      criteria: { true: 'it loads in under one second', false: { p95: 'one second or more' } },
    },
    area: { type: 'choice', instructions: 'Which area?', criteria: { web: 'the site', app: null } },
    effort: { type: 'score', criteria: ['none', 'some', { much: true }] },
  },
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
function send(asked?: DecisionAsk) {
  const binding = bindDecisions(OWNER, RECORD, SUPPLIER, 'decisions-v1')
  const paired = sendOf(binding, requestOf(asked), 0, { maxDecisionBytes: 8192, json: LIMITS.json })
  if (!('ok' in paired)) throw new Error(JSON.stringify(paired))
  return paired.ok
}
function bodyOf(asked?: DecisionAsk): unknown {
  const encoded = send(asked).encode([], [])
  if (!('ok' in encoded)) throw new Error(JSON.stringify(encoded))
  return JSON.parse(writeJsonText(encoded.ok.body))
}
const frameOf = (body: unknown) => {
  const read = readJsonText(JSON.stringify(body), LIMITS.json)
  if (read.kind !== 'ok') throw new Error('no frame')
  return { kind: 'data', value: read.value } as const
}
const USAGE = { input_tokens: 398, output_tokens: 0, input_tokens_details: { cached_tokens: 0 } }
const ANSWERS = [
  { type: 'predicate', name: 'met', probability: 0.97 },
  {
    type: 'choice',
    name: 'area',
    choice: 'web',
    probabilities: [
      { value: 'web', probability: 0.9 },
      { value: 'app', probability: 0.1 },
    ],
    confidence: 0.8,
  },
  {
    type: 'score',
    name: 'effort',
    score: 0.4,
    probabilities: [
      { value: 0, label: '0', probability: 0.6 },
      { value: 1, label: '1', probability: 0.4 },
    ],
    confidence: 0.7,
  },
]
function decoded(body: unknown, asked?: DecisionAsk) {
  const decoder = send(asked).createDecoder(ACCOUNTING)
  const step = decoder.accept(frameOf(body))
  if (!('ok' in step)) return step
  const end = decoder.end()
  if (!('ok' in end)) return end
  return { ok: [...step.ok, ...end.ok] }
}
const sealedOf = (facts: readonly TransportFact[]) =>
  facts.flatMap(fact => (fact.kind === 'block-seal' ? [{ kind: 'sealed', block: fact.block }] : []))

describe('an ask written in the second wire shape', () => {
  // The ask is held as canonical JSON, so names and options are in key order, as on the first wire.
  it('is the model, the material as input and the questions as a list by name, each in its own type', () => {
    expect(bodyOf()).toEqual({
      model: MODEL,
      input: 'The home page loads in 0.7 seconds.',
      questions: [
        {
          type: 'choice',
          name: 'area',
          instructions: 'Which area?',
          choices: [{ value: 'app' }, { value: 'web', description: 'the site' }],
        },
        {
          type: 'score',
          name: 'effort',
          levels: [
            { label: '0', description: 'none' },
            { label: '1', description: 'some' },
            { label: '2', description: '{"much":true}' },
          ],
        },
        {
          type: 'predicate',
          name: 'met',
          instructions:
            'Is the goal met?\n\nTrue when: it loads in under one second\n\nFalse when: {"p95":"one second or more"}',
        },
      ],
    })
  })

  it('puts a material that is data into one message as data', () => {
    const asked: DecisionAsk = { state: { measured: 0.7 }, questions: { met: { type: 'noul' } } }
    expect(bodyOf(asked)).toEqual({
      model: MODEL,
      input: [{ role: 'user', content: [{ type: 'input_json', data: { measured: 0.7 } }] }],
      questions: [{ type: 'predicate', name: 'met' }],
    })
  })

  it('writes no yes-or-no criteria for a choice whose options are named true and false', () => {
    const asked: DecisionAsk = {
      state: 'x',
      questions: { pick: { type: 'choice', criteria: { true: 'yes', false: 'no' } } },
    }
    expect(bodyOf(asked)).toMatchObject({
      questions: [
        {
          type: 'choice',
          name: 'pick',
          choices: [
            { value: 'false', description: 'no' },
            { value: 'true', description: 'yes' },
          ],
        },
      ],
    })
    expect(JSON.stringify(bodyOf(asked))).not.toContain('True when')
  })

  it('is not written when a question is of no known type', () => {
    const request = { model: MODEL, state: 'x', questions: { met: { type: 'guess' } } }
    for (const wire of Object.values(DECISION_WIRES))
      expect(
        wire.prepare(request as never, { maxRequestBytes: 4096, maxQuestions: null }),
      ).toBeNull()
  })

  it('is not written when the request holds what is not JSON', () => {
    const request = { model: MODEL, state: { at: 1n }, questions: { met: { type: 'noul' } } }
    expect(
      DECISION_WIRES['decisions-v1'].prepare(request as never, {
        maxRequestBytes: 4096,
        maxQuestions: null,
      }),
    ).toBeNull()
  })

  it('is not written when it asks more questions than the model takes', () => {
    const many: DecisionAsk = {
      state: 'x',
      questions: Object.fromEntries(['a', 'b', 'c', 'd'].map(name => [name, { type: 'noul' }])),
    }
    expect(send(many).encode([], [])).toMatchObject({ failure: { reason: 'not-a-decision' } })
  })
})

describe('the answer read back from the second wire shape', () => {
  it('is the same answers as the first wire gives, with the usage and an unknown cost at the provider', () => {
    const facts = decoded({ model: MODEL, answers: ANSWERS, usage: USAGE })
    if (!('ok' in facts)) throw new Error(JSON.stringify(facts))
    expect(decisionAnswersOf(sealedOf(facts.ok) as never)).toEqual({
      met: { type: 'noul', noul: 0.97 },
      area: {
        type: 'choice',
        choice: 'web',
        confidence: 0.8,
        probabilities: { web: 0.9, app: 0.1 },
      },
      effort: { type: 'score', score: 0.4, confidence: 0.7, probabilities: { '0': 0.6, '1': 0.4 } },
    })
    expect(facts.ok.find(fact => fact.kind === 'account')).toMatchObject({
      value: {
        usage: [
          { name: 'input', state: 'known', lexeme: '398' },
          { name: 'output', state: 'known', lexeme: '0' },
        ],
        cost: [{ state: 'unknown', unit: 'usd', source: 'billable' }],
        place: 'upstream',
      },
    })
  })

  it('takes a refusal of one question as a refusal', () => {
    const answers = [ANSWERS[0], ANSWERS[1], { type: 'refusal', name: 'effort' }]
    const facts = decoded({ model: MODEL, answers, usage: USAGE })
    if (!('ok' in facts)) throw new Error(JSON.stringify(facts))
    expect(decisionAnswersOf(sealedOf(facts.ok) as never)?.['effort']).toEqual({ type: 'refusal' })
  })

  it('takes a choice without its probabilities', () => {
    const answers = [ANSWERS[0], { type: 'choice', name: 'area', choice: 'app' }, ANSWERS[2]]
    const facts = decoded({ model: MODEL, answers, usage: USAGE })
    if (!('ok' in facts)) throw new Error(JSON.stringify(facts))
    expect(decisionAnswersOf(sealedOf(facts.ok) as never)?.['area']).toEqual({
      type: 'choice',
      choice: 'app',
    })
  })

  it('takes the options of a choice by their text only', () => {
    const asked: DecisionAsk = {
      state: 'x',
      questions: { rank: { type: 'choice', criteria: { '1': 'first', '2': 'second' } } },
    }
    const answer = (value: unknown) => ({
      model: MODEL,
      answers: [
        { type: 'choice', name: 'rank', choice: '1', probabilities: [{ value, probability: 1 }] },
      ],
      usage: USAGE,
    })
    expect(decoded(answer('1'), asked)).toHaveProperty('ok')
    expect(decoded(answer(1), asked)).toHaveProperty('failure')
  })

  it('takes no answer without a name, even for a question named as nothing is', () => {
    const asked: DecisionAsk = { state: 'x', questions: { undefined: { type: 'noul' } } }
    const body = { model: MODEL, answers: [{ type: 'predicate', probability: 0.5 }], usage: USAGE }
    expect(decoded(body, asked)).toHaveProperty('failure')
    const named = { ...body, answers: [{ ...body.answers[0], name: 'undefined' }] }
    expect(decoded(named, asked)).toHaveProperty('ok')
  })

  it.each([
    ['an answer that is no object', [null, ...ANSWERS.slice(1)]],
    [
      'probabilities that are no list',
      [ANSWERS[0], { ...ANSWERS[1], probabilities: { web: 1 } }, ANSWERS[2]],
    ],
    [
      'an option twice in the probabilities',
      [
        ANSWERS[0],
        {
          ...ANSWERS[1],
          probabilities: [
            { value: 'web', probability: 0.5 },
            { value: 'web', probability: 0.5 },
          ],
        },
        ANSWERS[2],
      ],
    ],
    ['an answer missing', ANSWERS.slice(0, 2)],
    ['an answer twice', [...ANSWERS, ANSWERS[0]]],
    ['an answer to no question', [...ANSWERS.slice(0, 2), { ...ANSWERS[2], name: 'other' }]],
    [
      'an answer of another type',
      [{ ...ANSWERS[0], type: 'score', score: 1 }, ...ANSWERS.slice(1)],
    ],
    ['a choice not offered', [ANSWERS[0], { ...ANSWERS[1], choice: 'desk' }, ANSWERS[2]]],
    [
      'a probability of an option not offered',
      [
        ANSWERS[0],
        { ...ANSWERS[1], probabilities: [{ value: 'desk', probability: 1 }] },
        ANSWERS[2],
      ],
    ],
    ['a probability above one', [{ ...ANSWERS[0], probability: 1.5 }, ...ANSWERS.slice(1)]],
    [
      'a level that is no index',
      [
        ...ANSWERS.slice(0, 2),
        { ...ANSWERS[2], probabilities: [{ value: 'low', probability: 1 }] },
      ],
    ],
    ['an answer of an unknown type', [{ type: 'guess', name: 'met' }, ...ANSWERS.slice(1)]],
  ])('is no answer at all with %s', (_case, answers) => {
    expect(decoded({ model: MODEL, answers, usage: USAGE })).toEqual({
      failure: {
        cause: 'upstream-protocol',
        diagnostic: 'decision-answers-do-not-match',
        upstreamStatus: null,
      },
    })
  })

  it('is no answer at all without its usage or its model', () => {
    for (const body of [
      { model: MODEL, answers: ANSWERS },
      { answers: ANSWERS, usage: USAGE },
      { model: MODEL, answers: {}, usage: USAGE },
    ])
      expect(decoded(body)).toMatchObject({
        failure: { diagnostic: 'decision-answers-do-not-match' },
      })
  })
})
