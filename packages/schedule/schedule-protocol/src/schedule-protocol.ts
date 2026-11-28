import { defineProtocol, ruleCodec, type Rule } from '@omne-harness/public-contract'

type Fields = Readonly<Record<string, { readonly rule: Rule; readonly optional?: true }>>

const text = { kind: 'text' } as const
const tenant = { kind: 'tenant' } as const
const instant = { kind: 'instant' } as const
const date = { kind: 'plain-date' } as const
const count = { kind: 'count' } as const
const positive = { kind: 'positive-integer' } as const
const pageLimit = { kind: 'page-limit' } as const
const json = { kind: 'json' } as const
const boolean = { kind: 'boolean' } as const
const nothing = { kind: 'null' } as const

const object = <const F extends Fields>(fields: F) => ({ kind: 'object', fields }) as const
const literal = <const V extends readonly string[]>(...values: V) =>
  ({ kind: 'literal', values }) as const
const nullable = <const R extends Rule>(rule: R) =>
  ({ kind: 'one-of', rules: [rule, nothing] }) as const
const array = <const R extends Rule>(item: R) => ({ kind: 'array', item }) as const
const oneOf = <const R extends readonly Rule[]>(...rules: R) => ({ kind: 'one-of', rules }) as const

const control = literal(
  'draft',
  'active',
  'paused',
  'stopped',
  'exhausted',
  'discarded',
  'superseded',
)
const author = oneOf(
  object({ kind: { rule: literal('human') } }),
  object({ kind: { rule: literal('agent') }, session: { rule: text } }),
  object({ kind: { rule: literal('system') } }),
)

/** One upcoming time, and the calendar and version its working days came from. */
const upcoming = object({
  at: { rule: instant },
  local: { rule: text },
  calendar: { rule: nullable(text) },
  version: { rule: nullable(text) },
})

/** A schedule as a list shows it. */
const card = object({
  schedule: { rule: text },
  label: { rule: nullable(text) },
  control: { rule: control },
  standing: { rule: literal('ready', 'blocked', 'terminallyInvalidated') },
  author: { rule: author },
  next: { rule: nullable(upcoming) },
  revision: { rule: count },
})

const detail = object({
  ...card.fields,
  createdAt: { rule: instant },
  definition: { rule: json },
  /** Why it cannot run now, while its standing is not ready. */
  reasons: { rule: array(text), optional: true },
})

const revision = object({
  revision: { rule: count },
  action: { rule: text },
  actor: { rule: literal('human', 'agent', 'system') },
  at: { rule: instant },
})

const agendaItem = object({
  schedule: { rule: text },
  at: { rule: instant },
  local: { rule: text },
  kind: { rule: literal('prediction', 'history') },
})

const page = <const R extends Rule>(item: R) =>
  object({ items: { rule: array(item) }, next: { rule: nullable(text) } })

const ofTenant = { tenant: { rule: tenant } } as const

const create = object({
  ...ofTenant,
  createId: { rule: text },
  definition: { rule: json },
  state: { rule: literal('active', 'draft') },
  reason: { rule: nullable(text) },
})

const action = oneOf(
  object({ kind: { rule: literal('rename') }, label: { rule: text } }),
  object({ kind: { rule: literal('edit') }, instruction: { rule: json } }),
  object({
    kind: { rule: literal('revise', 'replace') },
    definition: { rule: json },
    reason: { rule: text },
  }),
  object({
    kind: { rule: literal('promote', 'pause', 'resume', 'stop', 'discard') },
    reason: { rule: nullable(text) },
  }),
)

const manage = object({
  ...ofTenant,
  actionId: { rule: text },
  schedule: { rule: text },
  revision: { rule: count },
  action: { rule: action },
})

const jobState = literal('accepted', 'waiting', 'startPending', 'running', 'blocked', 'concluded')

/** A Job as a history row shows it. */
const jobCard = object({
  job: { rule: text },
  state: { rule: jobState },
  outcome: { rule: nullable(literal('succeeded', 'failed', 'cancelled')) },
  stop: { rule: literal('none', 'requested', 'pending', 'confirmed', 'unknown') },
  origin: { rule: literal('due', 'catchUp', 'human', 'agent', 'system') },
  acceptedAt: { rule: instant },
  startedAt: { rule: nullable(instant) },
  endedAt: { rule: nullable(instant) },
  reason: { rule: nullable(text), optional: true },
})

