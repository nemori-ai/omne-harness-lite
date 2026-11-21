import { defineProtocol, ruleCodec, type Rule } from '@omne-harness/public-contract'

type Fields = Readonly<Record<string, { readonly rule: Rule; readonly optional?: true }>>

const text = { kind: 'text' } as const
const anyText = { kind: 'string' } as const
const decimal = text
const count = { kind: 'count' } as const
const instant = { kind: 'instant' } as const
const tenant = { kind: 'tenant' } as const
const session = { kind: 'session' } as const
const flag = { kind: 'boolean' } as const
const nothing = { kind: 'null' } as const

const object = <const F extends Fields>(fields: F) => ({ kind: 'object', fields }) as const
const literal = <const V extends readonly string[]>(...values: V) =>
  ({ kind: 'literal', values }) as const
const nullable = <const R extends Rule>(rule: R) =>
  ({ kind: 'one-of', rules: [rule, nothing] }) as const
const array = <const R extends Rule>(item: R, max?: number) =>
  ({ kind: 'array', item, ...(max === undefined ? {} : { max }) }) as const
const oneOf = <const R extends readonly Rule[]>(...rules: R) => ({ kind: 'one-of', rules }) as const

const scope = oneOf(
  object({ kind: { rule: literal('tenant') } }),
  object({ kind: { rule: literal('session') }, session: { rule: session } }),
  object({ kind: { rule: literal('organization') } }),
)
const range = object({ from: { rule: instant }, to: { rule: instant } })

const sum = object({
  known: { rule: decimal },
  unknown: { rule: count },
  provisional: { rule: count },
})
const ratio = oneOf(
  object({ kind: { rule: literal('known') }, value: { rule: decimal } }),
  object({ kind: { rule: literal('unknown') } }),
)
const distribution = object({
  count: { rule: count },
  p50: { rule: nullable(count) },
  p90: { rule: nullable(count) },
})
const measures = object({
  calls: { rule: count },
  units: { rule: count },
  retried: { rule: count },
  interrupted: { rule: count },
  failed: { rule: array(object({ cause: { rule: nullable(anyText) }, count: { rule: count } })) },
  tokens: {
    rule: object({
      input: { rule: sum },
      output: { rule: sum },
      'cache-read': { rule: sum },
      'cache-write': { rule: sum },
      reasoning: { rule: sum },
    }),
  },
  cost: {
    rule: object({
      sums: { rule: array(object({ unit: { rule: text }, known: { rule: decimal } })) },
      unknown: { rule: count },
    }),
  },
  duration: {
    rule: object({
      total: { rule: sum },
      toFirstContent: { rule: distribution },
      whole: { rule: distribution },
    }),
  },
  rates: {
    rule: object({
      cacheHit: { rule: ratio },
      reasoningShare: { rule: ratio },
      retry: { rule: ratio },
      failure: { rule: ratio },
      outputPerSecond: { rule: ratio },
    }),
  },
})
const cell = object({ key: { rule: array(nullable(anyText)) }, measures: { rule: measures } })
const result = object({
  total: { rule: measures },
  groups: { rule: array(cell) },
  buckets: {
    rule: array(
      object({
        start: { rule: instant },
        end: { rule: instant },
        total: { rule: measures },
        groups: { rule: array(cell) },
      }),
    ),
  },
  coverage: {
    rule: object({
      sources: { rule: array(text) },
      undated: { rule: count },
      costUnknown: { rule: count },
      excluded: {
        rule: object({
          cacheHit: { rule: count },
          reasoningShare: { rule: count },
          outputPerSecond: { rule: count },
        }),
      },
      earliest: { rule: nullable(instant) },
    }),
  },
})

