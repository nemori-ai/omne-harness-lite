import { defineProtocol, ruleCodec, type Rule, type RuleValue } from '@omne-harness/public-contract'

type Fields = Readonly<Record<string, { readonly rule: Rule; readonly optional?: true }>>

const text = { kind: 'text' } as const
const words = { kind: 'string' } as const
const tenant = { kind: 'tenant' } as const
const session = { kind: 'session' } as const
const nothing = { kind: 'null' } as const
const json = { kind: 'json' } as const
const flag = { kind: 'boolean' } as const
const count = { kind: 'count' } as const
const number = { kind: 'positive-integer' } as const

const object = <const F extends Fields>(fields: F) => ({ kind: 'object', fields }) as const
const literal = <const V extends readonly string[]>(...values: V) =>
  ({ kind: 'literal', values }) as const
const nullable = <const R extends Rule>(rule: R) =>
  ({ kind: 'one-of', rules: [rule, nothing] }) as const
const list = <const R extends Rule>(item: R) => ({ kind: 'array', item }) as const

const empty = ruleCodec(object({}))

const pause = object({
  by: { rule: literal('person', 'verdict') },
  row: { rule: number, optional: true },
  exit: { rule: nullable(text), optional: true },
})
const outcome = object({
  kind: {
    rule: literal(
      'achieved',
      'exit',
      'unattainable',
      'stalled',
      'judge-unavailable',
      'aborted',
      'cancelled',
    ),
  },
  exit: { rule: text, optional: true },
  counts: { rule: literal('success', 'failure'), optional: true },
})
const state = object({
  status: { rule: literal('active', 'paused', 'settled') },
  attendance: { rule: literal('attended', 'unattended') },
  generation: { rule: number },
  revision: { rule: number },
  rounds: { rule: count },
  pause: { rule: nullable(pause) },
  outcome: { rule: nullable(outcome) },
})
const gapRow = object({
  id: { rule: text },
  ought: { rule: words },
  reading: { rule: words },
  source: { rule: nullable(literal('system', 'judge', 'agent')) },
  ref: { rule: nullable(text) },
  open: { rule: flag },
  short: { rule: nullable(words) },
  verification: { rule: text, optional: true, since: 2 },
  reader: { rule: text, optional: true, since: 2 },
  value: { rule: text, optional: true, since: 3 },
})
const provenance = object({
  revision: { rule: number },
  via: { rule: literal('card', 'direct') },
  words: { rule: nullable(words) },
  draftedBy: { rule: literal('agent', 'person', 'creator') },
  confirmedBy: { rule: text },
  operation: { rule: text },
  at: { rule: text },
})
/** One goal as a person reads it. `body` and `progress` are the domain's own data, carried whole; the rest is laid out for the panel. */
const goal = object({
  state: { rule: state },
  rendered: { rule: text },
  body: { rule: json },
  gap: { rule: list(gapRow) },
  progress: { rule: json },
  history: { rule: list(provenance) },
  examiner: { rule: session, optional: true, since: 3 },
})

const where = { tenant: { rule: tenant }, session: { rule: session } } as const
const proposal = {
  kind: 'one-of',
  rules: [
    object({ kind: { rule: literal('set') }, draft: { rule: json } }),
    object({ kind: { rule: literal('revise') }, changes: { rule: json } }),
  ],
} as const
const write = object({
  ...where,
  operation: { rule: text },
  proposal: { rule: proposal },
  words: { rule: nullable(words) },
})
const command = {
  kind: 'one-of',
  rules: [
    object({ kind: { rule: literal('pause', 'resume', 'cancel') } }),
    object({ kind: { rule: literal('settle-by-exit') }, exit: { rule: text } }),
  ],
} as const
const issue = object({
  entry: { rule: nullable(text) },
  field: { rule: text },
  problem: { rule: text },
})
const refused = ruleCodec(
  object({
    reason: {
      rule: literal(
        'no-live-goal',
        'goal-in-progress',
        'nobody-attends',
        'attended',
        'not-its-cause',
        'another-goal',
      ),
    },
  }),
)
const one = ruleCodec(object({ goal: { rule: goal } }))

export const goalProtocol = defineProtocol({
  name: 'goal',
  major: 1,
  operations: {
    'read-goal': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(object(where)),
      outcomes: {
        succeeded: ruleCodec(object({ goal: { rule: nullable(goal) } })),
        'not-found': empty,
      },
    },
    'write-goal': {
      identity: 'login',
      effect: 'commit',
      limit: 'input',
      body: ruleCodec(write),
      outcomes: {
        succeeded: one,
        invalid: ruleCodec(object({ issues: { rule: list(issue) } })),
        conflict: refused,
        'not-found': empty,
      },
    },
    'query-write-goal': {
      identity: 'login',
      effect: 'read',
      limit: 'input',
      body: ruleCodec(write),
      outcomes: { succeeded: one, 'not-committed': empty, 'not-found': empty },
    },
    'command-goal': {
      identity: 'login',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(
        object({ ...where, generation: { rule: number }, command: { rule: command } }),
      ),
      outcomes: {
        succeeded: ruleCodec(object({ goal: { rule: nullable(goal) } })),
        conflict: refused,
        'not-found': empty,
      },
    },
    'read-judge': {
      since: 3,
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(object(where)),
      outcomes: {
        succeeded: ruleCodec(
          object({ model: { rule: nullable(text) }, models: { rule: list(text) } }),
        ),
        'not-found': empty,
      },
    },
    'choose-judge': {
      since: 3,
      identity: 'login',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(object({ ...where, model: { rule: nullable(text) } })),
      outcomes: {
        succeeded: ruleCodec(object({ model: { rule: nullable(text) } })),
        invalid: ruleCodec(object({ issues: { rule: list(issue) } })),
        'not-found': empty,
      },
    },
  },
  observations: {
    'observe-goal': {
      identity: 'login',
      open: ruleCodec(object(where)),
      frame: ruleCodec(object({ kind: { rule: literal('changed') } })),
      ends: [],
    },
  },
})

export type GoalView = RuleValue<typeof goal>
export type GoalStateView = RuleValue<typeof state>
export type GoalGapRow = RuleValue<typeof gapRow>
export type GoalProvenance = RuleValue<typeof provenance>
export type GoalProposal = RuleValue<typeof proposal>
export type GoalPanelCommand = RuleValue<typeof command>
export type GoalIssue = RuleValue<typeof issue>
