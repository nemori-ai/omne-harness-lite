import { defineProtocol, ruleCodec, type Rule, type RuleValue } from '@omne-harness/public-contract'

type Fields = Readonly<
  Record<string, { readonly rule: Rule; readonly optional?: true; readonly since?: number }>
>

const text = { kind: 'text' } as const
const tenant = { kind: 'tenant' } as const
const bytes = { kind: 'bytes' } as const
const positive = { kind: 'positive-integer' } as const
const count = { kind: 'count' } as const
const string = { kind: 'string' } as const
const boolean = { kind: 'boolean' } as const
const nothing = { kind: 'null' } as const

const object = <const F extends Fields>(fields: F) => ({ kind: 'object', fields }) as const
const literal = <const V extends readonly (string | boolean)[]>(...values: V) =>
  ({ kind: 'literal', values }) as const
const oneOf = <const R extends readonly Rule[]>(...rules: R) => ({ kind: 'one-of', rules }) as const
const kind = <const K extends string>(value: K) => ({ rule: literal(value) })
const optional = <const R extends Rule>(rule: R) => ({ rule, optional: true }) as const
const array = <const R extends Rule>(item: R) => ({ kind: 'array', item }) as const
const later = <const R extends Rule>(rule: R) => ({ rule, optional: true, since: 2 }) as const

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
export const PART_ROLES = ['dialog', 'alertdialog', 'alert', 'status', 'menu'] as const

/** One part drawn now: its name, its visible text, its box in whole CSS pixels in the window, and its parent in the list. */
const partSeen = object({
  part: { rule: text },
  text: { rule: string },
  box: {
    rule: object({
      x: { rule: count },
      y: { rule: count },
      w: { rule: count },
      h: { rule: count },
    }),
  },
  visible: { rule: boolean },
  within: { rule: oneOf(count, nothing) },
})
const layerSeen = object({
  role: { rule: literal(...PART_ROLES) },
  label: { rule: string },
  text: { rule: string },
})
const structure = object({
  page: { rule: oneOf(text, nothing) },
  width: { rule: count },
  height: { rule: count },
  parts: { rule: array(partSeen) },
  layers: { rule: array(layerSeen) },
  more: { rule: count },
})
/** What to wait for before answering: a part drawn, with this text in it when one is given, for at most so many seconds. */
const until = object({ part: { rule: text }, text: optional(text), seconds: { rule: positive } })
const asked = object({
  request: { rule: text },
  page: { rule: text },
  subject: optional(text),
  mode: { rule: mode },
  part: later(text),
  until: later(until),
})
/** A question of what the person sees right now, in the window they use. */
const now = object({
  request: { rule: text },
  want: { rule: literal('structure', 'image') },
  part: optional(text),
  until: optional(until),
})
const image = object({
  kind: kind('image'),
  bytes: { rule: bytes },
  width: { rule: positive },
  height: { rule: positive },
  structure: later(structure),
})
const cannot = object({ kind: kind('cannot'), reason: { rule: literal(...INSPECTION_REASONS) } })
const result = oneOf(image, cannot)
const seen = oneOf(
  object({ kind: kind('structure'), structure: { rule: structure } }),
  image,
  cannot,
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
    'deliver-seen': {
      identity: 'login',
      effect: 'commit',
      limit: 'input',
      since: 2,
      body: ruleCodec(
        object({
          ...ofClient,
          request: { rule: text },
          result: { rule: seen },
          met: { rule: boolean },
        }),
      ),
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
    'observe-now': {
      identity: 'login',
      since: 2,
      open: ruleCodec(object(ofClient)),
      frame: ruleCodec(now),
      ends: [],
    },
  },
})

export type InterfaceProtocol = typeof interfaceProtocol
export type InspectionMode = RuleValue<typeof mode>
export type InspectionAsked = RuleValue<typeof asked>
export type InspectionNow = RuleValue<typeof now>
export type InspectionResult = RuleValue<typeof result>
export type SeenResult = RuleValue<typeof seen>
export type Structure = RuleValue<typeof structure>
export type PartSeen = RuleValue<typeof partSeen>
export type LayerSeen = RuleValue<typeof layerSeen>
export type Until = RuleValue<typeof until>
export type InspectionReason = (typeof INSPECTION_REASONS)[number]
