import { judgeContentBlock } from '@omne-harness/content-block'
import { describe, expect, it } from 'vitest'
import {
  decisionAnswersBlock,
  decisionAnswersOf,
  DECISION_REPRESENTATION,
  judgeDecisionAsk,
  type DecisionAnswers,
  type DecisionAsk,
  type ResultPart,
} from '../src/index.ts'
import { judgeModelRequest, requestHead, requestRepresentation } from '../src/provider/index.ts'
import { request as chat } from './scripted-support.ts'

const ask: DecisionAsk = {
  state: { goal: { purpose: 'faster home page' }, rounds: 2 },
  questions: {
    A1: { type: 'choice', instructions: 'Does it hold?', criteria: { holds: 'yes', fails: 'no' } },
    X1: { type: 'noul' },
  },
}
const answers: DecisionAnswers = {
  A1: { type: 'choice', choice: 'holds', probabilities: { holds: 0.93, fails: 0.07 } },
  X1: { type: 'refusal' },
}
const sealed = (
  block: ResultPart extends infer P ? (P extends { block: infer B } ? B : never) : never,
) => [{ kind: 'sealed', block, trims: [] }] as const

const { profile, suppliers, fallback, retryPolicy, source } = chat
const decision = { kind: 'decisions', profile, suppliers, fallback, retryPolicy, source, ask }

describe('a decision as a model call', () => {
  it('carries the ask as a part of the request, and reads it back as it was written', () => {
    const judged = judgeModelRequest('decisions', decision)
    if (!('ok' in judged)) throw new Error(JSON.stringify(judged))
    expect(judged.ok.ask).toEqual(ask)
    expect(Object.isFrozen(judged.ok.ask.questions)).toBe(true)
    expect(requestHead(judged.ok)).toEqual({
      kind: 'decisions',
      profile,
      suppliers,
      fallback,
      retryPolicy,
      source,
    })
  })

  it('states nothing of a chat request, and is no chat request', () => {
    expect(judgeModelRequest('decisions', { ...decision, messages: [] })).toEqual({
      failure: { field: '', reason: 'unknown-field' },
    })
    expect(judgeModelRequest('llm', decision)).toEqual({
      failure: { field: '/kind', reason: 'value' },
    })
    expect(judgeModelRequest('decisions', chat)).toEqual({
      failure: { field: '/kind', reason: 'value' },
    })
  })

  it('is a representation of its own, and the block of its answers is for nobody', () => {
    expect(DECISION_REPRESENTATION).toEqual({
      owner: 'model-contract',
      name: 'decision-call',
      revision: '1',
      digest: '6f03fde97adcc0f91ae9d6c6e8e887d71d685acd774bce8b7fdb2e7d91a93889',
    })
    const judged = judgeModelRequest('decisions', decision)
    if (!('ok' in judged)) throw new Error(JSON.stringify(judged))
    expect(requestRepresentation(judged.ok)).toEqual(DECISION_REPRESENTATION)
    expect(requestRepresentation(chat)).toEqual(chat.representation)
    expect(decisionAnswersBlock(answers)).toMatchObject({
      id: 'decision-answers',
      visibility: { toHuman: false, toModel: false },
    })
  })

  it('reads answers of every type a decision gives, and none when one of them is no answer', () => {
    const every: DecisionAnswers = {
      A1: { type: 'choice', choice: 'holds' },
      X1: { type: 'noul', noul: 0.2 },
      S1: { type: 'score', score: 4 },
      R1: { type: 'refusal' },
    }
    expect(decisionAnswersOf(sealed(decisionAnswersBlock(every)))).toEqual(every)
    const block = decisionAnswersBlock(answers)
    if (block.kind !== 'text') throw new Error('no text')
    for (const text of [
      '{"A1":{"type":"choice","choice":"holds"},"X1":"holds"}',
      '{"A1":{"type":"choice","choice":"holds"},"X1":null}',
      '{"A1":{"type":7}}',
    ])
      expect(decisionAnswersOf(sealed({ ...block, text }))).toBeNull()
  })

  it.each([
    ['no material', { questions: ask.questions }],
    ['a member beside the material and the questions', { ...ask, more: 2 }],
    ['a material that is a number', { ...ask, state: 1 }],
    ['no question', { ...ask, questions: {} }],
    ['a question without a name', { ...ask, questions: { '': { type: 'noul' } } }],
    ['a question of an unknown type', { ...ask, questions: { Q: { type: 'rank' } } }],
    ['a question with an unknown member', { ...ask, questions: { Q: { type: 'noul', more: 1 } } }],
    ['a choice without options', { ...ask, questions: { Q: { type: 'choice', criteria: {} } } }],
    ['a score without a scale', { ...ask, questions: { Q: { type: 'score', criteria: [] } } }],
    [
      'a yes or no with a third criterion',
      { ...ask, questions: { Q: { type: 'noul', criteria: { maybe: 'x' } } } },
    ],
  ])('refuses an ask with %s, at the ask of the request', (_name, asked) => {
    expect(judgeDecisionAsk(asked)).toBeNull()
    expect(judgeModelRequest('decisions', { ...decision, ask: asked })).toEqual({
      failure: { field: '/ask', reason: 'value' },
    })
  })

  it('takes every type of question a decision asks', () => {
    const every = {
      state: ['line one', 'line two'],
      questions: {
        yes: { type: 'noul', instructions: null, criteria: { true: 'it holds', false: null } },
        pick: { type: 'choice', criteria: { a: 'first', b: null } },
        grade: { type: 'score', criteria: ['poor', { label: 'good' }] },
      },
    }
    expect(judgeDecisionAsk(every)).toBe(every)
  })

  it('carries the answers as the one block of the result, and reads them back by name', () => {
    expect(decisionAnswersOf(sealed(decisionAnswersBlock(answers)))).toEqual(answers)
  })

  it('reads no answers from a result that is not one whole decision block', () => {
    const block = decisionAnswersBlock(answers)
    if (block.kind !== 'text') throw new Error('no text')
    const another = judgeContentBlock({ ...block, id: 'another' })
    if (!('ok' in another)) throw new Error('no block')
    expect(decisionAnswersOf([])).toBeNull()
    expect(decisionAnswersOf([...sealed(block), ...sealed(block)])).toBeNull()
    expect(
      decisionAnswersOf([{ kind: 'partial', content: 'text', value: block.text, trims: [] }]),
    ).toBeNull()
    expect(decisionAnswersOf(sealed(another.ok))).toBeNull()
    expect(decisionAnswersOf(sealed({ ...block, text: 'not json' }))).toBeNull()
    expect(decisionAnswersOf(sealed({ ...block, text: '[]' }))).toBeNull()
    expect(decisionAnswersOf(sealed({ ...block, text: '{"A1":{"type":"prose"}}' }))).toBeNull()
    expect(decisionAnswersOf(sealed({ ...block, text: '{"A1":"holds"}' }))).toBeNull()
  })
})
