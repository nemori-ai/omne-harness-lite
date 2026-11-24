import { defineProtocol, ruleCodec, type Rule } from '@omne-harness/public-contract'

type Fields = Readonly<Record<string, { readonly rule: Rule; readonly optional?: true }>>

const text = { kind: 'text' } as const
const tenant = { kind: 'tenant' } as const
const boolean = { kind: 'boolean' } as const

const object = <const F extends Fields>(fields: F) => ({ kind: 'object', fields }) as const
const literal = <const V extends readonly string[]>(...values: V) =>
  ({ kind: 'literal', values }) as const
const array = <const R extends Rule>(item: R) => ({ kind: 'array', item }) as const

const modalities = { rule: array(literal('text', 'image', 'voice')) } as const

// One profile as it resolves for the tenant now. A route that lacks its credential stays
// selectable: `credential` says a call to it cannot go out yet.
const model = object({
  route: { rule: text },
  selectable: { rule: boolean },
  reasons: { rule: array(literal('modality', 'locked', 'scope')) },
  credential: { rule: literal('available', 'missing', 'unknown') },
  reasoningEfforts: {
    rule: array(literal('low', 'medium', 'high', 'xhigh')),
    optional: true,
    since: 2,
  },
  input: modalities,
  output: modalities,
})

export const modelProtocol = defineProtocol({
  name: 'model',
  major: 1,
  operations: {
    'list-models': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(object({ tenant: { rule: tenant } })),
      outcomes: { succeeded: ruleCodec(object({ models: { rule: array(model) } })) },
      countsAsAccess: true,
    },
  },
  observations: {},
})

export type ModelProtocol = typeof modelProtocol
