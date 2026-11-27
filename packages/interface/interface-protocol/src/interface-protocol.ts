import { defineProtocol, ruleCodec, type Rule, type RuleValue } from '@omne-harness/public-contract'

type Fields = Readonly<Record<string, { readonly rule: Rule; readonly optional?: true }>>

const text = { kind: 'text' } as const
const tenant = { kind: 'tenant' } as const
const bytes = { kind: 'bytes' } as const
const positive = { kind: 'positive-integer' } as const

const object = <const F extends Fields>(fields: F) => ({ kind: 'object', fields }) as const
const literal = <const V extends readonly (string | boolean)[]>(...values: V) =>
  ({ kind: 'literal', values }) as const
const oneOf = <const R extends readonly Rule[]>(...rules: R) => ({ kind: 'one-of', rules }) as const
const kind = <const K extends string>(value: K) => ({ rule: literal(value) })
const optional = <const R extends Rule>(rule: R) => ({ rule, optional: true }) as const

export const THEMES = ['light', 'dark'] as const
export const SIZE_TIERS = ['small', 'medium', 'large', 'reading'] as const
/** Why a client cannot draw what was asked: a closed set. */
export const INSPECTION_REASONS = [
  'no-page',
  'no-skin',
  'bad-mode',
  'not-settled',
  'unsupported',
] as const

const look = oneOf(
  object({ kind: kind('built-in') }),
  object({ kind: kind('skin'), name: { rule: text } }),
)
const mode = object({
  theme: { rule: literal(...THEMES) },
  size: { rule: literal(...SIZE_TIERS) },
  look: { rule: look },
  width: { rule: positive },
  height: { rule: positive },
})
const asked = object({
  request: { rule: text },
  page: { rule: text },
  subject: optional(text),
  mode: { rule: mode },
})
const result = oneOf(
  object({
    kind: kind('image'),
    bytes: { rule: bytes },
    width: { rule: positive },
    height: { rule: positive },
  }),
  object({ kind: kind('cannot'), reason: { rule: literal(...INSPECTION_REASONS) } }),
)
const ofClient = { tenant: { rule: tenant }, client: { rule: text } } as const

/** How a page of a client looks in a mode: a client takes the requests by observing, and delivers each result once. */
export const interfaceProtocol = defineProtocol({
  name: 'interface',
  major: 1,
  operations: {
    deliver: {
      identity: 'login',
      effect: 'commit',
      limit: 'input',
      body: ruleCodec(object({ ...ofClient, request: { rule: text }, result: { rule: result } })),
      outcomes: { succeeded: ruleCodec(object({})), 'not-found': ruleCodec(object({})) },
    },
  },
  observations: {
    'observe-requests': {
      identity: 'login',
      open: ruleCodec(object(ofClient)),
      frame: ruleCodec(asked),
      ends: [],
    },
  },
})

export type InterfaceProtocol = typeof interfaceProtocol
export type InspectionMode = RuleValue<typeof mode>
export type InspectionAsked = RuleValue<typeof asked>
export type InspectionResult = RuleValue<typeof result>
export type InspectionReason = (typeof INSPECTION_REASONS)[number]