/** One row of history: a disposed slot, a missed stretch, or a Job started outside any schedule. */
const historyRow = oneOf(
  object({
    kind: { rule: literal('slot') },
    row: { rule: text },
    schedule: { rule: text },
    at: { rule: instant },
    local: { rule: text },
    disposition: { rule: text },
    reason: { rule: text },
    job: { rule: nullable(jobCard) },
  }),
  object({
    kind: { rule: literal('lapse') },
    row: { rule: text },
    schedule: { rule: text },
    at: { rule: instant },
    through: { rule: instant },
    cause: { rule: text },
    reason: { rule: text },
    count: { rule: nullable(count) },
    selected: { rule: count },
  }),
  object({
    kind: { rule: literal('direct') },
    row: { rule: text },
    at: { rule: instant },
    job: { rule: jobCard },
  }),
)

/** One Job read in full: its fixed work, where it runs, why it stands where it is, and each step. */
const jobDetail = object({
  ...jobCard.fields,
  schedule: { rule: nullable(text) },
  slot: { rule: nullable(instant) },
  local: { rule: nullable(text) },
  calendar: { rule: nullable(text) },
  version: { rule: nullable(text) },
  revision: { rule: count },
  work: { rule: json },
  reason: { rule: nullable(text) },
  where: {
    rule: nullable(
      oneOf(
        object({
          kind: { rule: literal('program') },
          program: { rule: text },
          execution: { rule: text },
        }),
        object({
          kind: { rule: literal('session') },
          session: { rule: text },
          account: {
            rule: nullable(
              object({
                definition: {
                  rule: nullable(object({ name: { rule: text }, version: { rule: text } })),
                },
                outcome: { rule: nullable(text) },
                deliverables: { rule: array(text) },
                since: { rule: nullable(text) },
                run: { rule: nullable(text) },
              }),
            ),
          },
        }),
      ),
    ),
  },
  events: {
    rule: array(object({ seq: { rule: positive }, kind: { rule: text }, at: { rule: instant } })),
  },
})

const cancelJob = object({ ...ofTenant, actionId: { rule: text }, job: { rule: text } })
const startJob = object({ ...ofTenant, startId: { rule: text }, work: { rule: json } })

const refused = {
  invalid: ruleCodec(object({ code: { rule: text }, reason: { rule: text, optional: true } })),
  unsupported: ruleCodec(object({ code: { rule: text } })),
  conflict: ruleCodec(object({ code: { rule: text } })),
  limited: ruleCodec(object({})),
  'not-visible': ruleCodec(object({})),
} as const

const read = { identity: 'login', effect: 'read', limit: 'small', countsAsAccess: true } as const
const write = { identity: 'login', effect: 'commit', limit: 'small', countsAsAccess: true } as const

