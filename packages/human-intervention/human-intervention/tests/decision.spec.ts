import { describe, expect, it } from 'vitest'
import {
  DecisionRequestSchema,
  DecisionResponseSchema,
  RegisterRequestSchema,
  decisionRequestDocument,
  decisionResponseDocument,
} from '../src/index.ts'

const option = (id: string) => ({ id, label: `选 ${id}`, description: `选项 ${id}。` })
const card = (kind: string, cardId = 'card-1', options = [option('a'), option('b')]) => ({
  cardId,
  kind,
  title: '怎么继续？',
  description: '请选择。',
  options,
  declineConsequence: '跳过此题，不作答。',
})

describe('the request of a decision a tool waits for', () => {
  it('carries inquiry and approval cards', () => {
    const parsed = DecisionRequestSchema.safeParse({
      questions: [card('question'), card('approval', 'card-2')],
    })
    expect(parsed.success).toBe(true)
  })

  it('refuses the card kinds a tool does not raise', () => {
    for (const kind of ['extension', 'admission'])
      expect(DecisionRequestSchema.safeParse({ questions: [card(kind)] }).success).toBe(false)
  })

  it('refuses an option that names an effect, a repeated option and an extra field', () => {
    const effect = { ...option('a'), effectRef: 'grant' }
    expect(
      DecisionRequestSchema.safeParse({ questions: [card('approval', 'c', [effect])] }).success,
    ).toBe(false)
    expect(
      DecisionRequestSchema.safeParse({
        questions: [card('question', 'c', [option('a'), option('a')])],
      }).success,
    ).toBe(false)
    expect(DecisionRequestSchema.safeParse({ questions: [card('question')], x: 1 }).success).toBe(
      false,
    )
  })

  it('holds between one and sixty-four cards', () => {
    const cards = (n: number) => Array.from({ length: n }, (_, i) => card('question', `c${i}`))
    expect(DecisionRequestSchema.safeParse({ questions: cards(0) }).success).toBe(false)
    expect(DecisionRequestSchema.safeParse({ questions: cards(64) }).success).toBe(true)
    expect(DecisionRequestSchema.safeParse({ questions: cards(65) }).success).toBe(false)
  })

  it('registers as the questions of a human-intervention request unchanged', () => {
    const request = DecisionRequestSchema.parse({ questions: [card('question')] })
    const register = RegisterRequestSchema.safeParse({
      protocol: 'hitl/1',
      operation: { tenantRef: 't', actorRef: 'a', operationId: 'o' },
      preparationRef: 'p',
      origin: {
        kind: 'tool',
        originRef: 'call',
        wait: { owner: 'tool', waitId: 'w', incarnation: '1', destination: 'hitl' },
        positionRef: 'w',
        adoptionRef: 'bridge',
        toolCallRef: 'call',
      },
      questions: request.questions,
      displayContext: 'Ask',
    })
    expect(register.success).toBe(true)
  })
})

describe('the response a tool reads back', () => {
  it('answers each card by selection, text or no answer', () => {
    const parsed = DecisionResponseSchema.safeParse({
      answers: [
        { cardId: 'a', kind: 'selection', optionId: 'x' },
        { cardId: 'b', kind: 'text', text: '原话' },
        { cardId: 'c', kind: 'no-answer' },
      ],
    })
    expect(parsed.success).toBe(true)
  })

  it('refuses a decline, an empty batch and an extra field', () => {
    expect(
      DecisionResponseSchema.safeParse({ answers: [{ cardId: 'a', kind: 'decline' }] }).success,
    ).toBe(false)
    expect(DecisionResponseSchema.safeParse({ answers: [] }).success).toBe(false)
    expect(
      DecisionResponseSchema.safeParse({
        answers: [{ cardId: 'a', kind: 'no-answer', x: 1 }],
      }).success,
    ).toBe(false)
  })
})

describe('the JSON Schema documents of the decision contract', () => {
  it('name the same card kinds and answer kinds as the schemas', () => {
    const items = decisionRequestDocument.properties.questions.items.oneOf
    expect(items.map(item => item.properties.kind.const)).toEqual(['question', 'approval'])
    const answers = decisionResponseDocument.properties.answers.items.oneOf
    expect(answers.map(item => item.properties.kind.const)).toEqual([
      'selection',
      'text',
      'no-answer',
    ])
  })
  it('bound the texts as the schemas do', () => {
    const card = decisionRequestDocument.properties.questions.items.oneOf[0].properties
    expect(card.cardId).toEqual({ type: 'string', minLength: 1, maxLength: 256 })
    expect(card.description).toEqual({ type: 'string', minLength: 1, maxLength: 4096 })
    const text = decisionResponseDocument.properties.answers.items.oneOf[1].properties
    expect(text.text).toEqual({ type: 'string', minLength: 1, maxLength: 8192 })
  })
})