const amount = oneOf(
  object({ name: { rule: text }, state: { rule: literal('unknown') }, unit: { rule: text } }),
  object({
    name: { rule: text },
    state: { rule: literal('known', 'provisional') },
    lexeme: { rule: decimal },
    unit: { rule: text },
  }),
)
const fact = object({
  source: { rule: text },
  subject: {
    rule: object({ kind: { rule: literal('model_call', 'tool_execution') }, id: { rule: text } }),
  },
  unit: { rule: text },
  at: { rule: nullable(instant) },
  consumer: {
    rule: object({
      owner: { rule: anyText },
      work: { rule: anyText },
      position: { rule: anyText },
      purpose: { rule: anyText },
    }),
  },
  labels: {
    rule: object({
      model: { rule: nullable(anyText) },
      provider: { rule: nullable(anyText) },
      profile: { rule: nullable(anyText) },
      tool: { rule: nullable(anyText) },
    }),
  },
  outcome: { rule: literal('pending', 'completed', 'interrupted', 'failed') },
  cause: { rule: nullable(anyText) },
  usage: { rule: array(amount) },
  cost: {
    rule: nullable(
      oneOf(
        object({
          state: { rule: literal('known') },
          lexeme: { rule: decimal },
          unit: { rule: text },
        }),
        object({ state: { rule: literal('unknown') } }),
      ),
    ),
  },
  durations: {
    rule: object({
      toResponse: { rule: nullable(count) },
      toFirstContent: { rule: nullable(count) },
      total: { rule: nullable(count) },
      generation: { rule: nullable(count) },
    }),
  },
  connectRetries: { rule: count },
  window: {
    rule: nullable(
      object({ tokens: { rule: decimal }, compactAtPercent: { rule: nullable(decimal) } }),
    ),
  },
  accounted: { rule: flag },
})

const occupancy = oneOf(
  object({
    kind: { rule: literal('known') },
    used: { rule: decimal },
    window: { rule: decimal },
    percent: { rule: decimal },
    compactAtPercent: { rule: nullable(decimal) },
    asOf: { rule: object({ at: { rule: instant }, model: { rule: nullable(anyText) } }) },
  }),
  object({ kind: { rule: literal('none-yet') } }),
  object({
    kind: { rule: literal('unknown') },
    reason: { rule: literal('usage-unknown', 'window-unknown') },
  }),
)

const empty = ruleCodec(object({}))
const failures = {
  invalid: ruleCodec(
    object({
      field: { rule: literal('scope', 'range', 'zone', 'bucket', 'groupBy', 'limit', 'after') },
      reason: { rule: text },
    }),
  ),
  unsupported: ruleCodec(object({ field: { rule: literal('scope') } })),
  'not-found': empty,
  limited: ruleCodec(object({ limit: { rule: literal('buckets', 'pages') } })),
}
const read = { identity: 'login', effect: 'read', limit: 'small', countsAsAccess: true } as const

export const usageProtocol = defineProtocol({
  name: 'usage',
  major: 1,
  operations: {
    'query-usage': {
      ...read,
      body: ruleCodec(
        object({
          tenant: { rule: tenant },
          scope: { rule: scope },
          range: { rule: range },
          zone: { rule: text },
          bucket: { rule: literal('none', 'hour', 'day', 'week', 'month') },
          groupBy: { rule: array(literal('source', 'model', 'provider', 'purpose', 'tool'), 2) },
        }),
      ),
      outcomes: { succeeded: ruleCodec(result), ...failures },
    },
    'list-usage-records': {
      ...read,
      body: ruleCodec(
        object({
          tenant: { rule: tenant },
          scope: { rule: scope },
          range: { rule: range },
          after: { rule: nullable(text) },
          limit: { rule: { kind: 'page-limit' } },
        }),
      ),
      outcomes: {
        succeeded: ruleCodec(
          object({ entries: { rule: array(fact) }, next: { rule: nullable(text) } }),
        ),
        ...failures,
      },
    },
    'read-context-occupancy': {
      ...read,
      body: ruleCodec(object({ tenant: { rule: tenant }, session: { rule: session } })),
      outcomes: { succeeded: ruleCodec(occupancy), ...failures },
    },
  },
  observations: {},
})

export type UsageProtocol = typeof usageProtocol
