import { defineProtocol, ruleCodec, type Rule, type RuleValue } from '@omne-harness/public-contract'

type Fields = Readonly<Record<string, { readonly rule: Rule; readonly optional?: true }>>

const text = { kind: 'text' } as const
const tenant = { kind: 'tenant' } as const
const session = { kind: 'session' } as const

const object = <const F extends Fields>(fields: F) => ({ kind: 'object', fields }) as const
const literal = <const V extends readonly string[]>(...values: V) =>
  ({ kind: 'literal', values }) as const
const array = <const R extends Rule>(item: R, max: number) =>
  ({ kind: 'array', item, max }) as const

const empty = ruleCodec(object({}))
const limited = ruleCodec(
  object({ resource: { rule: text }, limit: { rule: { kind: 'positive-integer' } } }),
)

/** The public half of an entry: what a client may show. Where a system command goes and what it needs stay on the server. */
const entry = object({
  full: { rule: text },
  space: { rule: text },
  name: { rule: text },
  kind: { rule: literal('reference', 'prompt', 'system') },
  title: { rule: text },
  hint: { rule: text, optional: true },
  unavailable: { rule: text, optional: true },
  whileRunning: { rule: literal('now', 'refuse'), optional: true },
  takesEffect: { rule: literal('now', 'next-request', 'next-run'), optional: true },
})

const catalog = object({
  entries: { rule: array(entry, 4096) },
  missing: { rule: array(text, 64) },
})
const target = object({ tenant: { rule: tenant }, session: { rule: session } })

export const slashCommandProtocol = defineProtocol({
  name: 'slash-command',
  major: 1,
  operations: {
    'read-catalog': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(target),
      outcomes: { succeeded: ruleCodec(catalog), invalid: empty, limited },
    },
  },
  observations: {
    'observe-catalog': {
      identity: 'login',
      open: ruleCodec(target),
      frame: ruleCodec(object({ kind: { rule: literal('changed') } })),
      ends: [],
    },
  },
})

export type SlashCommandProtocol = typeof slashCommandProtocol
export type SlashCommandCatalog = RuleValue<typeof catalog>
export type SlashCommandEntry = RuleValue<typeof entry>
