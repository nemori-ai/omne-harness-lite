import { z } from 'zod'
import { DecisionQuestionSchema, HitlIdentifierSchema, HitlTextSchema } from './values.ts'

export const DECISION_CARD_LIMIT = 64

export const DecisionRequestSchema = z
  .strictObject({
    questions: z.array(DecisionQuestionSchema).min(1).max(DECISION_CARD_LIMIT).readonly(),
  })
  .readonly()
const answerOf = <S extends z.ZodRawShape>(shape: S) =>
  z.strictObject({ cardId: HitlIdentifierSchema, ...shape })
export const DecisionAnswerSchema = z
  .discriminatedUnion('kind', [
    answerOf({ kind: z.literal('selection'), optionId: HitlIdentifierSchema }),
    answerOf({ kind: z.literal('text'), text: HitlTextSchema }),
    answerOf({ kind: z.literal('no-answer') }),
  ])
  .readonly()
export const DecisionResponseSchema = z
  .strictObject({
    answers: z.array(DecisionAnswerSchema).min(1).max(DECISION_CARD_LIMIT).readonly(),
  })
  .readonly()

export type DecisionRequest = z.infer<typeof DecisionRequestSchema>
export type DecisionAnswer = z.infer<typeof DecisionAnswerSchema>
export type DecisionResponse = z.infer<typeof DecisionResponseSchema>

const textOf = (maxLength: number) => ({ type: 'string', minLength: 1, maxLength }) as const
const identifier = textOf(256)
const optionDocument = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'label', 'description'],
  properties: { id: identifier, label: textOf(256), description: textOf(4096) },
} as const
const cardDocument = <K extends string>(kind: K) =>
  ({
    type: 'object',
    additionalProperties: false,
    required: ['cardId', 'kind', 'title', 'description', 'options', 'declineConsequence'],
    properties: {
      cardId: identifier,
      kind: { const: kind },
      title: textOf(256),
      description: textOf(4096),
      options: { type: 'array', minItems: 1, maxItems: 64, items: optionDocument },
      declineConsequence: textOf(4096),
    },
  }) as const
const answerDocument = <K extends string, P extends object>(kind: K, extra: P) =>
  ({
    type: 'object',
    additionalProperties: false,
    required: ['cardId', 'kind', ...Object.keys(extra)],
    properties: { cardId: identifier, kind: { const: kind }, ...extra },
  }) as const

/** The decision request as JSON Schema, for holders that validate bytes before they decode. */
export const decisionRequestDocument = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      minItems: 1,
      maxItems: DECISION_CARD_LIMIT,
      items: cardDocument('question'),
    },
  },
} as const

/** The decision response as JSON Schema. */
export const decisionResponseDocument = {
  type: 'object',
  additionalProperties: false,
  required: ['answers'],
  properties: {
    answers: {
      type: 'array',
      minItems: 1,
      maxItems: DECISION_CARD_LIMIT,
      items: {
        oneOf: [
          answerDocument('selection', { optionId: identifier }),
          answerDocument('text', { text: textOf(8192) }),
          answerDocument('no-answer', {}),
        ],
      },
    },
  },
} as const
