import { defineProtocol, ruleCodec, type Rule, type RuleValue } from '@omne-harness/public-contract'

type Fields = Readonly<
  Record<string, { readonly rule: Rule; readonly optional?: true; readonly since?: number }>
>

const text = { kind: 'text' } as const
const count = { kind: 'count' } as const
const bytes = { kind: 'bytes' } as const
const nothing = { kind: 'null' } as const

const object = <const F extends Fields>(fields: F) => ({ kind: 'object', fields }) as const
const literal = <const V extends readonly string[]>(...values: V) =>
  ({ kind: 'literal', values }) as const
const oneOf = <const R extends readonly Rule[]>(...rules: R) => ({ kind: 'one-of', rules }) as const
const array = <const R extends Rule>(item: R) => ({ kind: 'array', item }) as const

const ofTenant = { tenant: { rule: { kind: 'tenant' } } } as const
const ofSide = { ...ofTenant, side: { rule: literal('client', 'server') } } as const

const file = object({ path: { rule: text }, digest: { rule: text }, bytes: { rule: count } })
/** One plugin a side is to load; `manifest` is the text of its `plugin.json` as the source holds it. */
const wanted = object({
  name: { rule: text },
  version: { rule: text },
  manifest: { rule: text },
  files: { rule: array(file) },
})
const report = object({
  name: { rule: text },
  version: { rule: text },
  state: { rule: literal('loaded', 'failed', 'held') },
  reason: { rule: oneOf(text, nothing) },
  waiting: { rule: array(text), optional: true, since: 3 },
})

/** The rules of a point as its owner declared them: what the key is, what an item gives and is given, and one to copy. */
const contract = object({
  arity: { rule: literal('one', 'list', 'keyed-one', 'keyed-list') },
  keyFrom: { rule: oneOf(text, nothing) },
  key: { rule: text },
  gives: { rule: text },
  item: {
    rule: object({
      kind: { rule: literal('data', 'pure', 'effect') },
      fields: {
        rule: array(
          object({
            name: { rule: text },
            kind: { rule: literal('string', 'number', 'boolean', 'function', 'object', 'array') },
          }),
        ),
      },
    }),
  },
  resolve: { rule: literal('conflict', 'most-specific') },
  binding: { rule: literal('build', 'run') },
  onError: { rule: text },
  version: { rule: count },
  revision: { rule: count },
  example: { rule: oneOf(text, nothing) },
  scopes: {
    rule: object({
      only: { rule: literal('deployment') },
      why: { rule: text },
      note: { rule: text },
    }),
    optional: true,
    since: 3,
  },
})
const dataKey = object({ name: { rule: text }, now: { rule: oneOf(text, nothing) } })
const point = object({
  name: { rule: text },
  summary: { rule: text },
  contract: { rule: contract, optional: true, since: 2 },
  dataKeys: { rule: array(dataKey), optional: true, since: 2 },
  form: {
    rule: object({ gives: { rule: text }, example: { rule: text } }),
    optional: true,
    since: 3,
  },
})

/** What a client says of itself: how each plugin stands, and the points and the parts its tree has now. */
const reported = {
  plugins: { rule: array(report) },
  handed: { rule: array(text), optional: true, since: 3 },
  points: { rule: array(point) },
  parts: {
    rule: array(
      object({
        name: { rule: text },
        label: { rule: text },
        summary: { rule: text },
        depths: { rule: array(literal('tokens', 'style', 'render')) },
        within: { rule: oneOf(text, nothing) },
      }),
    ),
  },
} as const
const ofClient = { client: { rule: text } } as const

const empty = ruleCodec(object({}))
const read = { identity: 'login', effect: 'read', limit: 'small', countsAsAccess: true } as const

/** plugin/v1. A client asks what its side is to load, reads the files, and says how each load went and what its tree has. */
export const pluginProtocol = defineProtocol({
  name: 'plugin',
  major: 1,
  operations: {
    'list-wanted': {
      ...read,
      body: ruleCodec(object(ofSide)),
      outcomes: { succeeded: ruleCodec(object({ plugins: { rule: array(wanted) } })) },
    },
    'read-file': {
      ...read,
      body: ruleCodec(
        object({
          ...ofTenant,
          name: { rule: text },
          version: { rule: text },
          path: { rule: text },
          offset: { rule: count },
          limit: { rule: count },
        }),
      ),
      outcomes: {
        succeeded: ruleCodec(
          object({
            part: { rule: bytes },
            next: { rule: oneOf(count, nothing) },
            bytes: { rule: count },
          }),
        ),
        'not-found': ruleCodec(object({ reason: { rule: literal('plugin', 'file') } })),
        limited: empty,
      },
    },
    /** Replaces what this client said before; sending it again is safe. */
    'report-loaded': {
      ...read,
      effect: 'commit',
      limit: 'input',
      body: ruleCodec(object({ ...ofTenant, ...ofClient, ...reported })),
      outcomes: { succeeded: empty },
    },
    'list-reports': {
      ...read,
      body: ruleCodec(object(ofTenant)),
      outcomes: {
        succeeded: ruleCodec(
          object({ clients: { rule: array(object({ ...ofClient, ...reported })) } }),
        ),
      },
    },
  },
  observations: {
    'observe-wanted': {
      identity: 'login',
      open: ruleCodec(object({ ...ofSide, ...ofClient })),
      frame: ruleCodec(object({ kind: { rule: literal('changed') } })),
      ends: [],
    },
  },
})
export type PluginProtocol = typeof pluginProtocol

/** One point as a client tells of it: its name, a line on it, and, from revision 2, its rules and the names its data may use. */
export type ReportedPoint = RuleValue<typeof point>
export type ReportedPointContract = NonNullable<ReportedPoint['contract']>
