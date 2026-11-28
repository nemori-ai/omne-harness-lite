import { defineProtocol, ruleCodec, type Rule } from '@omne-harness/public-contract'

type Fields = Readonly<
  Record<string, { readonly rule: Rule; readonly optional?: true; readonly since?: number }>
>

const text = { kind: 'text' } as const
const anyText = { kind: 'string' } as const
const count = { kind: 'count' } as const
const tenant = { kind: 'tenant' } as const
const nothing = { kind: 'null' } as const
const parameters = { kind: 'parameters' } as const

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
  connect: { rule: literal('available', 'connecting'), optional: true, since: 3 },
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
const notOAuth = ruleCodec(object({ reason: { rule: literal('not-oauth') } }))
const ofSubscription = {
  ...ofEndpoint,
  event: { rule: text },
  arguments: { rule: parameters },
} as const
const notSubscribable = ruleCodec(
  object({ reason: { rule: literal('no-events', 'no-such-type', 'webhook-only') } }),
)

/** Why a connection could not be begun; the text is the server's sentence for the person. */
const notBegun = ruleCodec(
  object({
    reason: {
      rule: literal(
        'disabled',
        'target-missing',
        'target-invalid',
        'client-id-invalid',
        'no-resource-metadata',
        'no-authorization-server',
        'issuer-mismatch',
        'no-pkce',
        'insecure-endpoint',
        'malformed',
        'no-registration',
        'registration-refused',
      ),
    },
    text: { rule: anyText },
  }),
)
const read = { identity: 'login', effect: 'read', limit: 'small', countsAsAccess: true } as const

const eventType = object({
  name: { rule: text },
  description: { rule: anyText },
  delivery: { rule: array(literal('poll', 'push', 'webhook')) },
})

const subscription = object({
  name: { rule: text },
  arguments: { rule: parameters },
  delivery: { rule: literal('poll', 'push') },
  state: { rule: literal('receiving', 'waiting', 'terminated') },
  reason: { rule: nullable(literal('refused', 'type-gone', 'schema-changed', 'unavailable')) },
  subscribers: { rule: count },
})

const received = { seq: { rule: count }, receivedAt: { rule: { kind: 'instant' } } } as const

const occurrence = oneOf(
  object({
    ...received,
    kind: { rule: literal('event') },
    eventId: { rule: text },
    name: { rule: text },
    timestamp: { rule: anyText },
    data: { rule: { kind: 'json' } },
  }),
  object({
    ...received,
    kind: { rule: literal('gap') },
    reason: { rule: literal('peer-truncated', 'trimmed', 'possibly-missed') },
  }),
)

const eventTypes = oneOf(
  object({ kind: { rule: literal('acquired') }, types: { rule: array(eventType) } }),
  object({ kind: { rule: literal('not-declared', 'not-acquired') } }),
)

/** mcp/v1. A person sees how each MCP endpoint of the tenant stands, reads one with its actions, and asks it to fetch its actions again; revision 2 adds the state of the credential and the observation of changes; revision 3 connects and disconnects an OAuth endpoint, and what became of an unknown answer to either is read with `read-endpoint`; revision 4 lists the event types of an endpoint, subscribes the person to one and reads what came; an unknown answer to a subscription is read with `read-events`. */
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
    'begin-connect': {
      ...read,
      effect: 'commit',
      body: ruleCodec(object(ofEndpoint)),
      outcomes: {
        succeeded: ruleCodec(
          object({ url: { rule: anyText }, expiresAt: { rule: { kind: 'instant' } } }),
        ),
        'not-visible': notVisible,
        unsupported: notOAuth,
        'not-committed': notBegun,
      },
      since: 3,
    },
    disconnect: {
      ...read,
      effect: 'commit',
      body: ruleCodec(object(ofEndpoint)),
      outcomes: {
        succeeded: ruleCodec(object({ disconnected: { rule: literal('disconnected') } })),
        'not-visible': notVisible,
        unsupported: notOAuth,
      },
      since: 3,
    },
    'list-event-types': {
      ...read,
      body: ruleCodec(object(ofEndpoint)),
      outcomes: {
        succeeded: ruleCodec(object({ events: { rule: eventTypes } })),
        'not-visible': notVisible,
      },
      since: 4,
    },
    'subscribe-events': {
      ...read,
      effect: 'commit',
      body: ruleCodec(object(ofSubscription)),
      outcomes: {
        succeeded: ruleCodec(object({ subscription: { rule: subscription } })),
        'not-visible': notVisible,
        unsupported: notSubscribable,
      },
      since: 4,
    },
    'unsubscribe-events': {
      ...read,
      effect: 'commit',
      body: ruleCodec(object(ofSubscription)),
      outcomes: {
        succeeded: ruleCodec(
          object({ unsubscribed: { rule: literal('unsubscribed', 'not-subscribed') } }),
        ),
        'not-visible': notVisible,
      },
      since: 4,
    },
    'read-events': {
      ...read,
      body: ruleCodec(
        object({
          ...ofSubscription,
          after: { rule: count },
          limit: { rule: { kind: 'page-limit' } },
        }),
      ),
      outcomes: {
        succeeded: ruleCodec(
          object({ subscription: { rule: subscription }, items: { rule: array(occurrence) } }),
        ),
        'not-visible': notVisible,
        'not-found': ruleCodec(object({})),
      },
      since: 4,
    },
  },
  observations: {
    /** A frame only says what may have changed: the endpoints of the tenant, or the events of one; the client reads again. */
    'observe-endpoints': {
      identity: 'login',
      open: ruleCodec(object(ofTenant)),
      frame: ruleCodec(
        object({
          kind: { rule: literal('changed') },
          about: { rule: literal('endpoints', 'events') },
        }),
      ),
      ends: [],
      since: 2,
    },
  },
})
export type McpProtocol = typeof mcpProtocol
