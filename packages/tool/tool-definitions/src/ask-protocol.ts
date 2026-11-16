import { writeJsonText } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { defineSchema, jsonSchemaDefinition } from '@omne-harness/schema-provider'
import { canonicalDigest } from '@omne-harness/tool'
import type { ParameterContract } from '@omne-harness/tool-contract'
import {
  createDefaultParameterCodec,
  defineToolWaitContract,
  describedAdoption,
  type ParameterCodec,
  type ToolValueSchema,
} from '@omne-harness/tool-contract/provider'
import { tree } from './protocol.ts'

export const askAdoption = describedAdoption({
  owner: '@omne-harness/tool-definitions',
  name: 'ask-protocol',
  revision: '1',
  changes:
    'ask and request_approval. One batch of cards per call, a fixed decline consequence per card, answers in card order.',
})

export const askCommandNames = ['ask', 'request_approval'] as const
export type AskCommand = (typeof askCommandNames)[number]

export type AskOptionInput = Readonly<{ label: string; description: string; diagram?: string }>
export type AskQuestionInput = Readonly<{
  title: string
  description: string
  options: readonly AskOptionInput[]
}>
export type AskApprovalInput = Readonly<{
  action: string
  reason: string
  impact: string
  reversibility: string
  fallback: string
}>
export type AskArguments =
  | Readonly<{ command: 'ask'; questions: readonly AskQuestionInput[] }>
  | (Readonly<{ command: 'request_approval' }> & AskApprovalInput)

export type AskCard = Readonly<{
  cardId: string
  kind: 'question' | 'approval'
  title: string
  description: string
  options: readonly Readonly<{ id: string; label: string; description: string }>[]
  declineConsequence: string
}>
export type AskWaitRequest = Readonly<{ questions: readonly AskCard[] }>
export type AskResponse = Readonly<{
  answers: readonly (Readonly<{ cardId: string }> &
    (
      | Readonly<{ kind: 'selection'; optionId: string }>
      | Readonly<{ kind: 'text'; text: string }>
      | Readonly<{ kind: 'no-answer' }>
    ))[]
}>
export type AskState = Readonly<{
  command: AskCommand
  questions: readonly Readonly<{
    cardId: string
    title: string
    options: readonly Readonly<{ id: string; label: string }>[]
  }>[]
}>

const CARD_LIMIT = 7
const OPTION_MIN = 2
const OPTION_LIMIT = 4
const TITLE_MAX = 256
const TEXT_MAX = 4096
const REPLY_MAX = 8192
const APPROVAL_FIELD_MAX = 1000
export const ASK_REQUEST_MAX_BYTES = 196_608
export const ASK_STATE_MAX_BYTES = ASK_REQUEST_MAX_BYTES
export const ASK_RESPONSE_MAX_BYTES = 393_216

const QUESTION_DECLINE = '跳过此题，不作答'
const APPROVAL_DECLINE = '不作准驳，这个动作不会执行'
const APPROVAL_OPTIONS = [
  { id: 'approve', label: '同意', description: '同意执行这个动作。' },
  { id: 'reject', label: '不同意', description: '不同意，这个动作不会执行。' },
] as const

const encoder = new TextEncoder()

function codePoints(value: string): number {
  return [...value].length
}
function validText(value: string, max: number): boolean {
  return value.isWellFormed() && value.trim().length > 0 && codePoints(value) <= max
}
const invalidField = (path: string) => `invalid-field:${path}`

function questionCard(
  question: AskQuestionInput,
  at: string,
  index: number,
): Outcome<AskCard, string> {
  if (!validText(question.title, TITLE_MAX)) return fail(invalidField(`${at}.title`))
  if (!validText(question.description, TEXT_MAX)) return fail(invalidField(`${at}.description`))
  if (question.options.length < OPTION_MIN || question.options.length > OPTION_LIMIT)
    return fail(invalidField(`${at}.options`))
  const labels = new Set<string>()
  const options: AskCard['options'][number][] = []
  for (const [position, option] of question.options.entries()) {
    const where = `${at}.options[${position}]`
    if (!validText(option.label, TITLE_MAX) || labels.has(option.label))
      return fail(invalidField(`${where}.label`))
    labels.add(option.label)
    if (!validText(option.description, TEXT_MAX)) return fail(invalidField(`${where}.description`))
    const description =
      option.diagram === undefined
        ? option.description
        : `${option.description}\n\n${option.diagram}`
    if (
      option.diagram !== undefined &&
      (!validText(option.diagram, TEXT_MAX) || codePoints(description) > TEXT_MAX)
    )
      return fail(invalidField(`${where}.diagram`))
    options.push({ id: `o${position + 1}`, label: option.label, description })
  }
  return succeed({
    cardId: `q${index + 1}`,
    kind: 'question',
    title: question.title,
    description: question.description,
    options,
    declineConsequence: QUESTION_DECLINE,
  })
}

