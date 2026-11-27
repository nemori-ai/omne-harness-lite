import { defineProtocol, ruleCodec, type Rule } from '@omne-harness/public-contract'

type Fields = Readonly<
  Record<string, { readonly rule: Rule; readonly optional?: true; readonly since?: number }>
>

const text = { kind: 'text' } as const
const anyText = { kind: 'string' } as const
const count = { kind: 'count' } as const
const tenant = { kind: 'tenant' } as const
const nothing = { kind: 'null' } as const

const object = <const F extends Fields>(fields: F) => ({ kind: 'object', fields }) as const
const literal = <const V extends readonly string[]>(...values: V) =>
  ({ kind: 'literal', values }) as const
const oneOf = <const R extends readonly Rule[]>(...rules: R) => ({ kind: 'one-of', rules }) as const
const array = <const R extends Rule>(item: R) => ({ kind: 'array', item }) as const
const nullable = <const R extends Rule>(rule: R) => oneOf(rule, nothing)

/** Reasons are sentences of the server; the text of a peer may be inside one, so none is judged non-empty. */
const reason = nullable(anyText)

const endpoint = object({
  name: { rule: text },
  connection: {
    rule: object({
      state: { rule: literal('none', 'preparing', 'ready', 'degraded', 'lost') },
      reason: { rule: reason },
    }),
  },
  credential: { rule: literal('present', 'absent', 'invalid', 'not-required') },
  /** Revision 2: the credential as it stands now, with the two states a credential can be refused in. */
  credentialState: {
    rule: literal('present', 'absent', 'invalid', 'not-required', 'rejected', 'reconnect-required'),
    optional: true,
    since: 2,
  },
  use: {
    rule: oneOf(
      object({ kind: { rule: literal('usable') } }),
      object({ kind: { rule: literal('blocked') }, reason: { rule: anyText } }),
    ),
  },
  catalog: {
    rule: oneOf(
      object({ kind: { rule: literal('acquired') }, actions: { rule: count } }),
      object({ kind: { rule: literal('not-acquired') }, reason: { rule: reason } }),
    ),
  },
})

const action = object({
  name: { rule: text },
  summary: { rule: anyText },
  available: { rule: { kind: 'boolean' } },
  reason: { rule: reason },
})

const ofTenant = { tenant: { rule: tenant } } as const
const ofEndpoint = { ...ofTenant, name: { rule: text } } as const
const notVisible = ruleCodec(object({}))
const read = { identity: 'login', effect: 'read', limit: 'small', countsAsAccess: true } as const

/** mcp/v1. A person sees how each MCP endpoint of the tenant stands, reads one with its actions, and asks it to fetch its actions again; revision 2 adds the state of the credential. */
export const mcpProtocol = defineProtocol({
  name: 'mcp',
  major: 1,
  operations: {
    'list-endpoints': {
      ...read,
      body: ruleCodec(object(ofTenant)),
      outcomes: { succeeded: ruleCodec(object({ items: { rule: array(endpoint) } })) },
    },
    'read-endpoint': {
      ...read,
      body: ruleCodec(object(ofEndpoint)),
      outcomes: {
        succeeded: ruleCodec(
          object({ endpoint: { rule: endpoint }, actions: { rule: nullable(array(action)) } }),
        ),
        'not-visible': notVisible,
      },
    },
    /** Fetches the actions once more; what became of an unknown answer is read with `read-endpoint`. */
    'refresh-endpoint': {
      ...read,
      effect: 'commit',
      body: ruleCodec(object(ofEndpoint)),
      outcomes: {
        succeeded: ruleCodec(
          object({
            refreshed: { rule: literal('published', 'superseded', 'cancelled', 'failed') },
            reason: { rule: reason },
          }),
        ),
        'not-visible': notVisible,
      },
    },
  },
  observations: {},
})
export type McpProtocol = typeof mcpProtocol
