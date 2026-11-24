import {
  eventFactsSchema,
  instantSchema,
  sendIdentitySchema,
  sourceNameSchema,
  eventTypeNameSchema,
  type EventFacts,
  type EventTypeDeclaration,
  type Instant,
  type RecipientRef,
  type Scope,
  type SendIdentity,
  type SourceDeclaration,
  type Subscription,
} from '@omne-harness/notification-contract'

export const at = (minute: number): Instant =>
  instantSchema.parse(new Date(Date.UTC(2026, 10, 18, 6, minute)).toISOString())

export const person: RecipientRef = { kind: 'person' }
export const agent = (ref: string): RecipientRef => ({ kind: 'agent', ref })

export const source = sourceNameSchema.parse('demo.things')
export const typeName = eventTypeNameSchema.parse('changed')

export const identity = (eventId: string): SendIdentity =>
  sendIdentitySchema.parse({ tenant: 't1', source: 'demo.things', eventId })

export function event(overrides: Partial<Record<keyof EventFacts, unknown>> = {}): EventFacts {
  return eventFactsSchema.parse({
    type: 'changed',
    subject: 'repo/a',
    at: at(0),
    content: { title: 'Changed', body: 'It changed.', locator: null },
    replaceKey: null,
    renotify: false,
    named: [],
    origin: null,
    ...overrides,
  })
}

export function declared(overrides: Partial<EventTypeDeclaration> = {}): EventTypeDeclaration {
  return {
    name: typeName,
    label: 'Changed',
    description: 'A thing changed.',
    kind: { kind: 'event' },
    subject: { presence: 'optional', hint: 'a repository path' },
    subscribable: ['person', 'agent'],
    nameable: ['person', 'agent'],
    defaults: { person: 'weak', agent: 'off' },
    external: false,
    ...overrides,
  }
}

export function declaration(...types: EventTypeDeclaration[]): SourceDeclaration {
  return { name: source, label: 'Demo', types: types.length === 0 ? [declared()] : types }
}

export function subscription(
  recipient: RecipientRef,
  scope: Scope,
  overrides: Partial<Subscription> = {},
): Subscription {
  return {
    recipient,
    source,
    type: typeName,
    scope,
    level: 'strong',
    note: null,
    term: { kind: 'standing' },
    creator: { kind: 'human', actorRef: 'owner' },
    expired: false,
    ...overrides,
  }
}