function approvalCard(input: AskApprovalInput): Outcome<AskCard, string> {
  if (!validText(input.action, TITLE_MAX)) return fail(invalidField('action'))
  for (const field of ['reason', 'impact', 'reversibility', 'fallback'] as const)
    if (!validText(input[field], APPROVAL_FIELD_MAX)) return fail(invalidField(field))
  return succeed({
    cardId: 'approval',
    kind: 'approval',
    title: input.action,
    description: [
      `原因：${input.reason}`,
      `影响：${input.impact}`,
      `可逆性：${input.reversibility}`,
      `不同意时的退路：${input.fallback}`,
    ].join('\n'),
    options: APPROVAL_OPTIONS,
    declineConsequence: APPROVAL_DECLINE,
  })
}

export function askCards(args: AskArguments): Outcome<readonly AskCard[], string> {
  let cards: AskCard[]
  if (args.command === 'request_approval') {
    const card = approvalCard(args)
    if ('failure' in card) return card
    cards = [card.ok]
  } else {
    if (args.questions.length === 0 || args.questions.length > CARD_LIMIT)
      return fail(invalidField('questions'))
    cards = []
    for (const [index, question] of args.questions.entries()) {
      const card = questionCard(question, `questions[${index}]`, index)
      if ('failure' in card) return card
      cards.push(card.ok)
    }
  }
  const request: AskWaitRequest = { questions: cards }
  return encoder.encode(JSON.stringify(request)).byteLength > ASK_REQUEST_MAX_BYTES
    ? fail('request-too-large')
    : succeed(cards)
}

export function askState(command: AskCommand, cards: readonly AskCard[]): AskState {
  return {
    command,
    questions: cards.map(card => ({
      cardId: card.cardId,
      title: card.title,
      options: card.options.map(option => ({ id: option.id, label: option.label })),
    })),
  }
}

type Shape<T> = Outcome<T, string>

function closedObject(
  value: unknown,
  at: string,
  fields: Readonly<Record<string, 'required' | 'optional'>>,
): Shape<Readonly<Record<string, unknown>>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return fail(invalidField(at === '' ? 'params' : at))
  const record = value as Readonly<Record<string, unknown>>
  const path = (key: string) => (at === '' ? key : `${at}.${key}`)
  const extra = Object.keys(record).find(key => !Object.hasOwn(fields, key))
  if (extra !== undefined) return fail(invalidField(path(extra)))
  for (const [key, presence] of Object.entries(fields)) {
    const field = record[key]
    if (field === undefined ? presence === 'required' : !isFieldValue(key, field))
      return fail(invalidField(path(key)))
  }
  return succeed(record)
}
function isFieldValue(key: string, value: unknown): boolean {
  return key === 'questions' || key === 'options' ? Array.isArray(value) : typeof value === 'string'
}

