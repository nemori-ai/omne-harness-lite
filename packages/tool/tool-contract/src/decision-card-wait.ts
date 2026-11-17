import { createHash } from 'node:crypto'
import { defineSchema, jsonSchemaDefinition } from '@omne-harness/schema-provider'
import { describedAdoption } from './adoption.ts'
import type { ToolWaitContract } from './author-context.ts'
import type { ToolValueSchema } from './definitions.ts'
import {
  WAIT_REQUEST_MAX_BYTES,
  WAIT_RESPONSE_MAX_BYTES,
  defineToolWaitContract,
} from './wait-contract.ts'

export type DecisionCard = Readonly<{
  cardId: string
  kind: 'question' | 'approval'
  title: string
  description: string
  options: readonly Readonly<{ id: string; label: string; description: string }>[]
  declineConsequence: string
}>

export type DecisionCardRequest = Readonly<{ questions: readonly DecisionCard[] }>

export type DecisionCardAnswer = Readonly<{ cardId: string }> &
  (
    | Readonly<{ kind: 'selection'; optionId: string }>
    | Readonly<{ kind: 'text'; text: string }>
    | Readonly<{ kind: 'no-answer' }>
  )

export type DecisionCardAnswers = Readonly<{ answers: readonly DecisionCardAnswer[] }>

const CARD_LIMIT = 64
const OPTION_LIMIT = 64
const TITLE_MAX = 256
const TEXT_MAX = 4096
const REPLY_MAX = 8192

const text = (maxLength: number) => ({ type: 'string', minLength: 1, maxLength })
const id = text(TITLE_MAX)

const card = (kind: DecisionCard['kind'], minOptions: number) => ({
  type: 'object',
  additionalProperties: false,
  required: ['cardId', 'kind', 'title', 'description', 'options', 'declineConsequence'],
  properties: {
    cardId: id,
    kind: { const: kind },
    title: text(TITLE_MAX),
    description: text(TEXT_MAX),
    options: {
      type: 'array',
      minItems: minOptions,
      maxItems: OPTION_LIMIT,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'label', 'description'],
        properties: { id, label: text(TITLE_MAX), description: text(TEXT_MAX) },
      },
    },
    declineConsequence: text(TEXT_MAX),
  },
})

const answer = (kind: string, extra: Readonly<Record<string, object>>) => ({
  type: 'object',
  additionalProperties: false,
  required: ['cardId', 'kind', ...Object.keys(extra)],
  properties: { cardId: id, kind: { const: kind }, ...extra },
})

const documents = {
  request: {
    type: 'object',
    additionalProperties: false,
    required: ['questions'],
    properties: {
      questions: {
        type: 'array',
        minItems: 1,
        maxItems: CARD_LIMIT,
        items: { oneOf: [card('question', 1), card('approval', 0)] },
      },
    },
  },
  response: {
    type: 'object',
    additionalProperties: false,
    required: ['answers'],
    properties: {
      answers: {
        type: 'array',
        minItems: 1,
        maxItems: CARD_LIMIT,
        items: {
          oneOf: [
            answer('selection', { optionId: id }),
            answer('text', { text: text(REPLY_MAX) }),
            answer('no-answer', {}),
          ],
        },
      },
    },
  },
} as const

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (typeof value === 'object' && value !== null)
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(',')}}`
  return JSON.stringify(value)
}

function schema<T>(name: keyof typeof documents, maxBytes: number): ToolValueSchema<T> {
  const schemaId = `@omne-harness/tool-contract/decision-card-wait/${name}`
  const document = documents[name]
  const digest = createHash('sha256')
    .update(canonical({ id: schemaId, revision: '1', document }))
    .digest('hex')
  return {
    identity: { id: schemaId, revision: '1', digest: `sha256:${digest}` },
    maxBytes,
    ref: defineSchema<T>({
      id: schemaId,
      load: async () => jsonSchemaDefinition<T>({ document, numbers: 'exact-or-reject' }),
    }),
  }
}

export const decisionCardAdoption = describedAdoption({
  owner: '@omne-harness/tool-contract',
  name: 'decision-card-wait',
  revision: '1',
  changes:
    'A tool asks a person through decision cards: the request is the cards, the answer is one entry per card in card order.',
})

const defined = defineToolWaitContract<DecisionCardAnswers, 'ask'>({
  kind: 'ask',
  adoption: decisionCardAdoption,
  expiry: 'forbidden',
  request: schema<DecisionCardRequest>('request', WAIT_REQUEST_MAX_BYTES),
  response: schema<DecisionCardAnswers>('response', WAIT_RESPONSE_MAX_BYTES),
})
if ('failure' in defined) throw new TypeError(defined.failure.reason)

export const decisionCardWaitContract: ToolWaitContract<DecisionCardAnswers, 'ask'> = defined.ok
