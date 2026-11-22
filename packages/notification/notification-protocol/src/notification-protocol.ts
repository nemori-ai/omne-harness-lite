import { defineProtocol, ruleCodec, type Rule, type RuleValue } from '@omne-harness/public-contract'

type Fields = Readonly<Record<string, { readonly rule: Rule; readonly optional?: true }>>

const text = { kind: 'text' } as const
const string = { kind: 'string' } as const
const tenant = { kind: 'tenant' } as const
const instant = { kind: 'instant' } as const
const count = { kind: 'count' } as const
const positive = { kind: 'positive-integer' } as const
const pageLimit = { kind: 'page-limit' } as const
const boolean = { kind: 'boolean' } as const
const nothing = { kind: 'null' } as const

const object = <const F extends Fields>(fields: F) => ({ kind: 'object', fields }) as const
const literal = <const V extends readonly string[]>(...values: V) =>
  ({ kind: 'literal', values }) as const
const nullable = <const R extends Rule>(rule: R) =>
  ({ kind: 'one-of', rules: [rule, nothing] }) as const
const array = <const R extends Rule>(item: R) => ({ kind: 'array', item }) as const
const atMost = <const R extends Rule>(max: number, item: R) =>
  ({ kind: 'array', item, max }) as const
const oneOf = <const R extends readonly Rule[]>(...rules: R) => ({ kind: 'one-of', rules }) as const
const kind = <const K extends string>(value: K) => ({ rule: literal(value) })

/** A recipient: the person the tenant is, or an entrusted agent by its opaque reference. */
const recipient = oneOf(
  object({ kind: kind('person') }),
  object({ kind: kind('agent'), ref: { rule: text } }),
)
const recipientKind = literal('person', 'agent')
const level = literal('off', 'weak', 'strong')
const scope = oneOf(
  object({ kind: kind('all') }),
  object({ kind: kind('subject'), equals: { rule: text } }),
  object({ kind: kind('subject-prefix'), prefix: { rule: text } }),
)
const term = oneOf(
  object({ kind: kind('standing') }),
  object({ kind: kind('once') }),
  object({ kind: kind('until'), at: { rule: instant } }),
)
/** Who made a subscription: a person, an agent in one session, or the system. */
const creator = oneOf(
  object({ kind: kind('human') }),
  object({ kind: kind('agent'), session: { rule: text } }),
  object({ kind: kind('system') }),
)
const cause = oneOf(
  object({ kind: kind('named') }),
  object({ kind: kind('subscription'), scope: { rule: scope }, note: { rule: nullable(text) } }),
  object({ kind: kind('type-default') }),
)
const sendRef = { source: { rule: text }, event: { rule: text } } as const
const marks = object({
  seenAt: { rule: nullable(instant) },
  resolved: {
    rule: nullable(object({ how: { rule: literal('done', 'dismissed') }, at: { rule: instant } })),
  },
  supersededBy: { rule: nullable(object(sendRef)) },
})
const summaryFields = {
  ...sendRef,
  recipient: { rule: recipient },
  sequence: { rule: positive },
  type: { rule: text },
  title: { rule: text },
  level: { rule: literal('weak', 'strong') },
  cause: { rule: cause },
  acceptedAt: { rule: instant },
  marks: { rule: marks },
} as const
const summary = object(summaryFields)
const locator = nullable(object({ kind: { rule: text }, ref: { rule: text } }))
const view = object({
  ...summaryFields,
  subject: { rule: nullable(text) },
  at: { rule: instant },
  body: { rule: string },
  locator: { rule: locator },
})
const received = ruleCodec(object({ recipients: { rule: array(recipient) } }))
const subscriptionKey = {
  recipient: { rule: recipient },
  source: { rule: text },
  type: { rule: text },
  scope: { rule: scope },
} as const
const subscriptionChange = {
  ...subscriptionKey,
  level: { rule: level },
  note: { rule: nullable(text) },
  term: { rule: term },
} as const
const subscription = object({
  ...subscriptionChange,
  creator: { rule: creator },
  expired: { rule: boolean },
})
const beat = oneOf(
  object({ kind: kind('default') }),
  object({ kind: kind('off') }),
  object({ kind: kind('every'), minutes: { rule: positive } }),
)
const minLevel = literal('strong', 'weak')
const destination = object({
  recipient: { rule: recipient },
  id: { rule: text },
  channel: { rule: text },
  address: { rule: string },
  minLevel: { rule: minLevel },
  builtin: { rule: boolean },
  blockedSince: { rule: nullable(instant) },
  state: { rule: literal('enabled', 'disabled', 'channel-absent') },
})
const eventType = object({
  name: { rule: text },
  label: { rule: text },
  description: { rule: string },
  kind: { rule: literal('event', 'standing') },
  subject: {
    rule: object({
      presence: { rule: literal('none', 'optional', 'required') },
      hint: { rule: string },
    }),
  },
  subscribable: { rule: array(recipientKind) },
  nameable: { rule: array(recipientKind) },
  defaults: { rule: object({ person: { rule: level }, agent: { rule: level } }) },
  external: { rule: boolean },
})
const source = object({
  name: { rule: text },
  label: { rule: text },
  types: { rule: array(eventType) },
})
const channel = object({
  name: { rule: text },
  label: { rule: text },
  leavesSystem: { rule: boolean },
  addressHint: { rule: string },
})