function shapeOfOption(value: unknown, at: string): Shape<AskOptionInput> {
  const fields = closedObject(value, at, {
    label: 'required',
    description: 'required',
    diagram: 'optional',
  })
  if ('failure' in fields) return fields
  const { label, description, diagram } = fields.ok
  return succeed({
    label: label as string,
    description: description as string,
    ...(diagram === undefined ? {} : { diagram: diagram as string }),
  })
}
function shapeOfQuestion(value: unknown, at: string): Shape<AskQuestionInput> {
  const fields = closedObject(value, at, {
    title: 'required',
    description: 'required',
    options: 'required',
  })
  if ('failure' in fields) return fields
  const options: AskOptionInput[] = []
  for (const [index, item] of (fields.ok['options'] as unknown[]).entries()) {
    const option = shapeOfOption(item, `${at}.options[${index}]`)
    if ('failure' in option) return option
    options.push(option.ok)
  }
  return succeed({
    title: fields.ok['title'] as string,
    description: fields.ok['description'] as string,
    options,
  })
}
function shapeOf(command: AskCommand, value: unknown): Shape<AskArguments> {
  if (command === 'request_approval') {
    const fields = closedObject(value, '', {
      action: 'required',
      reason: 'required',
      impact: 'required',
      reversibility: 'required',
      fallback: 'required',
    })
    if ('failure' in fields) return fields
    return succeed({ command, ...(fields.ok as AskApprovalInput) })
  }
  const fields = closedObject(value, '', { questions: 'required' })
  if ('failure' in fields) return fields
  const questions: AskQuestionInput[] = []
  for (const [index, item] of (fields.ok['questions'] as unknown[]).entries()) {
    const question = shapeOfQuestion(item, `questions[${index}]`)
    if ('failure' in question) return question
    questions.push(question.ok)
  }
  return succeed({ command, questions })
}

const json = createDefaultParameterCodec({
  maxBytes: ASK_REQUEST_MAX_BYTES,
  maxDepth: 8,
  maxItems: 32_768,
  maxMembers: 16,
  maxStringLength: 2 * TEXT_MAX,
  maxNumberLength: 32,
})
if ('failure' in json) throw new TypeError(json.failure.reason)
const jsonCodec = json.ok

export function askParameterCodec(command: AskCommand): ParameterCodec<AskArguments> {
  return {
    adoption: askAdoption,
    parse(input) {
      const read = jsonCodec.parse(input)
      if ('failure' in read) return read
      const args = shapeOf(command, JSON.parse(writeJsonText(read.ok)))
      if ('failure' in args) return fail({ kind: 'invalid', reason: args.failure })
      const cards = askCards(args.ok)
      return 'failure' in cards ? fail({ kind: 'invalid', reason: cards.failure }) : args
    },
  }
}

const textSchema = (max: number) => ({ type: 'string', minLength: 1, maxLength: max })
const parameterSchemas: Record<AskCommand, object> = {
  ask: {
    type: 'object',
    additionalProperties: false,
    required: ['questions'],
    properties: {
      questions: {
        type: 'array',
        minItems: 1,
        maxItems: CARD_LIMIT,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'description', 'options'],
          properties: {
            title: textSchema(TITLE_MAX),
            description: textSchema(TEXT_MAX),
            options: {
              type: 'array',
              minItems: OPTION_MIN,
              maxItems: OPTION_LIMIT,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['label', 'description'],
                properties: {
                  label: textSchema(TITLE_MAX),
                  description: textSchema(TEXT_MAX),
                  diagram: textSchema(TEXT_MAX),
                },
              },
            },
          },
        },
      },
    },
  },
  request_approval: {
    type: 'object',
    additionalProperties: false,
    required: ['action', 'reason', 'impact', 'reversibility', 'fallback'],
    properties: {
      action: textSchema(TITLE_MAX),
      reason: textSchema(APPROVAL_FIELD_MAX),
      impact: textSchema(APPROVAL_FIELD_MAX),
      reversibility: textSchema(APPROVAL_FIELD_MAX),
      fallback: textSchema(APPROVAL_FIELD_MAX),
    },
  },
}
const parameterDescriptions: Record<AskCommand, ParameterContract['descriptions']> = {
  ask: [
    {
      path: 'questions',
      text: 'All questions that you need now, from 1 to 7. Each question becomes one card.',
    },
    {
      path: 'questions[].title',
      text: 'The complete question, at most 256 characters. It must make sense without the conversation.',
    },
    {
      path: 'questions[].description',
      text: 'What you need to know, why, and what each choice changes, at most 4096 characters.',
    },
    {
      path: 'questions[].options',
      text: 'From 2 to 4 options. Labels must be different in one question. Put a recommended option first.',
    },
    {
      path: 'questions[].options[].label',
      text: 'A short label. Add "(Recommended)" to the one that you recommend.',
    },
    {
      path: 'questions[].options[].diagram',
      text: 'Optional text diagram that helps to compare options. It cannot replace the option text. The description and the diagram together are at most 4096 characters.',
    },
  ],
  request_approval: [
    { path: 'action', text: 'The action and its object, at most 256 characters.' },
    { path: 'reason', text: 'Why the action is necessary.' },
    { path: 'impact', text: 'What the action changes.' },
    { path: 'reversibility', text: 'Whether and how the change can be reversed.' },
    { path: 'fallback', text: 'What you do if the person does not approve.' },
  ],
}
const commandSummaries: Record<AskCommand, string> = {
  ask: 'Ask the person 1 to 7 questions and wait for the answers.',
  request_approval: 'Ask the person to approve one action before you do it.',
}

