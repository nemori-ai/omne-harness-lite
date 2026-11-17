import { z } from 'zod'
import { calendarQuerySchema, type CalendarQuestion } from '@omne-harness/calendar-contract'
import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ParameterContract } from '@omne-harness/tool-contract'
import {
  createDefaultParameterCodec,
  describedAdoption,
  type ParameterCodec,
} from '@omne-harness/tool-contract/provider'

export const calendarAdoption = describedAdoption({
  owner: '@omne-harness/calendar-tools',
  name: 'calendar-protocol',
  revision: '2',
  changes:
    'One declaration with the command named in the call; date questions only, on the caller effective calendar.',
})
const vocabulary = describedAdoption({
  owner: '@omne-harness/calendar-tools',
  name: 'json-schema',
  revision: '2020-12',
  dialect: 'https://json-schema.org/draft/2020-12/schema',
})
const limits = {
  maxBytes: 65_536,
  maxDepth: 8,
  maxItems: 64,
  maxMembers: 16,
  maxStringLength: 1024,
  maxNumberLength: 32,
}

export function tree(value: unknown): JsonValue {
  const read = readJsonText(JSON.stringify(value), limits)
  if (read.kind !== 'ok') throw new TypeError('Calendar protocol JSON is not bounded')
  return read.value
}

export const calendarCommandNames = ['help', 'day', 'count', 'shift', 'next', 'nth'] as const
export type CalendarCommandName = (typeof calendarCommandNames)[number]
export type CalendarArguments =
  | Readonly<{ kind: 'help'; name?: string }>
  | Readonly<{ kind: 'question'; question: CalendarQuestion }>

const DATE = 'A date as YYYY-MM-DD, read in the user time zone.'
const date = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }
const integer = { type: 'integer' }

type Command = Readonly<{
  name: CalendarCommandName
  summary: string
  properties: Readonly<Record<string, unknown>>
  required: readonly string[]
  descriptions: Readonly<Record<string, string>>
  question: (params: Record<string, unknown>) => unknown
}>

export const calendarCommands: readonly Command[] = [
  {
    name: 'help',
    summary: 'Read command usage.',
    properties: { name: { type: 'string', enum: calendarCommandNames } },
    required: [],
    descriptions: { name: 'Command name. Omit for the complete menu.' },
    question: () => null,
  },
  {
    name: 'day',
    summary: 'Whether one date is a working day, a public holiday or a rest day, and why.',
    properties: { date },
    required: ['date'],
    descriptions: { date: DATE },
    question: params => ({ kind: 'day', date: params['date'] }),
  },
  {
    name: 'count',
    summary: 'How many working days lie between two dates, both included.',
    properties: { from: date, to: date },
    required: ['from', 'to'],
    descriptions: { from: `First date. ${DATE}`, to: `Last date, not before from. ${DATE}` },
    question: params => ({ kind: 'count', from: params['from'], to: params['to'] }),
  },
  {
    name: 'shift',
    summary: 'The working day a number of working days before or after a date.',
    properties: { date, offset: integer },
    required: ['date', 'offset'],
    descriptions: {
      date: DATE,
      offset: 'Working days to move: positive is later, negative is earlier.',
    },
    question: params => ({ kind: 'shift', date: params['date'], offset: params['offset'] }),
  },
  {
    name: 'next',
    summary: 'The working days after a date, at most 366 of them.',
    properties: { after: date, count: { type: 'integer', minimum: 1, maximum: 366 } },
    required: ['after', 'count'],
    descriptions: { after: `The day before the first one listed. ${DATE}`, count: '1 to 366.' },
    question: params => ({ kind: 'next', after: params['after'], count: params['count'] }),
  },
  {
    name: 'nth',
    summary: 'The n-th or the last working day within a period.',
    properties: {
      period_start: date,
      period_end: date,
      ordinal: { oneOf: [{ type: 'integer', minimum: 1 }, { const: 'last' }] },
    },
    required: ['period_start', 'period_end', 'ordinal'],
    descriptions: {
      period_start: `First day of the period. ${DATE}`,
      period_end: `Last day of the period. ${DATE}`,
      ordinal: 'A positive number, or "last".',
    },
    question: params => ({
      kind: 'nth',
      periodStart: params['period_start'],
      periodEnd: params['period_end'],
      ordinal: params['ordinal'],
    }),
  },
]

function commandNamed(name: CalendarCommandName): Command {
  const command = calendarCommands.find(candidate => candidate.name === name)
  if (command === undefined) throw new TypeError(`Calendar has no command ${name}`)
  return command
}

export function calendarContract(name: CalendarCommandName): ParameterContract {
  const command = commandNamed(name)
  return {
    schema: tree({
      type: 'object',
      additionalProperties: false,
      properties: command.properties,
      required: command.required,
    }),
    vocabulary,
    descriptions: Object.entries(command.descriptions).map(([path, text]) => ({ path, text })),
  }
}

const strictJson = createDefaultParameterCodec(limits)

/** Parses one command's params: unknown fields, missing fields and malformed dates are invalid. */
export function calendarParameterCodec(
  name: CalendarCommandName,
): ParameterCodec<CalendarArguments> {
  if ('failure' in strictJson) throw new TypeError(strictJson.failure.reason)
  const base = strictJson.ok
  const command = commandNamed(name)
  const shape = z.strictObject(
    Object.fromEntries(
      Object.keys(command.properties).map(key => [
        key,
        command.required.includes(key) ? z.unknown() : z.unknown().optional(),
      ]),
    ),
  )
  return {
    adoption: calendarAdoption,
    parse(input) {
      const read = base.parse(input)
      if ('failure' in read) return read
      const params = shape.safeParse(JSON.parse(writeJsonText(read.ok)))
      if (!params.success) return fail({ kind: 'invalid', reason: params.error.message })
      const missing = command.required.find(key => params.data[key] === undefined)
      if (missing !== undefined)
        return fail({ kind: 'invalid', reason: `missing-field:${missing}` })
      if (name === 'help') {
        const asked = params.data['name']
        if (asked === undefined) return succeed({ kind: 'help' })
        return typeof asked === 'string' &&
          (calendarCommandNames as readonly string[]).includes(asked)
          ? succeed({ kind: 'help', name: asked })
          : fail({ kind: 'invalid', reason: 'invalid-field:name' })
      }
      const question = calendarQuerySchema.safeParse(command.question(params.data))
      return question.success
        ? succeed({ kind: 'question', question: question.data })
        : fail({ kind: 'invalid', reason: question.error.issues[0]?.message ?? 'invalid' })
    },
  }
}