const ofTenant = { tenant: { rule: tenant } } as const
const ofRecipient = { ...ofTenant, recipient: { rule: recipient } } as const
const ofNotification = { ...ofRecipient, ...sendRef } as const
const ofDestination = { ...ofRecipient, id: { rule: text } } as const
const none = ruleCodec(object({}))
const reasons = <const V extends readonly string[]>(...values: V) =>
  ruleCodec(object({ reason: { rule: literal(...values) } }))
/** `request`: the body fits the rules of the protocol and the notification domain still refuses its values. */
const invalid = <const V extends readonly string[]>(...more: V) => reasons('request', ...more)

const read = { identity: 'login', effect: 'read', limit: 'small', countsAsAccess: true } as const
const commit = {
  identity: 'login',
  effect: 'commit',
  limit: 'small',
  countsAsAccess: true,
} as const

/** Every commit is idempotent on the state it leaves: after `unknown`, the same body again is recalled as `no-change`. */
export const notificationProtocol = defineProtocol({
  name: 'notification',
  major: 2,
  operations: {
    /** The owner hands one event over under a source. When it happened is the server's time, not the body's. */
    send: {
      ...commit,
      limit: 'input',
      body: ruleCodec(
        object({
          ...ofTenant,
          ...sendRef,
          type: { rule: text },
          subject: { rule: nullable(text) },
          title: { rule: text },
          body: { rule: string },
          locator: { rule: locator },
          replaceKey: { rule: nullable(text) },
          renotify: { rule: boolean },
          named: { rule: atMost(16, recipient) },
        }),
      ),
      outcomes: {
        succeeded: received,
        'no-change': received,
        invalid: invalid(
          'too-large',
          'unknown-event-type',
          'standing-type',
          'invalid-subject',
          'naming-not-allowed',
          'recipient-not-admissible',
        ),
        conflict: reasons('different-content'),
      },
    },
    'list-inbox': {
      ...read,
      body: ruleCodec(
        object({
          ...ofRecipient,
          filter: { rule: literal('unresolved', 'all') },
          after: { rule: nullable(count) },
          limit: { rule: pageLimit },
        }),
      ),
      outcomes: {
        succeeded: ruleCodec(
          object({ entries: { rule: array(summary) }, next: { rule: nullable(count) } }),
        ),
        invalid: invalid(),
        'not-found': none,
      },
    },
    'read-notification': {
      ...read,
      body: ruleCodec(object(ofNotification)),
      outcomes: { succeeded: ruleCodec(view), invalid: invalid(), 'not-found': none },
    },
    mark: {
      ...commit,
      body: ruleCodec(
        object({
          ...ofNotification,
          operation: { rule: literal('seen', 'done', 'dismiss', 'restore') },
        }),
      ),
      outcomes: {
        succeeded: ruleCodec(marks),
        'no-change': ruleCodec(marks),
        invalid: invalid(),
        'not-found': none,
        conflict: reasons('restore-first', 'superseded'),
      },
    },
    'query-send': {
      ...read,
      body: ruleCodec(object({ ...ofTenant, ...sendRef })),
      outcomes: {
        succeeded: ruleCodec(
          oneOf(
            object({
              kind: kind('accepted'),
              notifications: {
                rule: array(object({ recipient: { rule: recipient }, marks: { rule: marks } })),
              },
            }),
            object({ kind: kind('not-submitted') }),
          ),
        ),
        invalid: invalid(),
      },
    },
    'list-subscriptions': {
      ...read,
      body: ruleCodec(object(ofRecipient)),
      outcomes: {
        succeeded: ruleCodec(object({ subscriptions: { rule: array(subscription) } })),
        invalid: invalid(),
      },
    },
    'set-subscription': {
      ...commit,
      body: ruleCodec(object({ ...ofTenant, ...subscriptionChange })),
      outcomes: {
        succeeded: ruleCodec(subscription),
        'no-change': ruleCodec(subscription),
        invalid: invalid('term-in-past', 'not-subscribable', 'scope-does-not-fit'),
      },
    },
    'remove-subscription': {
      ...commit,
      body: ruleCodec(object({ ...ofTenant, ...subscriptionKey })),
      outcomes: { succeeded: none, 'no-change': none, invalid: invalid() },
    },
    'read-beat': {
      ...read,
      body: ruleCodec(object(ofRecipient)),
      outcomes: { succeeded: ruleCodec(beat), invalid: invalid() },
    },
    'set-beat': {
      ...commit,
      body: ruleCodec(object({ ...ofRecipient, beat: { rule: beat } })),
      outcomes: {
        succeeded: ruleCodec(beat),
        'no-change': ruleCodec(beat),
        invalid: invalid('out-of-range'),
      },
    },
    'list-destinations': {
      ...read,
      body: ruleCodec(object(ofRecipient)),
      outcomes: {
        succeeded: ruleCodec(object({ destinations: { rule: array(destination) } })),
        invalid: invalid(),
      },
    },
    'add-destination': {
      ...commit,
      body: ruleCodec(
        object({
          ...ofRecipient,
          channel: { rule: text },
          address: { rule: string },
          minLevel: { rule: minLevel },
        }),
      ),
      outcomes: {
        succeeded: ruleCodec(destination),
        'no-change': ruleCodec(destination),
        invalid: invalid('address'),
      },
    },
    'change-destination': {
      ...commit,
      body: ruleCodec(
        object({
          ...ofDestination,
          minLevel: { rule: minLevel, optional: true },
          enabled: { rule: boolean, optional: true },
        }),
      ),
      outcomes: {
        succeeded: ruleCodec(destination),
        'no-change': ruleCodec(destination),
        invalid: invalid(),
        'not-found': none,
      },
    },
    'remove-destination': {
      ...commit,
      body: ruleCodec(object(ofDestination)),
      outcomes: { succeeded: none, 'no-change': none, invalid: invalid(), 'not-writable': none },
    },
    'list-sources': {
      ...read,
      body: ruleCodec(object(ofTenant)),
      outcomes: { succeeded: ruleCodec(object({ sources: { rule: array(source) } })) },
    },
    'list-channels': {
      ...read,
      body: ruleCodec(object(ofTenant)),
      outcomes: { succeeded: ruleCodec(object({ channels: { rule: array(channel) } })) },
    },
  },
  observations: {
    /** A frame says what may have changed, never what it is now. The observer reads again. */
    'observe-changes': {
      identity: 'login',
      open: ruleCodec(object(ofTenant)),
      frame: ruleCodec(
        object({ kind: kind('changed'), about: { rule: literal('inbox', 'catalog') } }),
      ),
      ends: [],
    },
  },
})

export type NotificationProtocol = typeof notificationProtocol
export type NotificationSummaryBody = RuleValue<typeof summary>
export type NotificationViewBody = RuleValue<typeof view>
export type NotificationSubscriptionBody = RuleValue<typeof subscription>
export type NotificationDestinationBody = RuleValue<typeof destination>
export type NotificationSourceBody = RuleValue<typeof source>
export type NotificationChannelBody = RuleValue<typeof channel>
