import { describe, expect, it } from 'vitest'
import {
  decisionAnswersBlock,
  decisionAnswersOf,
  decisionAskMessage,
  decisionAskOf,
  type DecisionAnswers,
  type DecisionAsk,
  type ResultPart,
} from '../src/index.ts'

const MESSAGE = `msg_${'d'.repeat(40)}`
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

function requestOf(message: NonNullable<ReturnType<typeof decisionAskMessage>>) {
  return { system: [], tools: [], messages: [message] }
}

describe('a decision as a model call', () => {
  const textOf = (asked: DecisionAsk) => {
    const [block] = decisionAskMessage(MESSAGE, asked)?.blocks ?? []
    if (block?.kind !== 'text') throw new Error('no text')
    return block.text
  }

  it('writes one text with the keys of every object in order, whatever order they were given in', () => {
    const state = { b: 1, a: { d: [{ z: 1, y: 2 }], c: null } }
    expect(textOf({ state, questions: {} })).toBe(
      '{"questions":{},"state":{"a":{"c":null,"d":[{"y":2,"z":1}]},"b":1}}',
    )
    const swapped = { questions: ask.questions, state: ask.state }
    expect(textOf(swapped)).toBe(textOf(ask))
  })

  it('carries the ask as the one block of one user message, and reads it back as it was written', () => {
    const message = decisionAskMessage(MESSAGE, ask)
    if (message === null) throw new Error('no message')
    expect(message.role).toBe('user')
    expect(message.blocks).toHaveLength(1)
    expect(decisionAskOf(requestOf(message))).toEqual(ask)
  })

  it('makes no message under an id that is no message id', () => {
    expect(decisionAskMessage('', ask)).toBeNull()
  })

  it('reads no ask from a request that is anything but one decision message', () => {
    const message = decisionAskMessage(MESSAGE, ask)
    if (message === null) throw new Error('no message')
    const request = requestOf(message)
    const [block] = message.blocks
    if (block?.kind !== 'text') throw new Error('no text')
    const withBlock = (changed: object) => ({
      ...request,
      messages: [{ ...message, blocks: [{ ...block, ...changed }] }],
    })
    expect(decisionAskOf({ ...request, messages: [] })).toBeNull()
    expect(decisionAskOf({ ...request, messages: [message, message] })).toBeNull()
    expect(decisionAskOf({ ...request, system: [block] })).toBeNull()
    const tool = { name: 't', description: 'd', argumentsSchema: { kind: 'object', value: [] } }
    expect(decisionAskOf({ ...request, tools: [tool] } as never)).toBeNull()
    expect(decisionAskOf(withBlock({ id: 'another' }) as never)).toBeNull()
    expect(decisionAskOf(withBlock({ text: 'not json' }) as never)).toBeNull()
    expect(decisionAskOf(withBlock({ text: '{"state":1}' }) as never)).toBeNull()
    expect(
      decisionAskOf(withBlock({ text: '{"questions":{},"state":1,"more":2}' }) as never),
    ).toBeNull()
    expect(
      decisionAskOf({ ...request, messages: [{ ...message, blocks: [block, block] }] } as never),
    ).toBeNull()
  })

  it('carries the answers as the one block of the result, and reads them back by name', () => {
    expect(decisionAnswersOf(sealed(decisionAnswersBlock(answers)))).toEqual(answers)
  })

  it('reads no answers from a result that is not one whole decision block', () => {
    const block = decisionAnswersBlock(answers)
    if (block.kind !== 'text') throw new Error('no text')
    expect(decisionAnswersOf([])).toBeNull()
    expect(decisionAnswersOf([...sealed(block), ...sealed(block)])).toBeNull()
    expect(
      decisionAnswersOf([{ kind: 'partial', content: 'text', value: block.text, trims: [] }]),
    ).toBeNull()
    expect(decisionAnswersOf(sealed({ ...block, id: 'another' }))).toBeNull()
    expect(decisionAnswersOf(sealed({ ...block, text: 'not json' }))).toBeNull()
    expect(decisionAnswersOf(sealed({ ...block, text: '[]' }))).toBeNull()
    expect(decisionAnswersOf(sealed({ ...block, text: '{"A1":{"type":"prose"}}' }))).toBeNull()
    expect(decisionAnswersOf(sealed({ ...block, text: '{"A1":"holds"}' }))).toBeNull()
  })
})
