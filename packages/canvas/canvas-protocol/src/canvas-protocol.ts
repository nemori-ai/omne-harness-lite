import { defineProtocol, ruleCodec, type Rule, type RuleValue } from '@omne-harness/public-contract'

type Fields = Readonly<Record<string, { readonly rule: Rule; readonly optional?: true }>>

const text = { kind: 'text' } as const
const string = { kind: 'string' } as const
const tenant = { kind: 'tenant' } as const
const instant = { kind: 'instant' } as const
const count = { kind: 'count' } as const
const positive = { kind: 'positive-integer' } as const
const boolean = { kind: 'boolean' } as const
const nothing = { kind: 'null' } as const

const object = <const F extends Fields>(fields: F) => ({ kind: 'object', fields }) as const
const literal = <const V extends readonly (string | boolean)[]>(...values: V) =>
  ({ kind: 'literal', values }) as const
const nullable = <const R extends Rule>(rule: R) =>
  ({ kind: 'one-of', rules: [rule, nothing] }) as const
const array = <const R extends Rule>(item: R) => ({ kind: 'array', item }) as const
const oneOf = <const R extends readonly Rule[]>(...rules: R) => ({ kind: 'one-of', rules }) as const
const kind = <const K extends string>(value: K) => ({ rule: literal(value) })
const optional = <const R extends Rule>(rule: R) => ({ rule, optional: true }) as const

const spot = object({ x: { rule: count }, y: { rule: count } })
const size = object({ width: { rule: positive }, height: { rule: positive } })
const reference = object({ kind: { rule: text }, ref: { rule: text } })
const mover = oneOf(
  object({ kind: kind('human') }),
  object({ kind: kind('agent'), session: { rule: text } }),
)
const item = object({
  id: { rule: text },
  reference: { rule: reference },
  state: { rule: literal('on', 'off') },
  at: { rule: spot },
  size: { rule: nullable(size) },
  rank: { rule: count },
  pile: { rule: nullable(text) },
  locked: { rule: boolean },
  by: { rule: mover },
  when: { rule: instant },
})
const pile = object({
  id: { rule: text },
  name: { rule: nullable(text) },
  at: { rule: spot },
  by: { rule: mover },
  when: { rule: instant },
})
const sheet = object({
  width: { rule: positive },
  height: { rule: positive },
  grid: { rule: positive },
})
const canvas = object({
  sheet: { rule: sheet },
  items: { rule: array(item) },
  piles: { rule: array(pile) },
  revision: { rule: count },
})
const kindListing = oneOf(
  object({
    kind: kind('declared'),
    name: { rule: text },
    label: { rule: text },
    summary: { rule: text },
    reference: { rule: text },
  }),
  object({ kind: kind('conflict'), name: { rule: text }, by: { rule: array(text) } }),
)

const ofTenant = { tenant: { rule: tenant } } as const
const ofCanvas = { ...ofTenant, canvas: { rule: text } } as const
const items = { items: { rule: array(text) } } as const
const invalid = ruleCodec(object({ reason: { rule: literal('request', 'canvas') } }))
const notFitting = ruleCodec(
  object({
    reason: { rule: literal('canvas', 'request', 'spot', 'size', 'repeated', 'batch') },
    path: { rule: array(oneOf(string, count)) },
  }),
)
const entry = oneOf(object({ item: { rule: text } }), object({ pile: { rule: text } }))
const changed = ruleCodec(object({ revision: { rule: count } }))
const none = ruleCodec(object({}))
const batchOutcomes = {
  succeeded: changed,
  'no-change': none,
  invalid: notFitting,
  'not-found': ruleCodec(object({ entry: { rule: entry } })),
  conflict: ruleCodec(
    object({
      reason: {
        rule: literal('kind-undeclared', 'full', 'not-admitted', 'locked', 'taken', 'in-pile'),
      },
      entry: optional(entry),
    }),
  ),
} as const

const read = { identity: 'login', effect: 'read', limit: 'small', countsAsAccess: true } as const
const write = { ...read, effect: 'commit' } as const

const itemChange = object({
  item: { rule: text },
  at: optional(spot),
  size: optional(nullable(size)),
  top: optional(literal(true)),
  pile: optional(nullable(text)),
})
const pileChange = object({
  pile: { rule: text },
  at: optional(spot),
  name: optional(nullable(text)),
})

/** The canvas of the tenant that acts. After `unknown`, the same body again answers `no-change` if it was done. */
export const canvasProtocol = defineProtocol({
  name: 'canvas',
  major: 1,
  operations: {
    look: {
      ...read,
      body: ruleCodec(object(ofCanvas)),
      outcomes: { succeeded: ruleCodec(canvas), invalid },
    },
    /** The taken records, the newest first; `before` is the `next` of the page before. */
    'look-away': {
      ...read,
      body: ruleCodec(object({ ...ofCanvas, limit: { rule: positive }, before: optional(count) })),
      outcomes: {
        succeeded: ruleCodec(
          object({ items: { rule: array(item) }, next: { rule: nullable(count) } }),
        ),
        invalid: notFitting,
      },
    },
    kinds: {
      ...read,
      body: ruleCodec(object(ofTenant)),
      outcomes: { succeeded: ruleCodec(object({ kinds: { rule: array(kindListing) } })) },
    },
    /** At the spot given, else at the free place nearest `near`, else beside the seat of the shape. */
    place: {
      ...write,
      body: ruleCodec(
        object({
          ...ofCanvas,
          reference: { rule: reference },
          at: optional(spot),
          near: optional(spot),
          size: optional(size),
        }),
      ),
      outcomes: {
        succeeded: ruleCodec(object({ revision: { rule: count }, item: { rule: item } })),
        'no-change': ruleCodec(object({ item: { rule: item } })),
        invalid: notFitting,
        conflict: ruleCodec(
          object({ reason: { rule: literal('kind-undeclared', 'full', 'not-admitted') } }),
        ),
      },
    },
    arrange: {
      ...write,
      body: ruleCodec(
        object({
          ...ofCanvas,
          items: optional(array(itemChange)),
          piles: optional(array(pileChange)),
        }),
      ),
      outcomes: batchOutcomes,
    },
    take: { ...write, body: ruleCodec(object({ ...ofCanvas, ...items })), outcomes: batchOutcomes },
    /** The caller names the pile: it is made when it is not there. A batch is done whole or not at all. */
    pile: {
      ...write,
      body: ruleCodec(object({ ...ofCanvas, pile: { rule: text }, ...items, at: optional(spot) })),
      outcomes: batchOutcomes,
    },
    scatter: {
      ...write,
      body: ruleCodec(object({ ...ofCanvas, pile: { rule: text } })),
      outcomes: batchOutcomes,
    },
    lock: {
      ...write,
      body: ruleCodec(object({ ...ofCanvas, ...items, locked: { rule: boolean } })),
      outcomes: batchOutcomes,
    },
  },
  observations: {
    /** A frame says the canvas of the tenant may have changed, never how. The observer reads again. */
    'observe-changes': {
      identity: 'login',
      open: ruleCodec(object(ofTenant)),
      frame: ruleCodec(object({ kind: kind('changed') })),
      ends: [],
    },
  },
})

export type CanvasProtocol = typeof canvasProtocol
export type CanvasBody = RuleValue<typeof canvas>
export type CanvasItemBody = RuleValue<typeof item>
export type CanvasPileBody = RuleValue<typeof pile>
export type CanvasKindBody = RuleValue<typeof kindListing>
export type CanvasEntryBody = RuleValue<typeof entry>
