import { defineProtocol, ruleCodec, type Rule, type RuleValue } from '@omne-harness/public-contract'

type Fields = Readonly<Record<string, { readonly rule: Rule; readonly optional?: true }>>

const text = { kind: 'text' } as const
const tenant = { kind: 'tenant' } as const
const instant = { kind: 'instant' } as const
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
const kind = <const K extends string>(value: K) => ({ rule: literal(value) })

/** A point on the sheet from its top left corner. */
const spot = object({ x: { rule: count }, y: { rule: count } })
/** Who last changed it: the person, or the agent of one session. */
const mover = oneOf(
  object({ kind: kind('human') }),
  object({ kind: kind('agent'), session: { rule: text } }),
)
const item = object({
  id: { rule: text },
  reference: { rule: object({ kind: { rule: text }, ref: { rule: text } }) },
  state: { rule: literal('on', 'off') },
  at: { rule: spot },
  size: { rule: nullable(object({ width: { rule: positive }, height: { rule: positive } })) },
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
/** A kind now declared; a name declared twice is listed with the ones who declared it. */
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
/** Where a request does not fit: the canvas it names, or the request as a whole. */
const invalid = ruleCodec(object({ reason: { rule: literal('request', 'canvas') } }))

const read = { identity: 'login', effect: 'read', limit: 'small', countsAsAccess: true } as const

/** The canvas of the tenant that acts. A basis that cannot be read answers unavailable, never an empty canvas. */
export const canvasProtocol = defineProtocol({
  name: 'canvas',
  major: 1,
  operations: {
    /** The sheet, every item on it from the bottom up, every pile and the revision. */
    look: {
      ...read,
      body: ruleCodec(object({ ...ofTenant, canvas: { rule: text } })),
      outcomes: { succeeded: ruleCodec(canvas), invalid },
    },
    /** The kinds now declared that may be put on the canvas. */
    kinds: {
      ...read,
      body: ruleCodec(object(ofTenant)),
      outcomes: { succeeded: ruleCodec(object({ kinds: { rule: array(kindListing) } })) },
    },
  },
  observations: {},
})

export type CanvasProtocol = typeof canvasProtocol
export type CanvasBody = RuleValue<typeof canvas>
export type CanvasItemBody = RuleValue<typeof item>
export type CanvasPileBody = RuleValue<typeof pile>
export type CanvasKindBody = RuleValue<typeof kindListing>
