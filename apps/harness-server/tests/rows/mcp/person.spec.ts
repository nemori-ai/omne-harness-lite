import { expect, it } from 'vitest'
import { DecisionRequestSchema } from '@omne-harness/human-intervention'
import { hitlDecisionWait } from '@omne-harness/human-intervention-tool'
import { writeJsonText } from '@omne-harness/json-text'
import { mcpPersonAsk } from '../../../src/rows/mcp/person.ts'

const questions = [
  {
    id: 'q1',
    title: 'MCP 接入点 desk 问：date',
    description: '[external data begins]\nWhich day?\n[external data ends]',
    choices: [{ id: 'skip', label: '跳过' }],
  },
  {
    id: 'q2',
    title: 'MCP 接入点 desk 问：projector',
    description: '[external data begins]\nA projector?\n[external data ends]',
    choices: [
      { id: 'yes', label: '是' },
      { id: 'no', label: '否' },
    ],
  },
]

it('asks on the decision wait of human intervention with a request its schema takes (C109)', () => {
  expect(mcpPersonAsk.contract).toBe(hitlDecisionWait)
  const tree = mcpPersonAsk.request(questions)
  if (tree === undefined) throw new Error('two short questions did not fit one request')
  const request = JSON.parse(writeJsonText(tree)) as unknown
  const parsed = DecisionRequestSchema.safeParse(request)
  expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
  expect(
    parsed.data?.questions.map(card => [card.cardId, card.options.map(option => option.id)]),
  ).toEqual([
    ['q1', ['skip']],
    ['q2', ['yes', 'no']],
  ])
})

it('questions that do not fit one request are not handed over (C109)', () => {
  const big = Array.from({ length: 64 }, (_, index) => ({
    id: `q${String(index + 1)}`,
    title: 'MCP 接入点 desk 问：note',
    description: '字'.repeat(4000),
    choices: [{ id: 'skip', label: '跳过' }],
  }))
  expect(mcpPersonAsk.request(big)).toBeUndefined()
  expect(mcpPersonAsk.request(big.slice(0, 1))).toBeDefined()
})

it('reads each card of the decision back by its id: a choice, words, or nothing; anything else is not read', () => {
  const answered = mcpPersonAsk.reply({
    kind: 'answer',
    value: {
      answers: [
        { cardId: 'q1', kind: 'text', text: 'Tuesday' },
        { cardId: 'q2', kind: 'selection', optionId: 'yes' },
        { cardId: 'q3', kind: 'no-answer' },
      ],
    },
  })
  expect(answered).toEqual({
    kind: 'answered',
    answers: new Map([
      ['q1', { kind: 'text', text: 'Tuesday' }],
      ['q2', { kind: 'choice', id: 'yes' }],
      ['q3', { kind: 'none' }],
    ]),
  })
  expect(mcpPersonAsk.reply({ kind: 'declined' })).toEqual({ kind: 'declined' })
  expect(mcpPersonAsk.reply({ kind: 'no-answer' })).toEqual({ kind: 'no-answer' })
  expect(
    mcpPersonAsk.reply({ kind: 'answer', value: { answers: [{ cardId: 'q1', kind: 'odd' }] } }),
  ).toBeUndefined()
  expect(mcpPersonAsk.reply({ kind: 'answer', value: 'words' })).toBeUndefined()
})