export type AskCommandEntry = Readonly<{
  name: AskCommand
  summary: string
  parameters: ParameterContract
  codec: ParameterCodec<AskArguments>
}>

export function askCommand(name: AskCommand): AskCommandEntry {
  return {
    name,
    summary: commandSummaries[name],
    parameters: {
      vocabulary: askAdoption,
      schema: tree(parameterSchemas[name]),
      descriptions: parameterDescriptions[name],
    },
    codec: askParameterCodec(name),
  }
}

const idSchema = textSchema(TITLE_MAX)
const cardSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['cardId', 'kind', 'title', 'description', 'options', 'declineConsequence'],
  properties: {
    cardId: idSchema,
    kind: { enum: ['question', 'approval'] },
    title: textSchema(TITLE_MAX),
    description: textSchema(TEXT_MAX),
    options: {
      type: 'array',
      minItems: OPTION_MIN,
      maxItems: OPTION_LIMIT,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'label', 'description'],
        properties: {
          id: idSchema,
          label: textSchema(TITLE_MAX),
          description: textSchema(TEXT_MAX),
        },
      },
    },
    declineConsequence: textSchema(TEXT_MAX),
  },
}
const answer = (kind: string, extra: Readonly<Record<string, object>>) => ({
  type: 'object',
  additionalProperties: false,
  required: ['cardId', 'kind', ...Object.keys(extra)],
  properties: { cardId: idSchema, kind: { const: kind }, ...extra },
})
const documents = {
  request: {
    type: 'object',
    additionalProperties: false,
    required: ['questions'],
    properties: {
      questions: { type: 'array', minItems: 1, maxItems: CARD_LIMIT, items: cardSchema },
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
            answer('selection', { optionId: idSchema }),
            answer('text', { text: textSchema(REPLY_MAX) }),
            answer('no-answer', {}),
          ],
        },
      },
    },
  },
  state: {
    type: 'object',
    additionalProperties: false,
    required: ['command', 'questions'],
    properties: {
      command: { enum: [...askCommandNames] },
      questions: {
        type: 'array',
        minItems: 1,
        maxItems: CARD_LIMIT,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['cardId', 'title', 'options'],
          properties: {
            cardId: idSchema,
            title: textSchema(TITLE_MAX),
            options: {
              type: 'array',
              minItems: OPTION_MIN,
              maxItems: OPTION_LIMIT,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'label'],
                properties: { id: idSchema, label: textSchema(TITLE_MAX) },
              },
            },
          },
        },
      },
    },
  },
} as const

function valueSchema<T>(name: keyof typeof documents, maxBytes: number): ToolValueSchema<T> {
  const id = `@omne-harness/tool-definitions/ask/${name}`
  const document = documents[name]
  return {
    identity: { id, revision: '1', digest: canonicalDigest({ id, revision: '1', document }) },
    maxBytes,
    ref: defineSchema<T>({
      id,
      load: async () => jsonSchemaDefinition<T>({ document, numbers: 'exact-or-reject' }),
    }),
  }
}

const wait = defineToolWaitContract<AskResponse, 'ask'>({
  kind: 'ask',
  adoption: askAdoption,
  expiry: 'forbidden',
  request: valueSchema<AskWaitRequest>('request', ASK_REQUEST_MAX_BYTES),
  response: valueSchema<AskResponse>('response', ASK_RESPONSE_MAX_BYTES),
})
if ('failure' in wait) throw new TypeError(wait.failure.reason)
export const askWaitContract = wait.ok

export const askStateSchema = valueSchema<AskState>('state', ASK_STATE_MAX_BYTES)
export const askStateAdoption = describedAdoption({
  owner: '@omne-harness/tool-definitions',
  name: 'ask-state-json',
  revision: '1',
  changes: 'The Ask state as UTF-8 JSON text.',
})
