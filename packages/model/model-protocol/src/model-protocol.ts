import { defineProtocol, ruleCodec, type Rule } from '@omne-harness/public-contract'

type Fields = Readonly<Record<string, { readonly rule: Rule; readonly optional?: true }>>

const text = { kind: 'text' } as const
const tenant = { kind: 'tenant' } as const
const session = { kind: 'session' } as const
const boolean = { kind: 'boolean' } as const

const object = <const F extends Fields>(fields: F) => ({ kind: 'object', fields }) as const
const literal = <const V extends readonly string[]>(...values: V) =>
  ({ kind: 'literal', values }) as const
const array = <const R extends Rule>(item: R) => ({ kind: 'array', item }) as const

const modalities = { rule: array(literal('text', 'image', 'voice')) } as const
const kind = literal('llm', 'decisions', 'live')
const blockPosition = object({ message: { rule: text }, block: { rule: text } })

// One profile as it resolves for the tenant now. A route that lacks its credential stays
// selectable: `credential` says a call to it cannot go out yet.
const model = object({
  kind: { rule: kind, optional: true, since: 5 },
  route: { rule: text },
  selectable: { rule: boolean },
  reasons: { rule: array(literal('modality', 'locked', 'scope')) },
  credential: { rule: literal('available', 'missing', 'unknown') },
  reasoningEfforts: {
    rule: array(literal('low', 'medium', 'high', 'xhigh')),
    optional: true,
    since: 2,
  },
  // False for a model the tenant has turned off: it is listed, and it cannot be selected.
  enabled: { rule: boolean, optional: true, since: 3 },
  // The effort the tenant set for this model; a session that chose none uses it.
  defaultReasoningEffort: {
    rule: literal('low', 'medium', 'high', 'xhigh'),
    optional: true,
    since: 3,
  },
  input: modalities,
  output: modalities,
  // Asked for a session: the blocks of its history this model cannot take natively.
  blocks: { rule: { kind: 'array', item: blockPosition, max: 16 }, optional: true, since: 4 },
})

const supply = object({
  state: { rule: literal('ready', 'blocked', 'unknown') },
  by: {
    rule: literal('no-offering', 'credential', 'not-enabled', 'locked', 'scope'),
    optional: true,
  },
  providers: { rule: array(text), optional: true },
  models: {
    rule: array(object({ provider: { rule: text }, route: { rule: text } })),
    optional: true,
  },
})

export const modelProtocol = defineProtocol({
  name: 'model',
  major: 1,
  operations: {
    'list-models': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(
        object({
          tenant: { rule: tenant },
          session: { rule: session, optional: true, since: 4 },
          // Without a kind the list is of chat models; a session is read for chat models only.
          kind: { rule: kind, optional: true, since: 5 },
        }),
      ),
      outcomes: {
        succeeded: ruleCodec(
          object({
            models: { rule: array(model) },
            supply: { rule: supply, optional: true, since: 5 },
          }),
        ),
      },
      countsAsAccess: true,
    },
  },
  observations: {},
})

export type ModelProtocol = typeof modelProtocol