export const scheduleProtocol = defineProtocol({
  name: 'schedule',
  major: 3,
  operations: {
    'list-schedules': {
      ...read,
      body: ruleCodec(
        object({
          ...ofTenant,
          control: { rule: nullable(control) },
          terminal: { rule: boolean },
          cursor: { rule: nullable(text) },
          limit: { rule: pageLimit },
        }),
      ),
      outcomes: { succeeded: ruleCodec(page(card)), invalid: refused.invalid },
    },
    'read-schedule': {
      ...read,
      body: ruleCodec(object({ ...ofTenant, schedule: { rule: text } })),
      outcomes: { succeeded: ruleCodec(detail), 'not-visible': refused['not-visible'] },
    },
    'read-revisions': {
      ...read,
      body: ruleCodec(
        object({
          ...ofTenant,
          schedule: { rule: text },
          cursor: { rule: nullable(text) },
          limit: { rule: pageLimit },
        }),
      ),
      outcomes: { succeeded: ruleCodec(page(revision)), 'not-visible': refused['not-visible'] },
    },
    'read-agenda': {
      ...read,
      body: ruleCodec(
        object({
          ...ofTenant,
          from: { rule: date },
          to: { rule: date },
          timezone: { rule: text },
          cursor: { rule: nullable(text) },
        }),
      ),
      outcomes: {
        succeeded: ruleCodec(page(agendaItem)),
        invalid: refused.invalid,
        unsupported: refused.unsupported,
      },
    },
    preview: {
      ...read,
      body: ruleCodec(
        object({
          ...ofTenant,
          source: {
            rule: oneOf(
              object({ kind: { rule: literal('schedule') }, schedule: { rule: text } }),
              object({ kind: { rule: literal('definition') }, definition: { rule: json } }),
            ),
          },
          count: { rule: positive },
        }),
      ),
      outcomes: {
        succeeded: ruleCodec(
          object({ upcoming: { rule: array(upcoming) }, complete: { rule: boolean } }),
        ),
        invalid: refused.invalid,
        unsupported: refused.unsupported,
        'not-visible': refused['not-visible'],
      },
    },
    'create-schedule': {
      ...write,
      body: ruleCodec(create),
      outcomes: {
        succeeded: ruleCodec(detail),
        invalid: refused.invalid,
        unsupported: refused.unsupported,
        conflict: refused.conflict,
        limited: refused.limited,
      },
    },
    'query-create-schedule': {
      ...read,
      body: ruleCodec(create),
      outcomes: { succeeded: ruleCodec(detail), 'not-committed': ruleCodec(object({})) },
    },
    'manage-schedule': {
      ...write,
      body: ruleCodec(manage),
      outcomes: {
        succeeded: ruleCodec(detail),
        invalid: refused.invalid,
        unsupported: refused.unsupported,
        conflict: refused.conflict,
        limited: refused.limited,
        'not-visible': refused['not-visible'],
      },
    },
    'query-manage-schedule': {
      ...read,
      body: ruleCodec(manage),
      outcomes: {
        succeeded: ruleCodec(detail),
        'not-committed': ruleCodec(object({})),
        'not-visible': refused['not-visible'],
      },
    },
    'list-jobs': {
      ...read,
      body: ruleCodec(
        object({
          ...ofTenant,
          schedule: { rule: nullable(text) },
          cursor: { rule: nullable(text) },
          limit: { rule: pageLimit },
        }),
      ),
      outcomes: {
        succeeded: ruleCodec(page(historyRow)),
        invalid: refused.invalid,
        'not-visible': refused['not-visible'],
      },
    },
    'read-job': {
      ...read,
      body: ruleCodec(object({ ...ofTenant, job: { rule: text } })),
      outcomes: { succeeded: ruleCodec(jobDetail), 'not-visible': refused['not-visible'] },
    },
    'read-session-jobs': {
      ...read,
      body: ruleCodec(object({ ...ofTenant, session: { rule: text } })),
      outcomes: { succeeded: ruleCodec(object({ items: { rule: array(jobDetail) } })) },
    },
    'cancel-job': {
      ...write,
      body: ruleCodec(cancelJob),
      outcomes: {
        succeeded: ruleCodec(object({ changed: { rule: boolean }, job: { rule: jobDetail } })),
        'not-visible': refused['not-visible'],
      },
    },
    'query-cancel-job': {
      ...read,
      body: ruleCodec(cancelJob),
      outcomes: {
        succeeded: ruleCodec(jobDetail),
        'not-committed': ruleCodec(object({})),
        'not-visible': refused['not-visible'],
      },
    },
    'start-job': {
      ...write,
      body: ruleCodec(startJob),
      outcomes: {
        succeeded: ruleCodec(jobDetail),
        invalid: refused.invalid,
        conflict: refused.conflict,
      },
    },
    'query-start-job': {
      ...read,
      body: ruleCodec(startJob),
      outcomes: {
        succeeded: ruleCodec(jobDetail),
        'not-committed': ruleCodec(object({})),
        conflict: refused.conflict,
      },
    },
  },
  observations: {
    'observe-jobs': {
      identity: 'login',
      open: ruleCodec(object({ ...ofTenant })),
      frame: ruleCodec(object({ kind: { rule: literal('changed') } })),
      ends: [],
    },
  },
})

export type ScheduleProtocol = typeof scheduleProtocol
