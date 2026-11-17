import { defineProtocol, ruleCodec, type Rule } from '@omne-harness/public-contract'

type Fields = Readonly<Record<string, { readonly rule: Rule; readonly optional?: true }>>

const text = { kind: 'text' } as const
const tenant = { kind: 'tenant' } as const
const date = { kind: 'plain-date' } as const
const count = { kind: 'count' } as const
const positive = { kind: 'positive-integer' } as const
const boolean = { kind: 'boolean' } as const
const nothing = { kind: 'null' } as const

const object = <const F extends Fields>(fields: F) => ({ kind: 'object', fields }) as const
const literal = <const V extends readonly string[]>(...values: V) =>
  ({ kind: 'literal', values }) as const
const nullable = <const R extends Rule>(rule: R) =>
  ({ kind: 'one-of', rules: [rule, nothing] }) as const
const array = <const R extends Rule>(item: R) => ({ kind: 'array', item }) as const
const oneOf = <const R extends readonly Rule[]>(...rules: R) => ({ kind: 'one-of', rules }) as const

const ofTenant = object({ tenant: { rule: tenant } })

/** One shipped calendar: its zone and the version that answers now. */
const calendarView = object({
  calendar: { rule: text },
  timezone: { rule: text },
  version: { rule: nullable(text) },
  coverageStart: { rule: nullable(date) },
  coverageEnd: { rule: nullable(date) },
})

/** What the tenant's settings select; the questions below are answered on it. */
const environment = object({
  calendar: { rule: text },
  timezone: { rule: text },
  revision: { rule: text },
  version: { rule: nullable(text) },
})

const question = oneOf(
  object({ kind: { rule: literal('day') }, date: { rule: date } }),
  object({ kind: { rule: literal('count') }, from: { rule: date }, to: { rule: date } }),
  object({
    kind: { rule: literal('shift') },
    date: { rule: date },
    direction: { rule: literal('forward', 'backward') },
    days: { rule: count },
  }),
  object({ kind: { rule: literal('next') }, after: { rule: date }, count: { rule: positive } }),
  object({
    kind: { rule: literal('nth') },
    periodStart: { rule: date },
    periodEnd: { rule: date },
    ordinal: { rule: oneOf(positive, literal('last')) },
  }),
)

const result = oneOf(
  object({
    kind: { rule: literal('day') },
    date: { rule: date },
    classification: { rule: literal('workingDay', 'holiday', 'nonWorkingDay') },
    working: { rule: boolean },
    adjusted: { rule: boolean },
  }),
  object({
    kind: { rule: literal('count') },
    from: { rule: date },
    to: { rule: date },
    count: { rule: count },
  }),
  object({ kind: { rule: literal('shift') }, date: { rule: date } }),
  object({ kind: { rule: literal('next') }, dates: { rule: array(date) } }),
  object({ kind: { rule: literal('nth') }, date: { rule: nullable(date) } }),
)

/** Every answer names the calendar, the version and the span it covered. */
const answer = object({
  calendar: { rule: text },
  version: { rule: text },
  coverageStart: { rule: date },
  coverageEnd: { rule: date },
  result: { rule: result },
})

const read = { identity: 'login', effect: 'read', limit: 'small', countsAsAccess: true } as const

export const calendarProtocol = defineProtocol({
  name: 'calendar',
  major: 1,
  operations: {
    'list-calendars': {
      ...read,
      body: ruleCodec(ofTenant),
      outcomes: { succeeded: ruleCodec(object({ calendars: { rule: array(calendarView) } })) },
    },
    'read-environment': {
      ...read,
      body: ruleCodec(ofTenant),
      outcomes: {
        succeeded: ruleCodec(environment),
        unsupported: ruleCodec(object({ reason: { rule: literal('environment') } })),
      },
    },
    answer: {
      ...read,
      body: ruleCodec(object({ tenant: { rule: tenant }, question: { rule: question } })),
      outcomes: {
        succeeded: ruleCodec(answer),
        invalid: ruleCodec(object({ reason: { rule: literal('input', 'timezone') } })),
        unsupported: ruleCodec(
          object({ reason: { rule: literal('coverage', 'search-limit', 'environment') } }),
        ),
      },
    },
  },
  observations: {},
})

export type CalendarProtocol = typeof calendarProtocol
