import type {
  AccessContribution,
  AnswerOf,
  LoginIdentity,
  Principal,
} from '@omne-harness/access-cordis-contract'
import { readJsonText, writeJsonText, type JsonLimits } from '@omne-harness/json-text'
import {
  createCatalog,
  createChannelRegistry,
  createDestinations,
  createInbox,
  createSending,
  createSourceRegistry,
  createSubscriptions,
} from '@omne-harness/notification'
import {
  createNotificationContribution,
  type NotificationChangeListener,
  type NotificationFaces,
} from '@omne-harness/notification-access'
import {
  channelNameSchema,
  eventTypeNameSchema,
  sourceNameSchema,
  tenantIdSchema,
  type Actor,
  type CallContext,
  type EventTypeDeclaration,
  type SendRequestInput,
} from '@omne-harness/notification-contract'
import {
  notificationProtocol,
  type NotificationProtocol,
} from '@omne-harness/notification-protocol'
import {
  createMemoryStore,
  fakeAuthority,
  fakeChannel,
  fakeClock,
  fakeConsent,
} from '@omne-harness/notification/testing'

const limits: JsonLimits = {
  maxBytes: 100_000,
  maxDepth: 50,
  maxItems: 10_000,
  maxMembers: 100,
  maxStringLength: 10_000,
  maxNumberLength: 100,
}

const tenantText = (account: string) =>
  JSON.stringify({ organization: 'org_00000000000000000000000000', account })
export const TENANT = tenantText('acc_00000000000000000000000000')
export const OTHER = tenantText('acc_00000000000000000000000001')
export const person = { kind: 'person' } as const
export const agent = (ref: string) => ({ kind: 'agent', ref }) as const

export type Operations = NotificationProtocol['operations']
export type Name = keyof Operations
type Handlers = AccessContribution<NotificationProtocol>['operations']
export const NAMES = Object.keys(notificationProtocol.operations) as Name[]
export const effectOf = (name: Name) => notificationProtocol.operations[name].effect

function tree(value: unknown) {
  const read = readJsonText(JSON.stringify(value), limits)
  if (read.kind !== 'ok') throw new Error('sample is not JSON')
  return read.value
}

/** Reads a wire sample by the codec of the operation, as the entry does before it calls a handler. */
export function bodyOf(name: Name, sample: unknown) {
  const read = notificationProtocol.operations[name].body.read(tree(sample), limits)
  if (!read.ok) throw new Error(`${name} sample did not read`)
  return read.value as never
}

/** Writes an answer by the codec of its outcome: an answer the protocol cannot carry fails here. */
function wire<K extends Name>(name: K, answer: AnswerOf<Operations[K]>) {
  if (!('body' in answer)) return { outcome: answer.outcome }
  const codec = (notificationProtocol.operations[name].outcomes as Record<string, unknown>)[
    answer.outcome
  ] as { write(value: unknown, limits: JsonLimits): { ok: boolean; value?: never } }
  const written = codec.write(answer.body, limits)
  if (!written.ok || written.value === undefined) throw new Error(`${answer.outcome} did not write`)
  return { outcome: answer.outcome, body: JSON.parse(writeJsonText(written.value)) as unknown }
}

const event = (name: string, more: Partial<EventTypeDeclaration> = {}): EventTypeDeclaration => ({
  name: eventTypeNameSchema.parse(name),
  label: name,
  description: `A thing ${name}.`,
  kind: { kind: 'event' },
  subject: { presence: 'optional', hint: 'a repository path' },
  subscribable: ['person', 'agent'],
  nameable: ['person', 'agent'],
  defaults: { person: 'weak', agent: 'off' },
  external: false,
  ...more,
})

const defaults = {
  person: { channel: channelNameSchema.parse('in-app'), minLevel: 'weak' },
  agent: { channel: channelNameSchema.parse('session'), minLevel: 'weak' },
} as const

export function changeFeed() {
  const listeners = new Set<NotificationChangeListener>()
  const released: NotificationChangeListener[] = []
  let broken = false
  return {
    listeners,
    /** One entry for every call of an undo function. */
    released,
    breakNext() {
      broken = true
    },
    subscribe(listener: NotificationChangeListener) {
      if (broken) throw new Error('feed is down')
      listeners.add(listener)
      return () => {
        released.push(listener)
        listeners.delete(listener)
      }
    },
    inbox(tenant: string) {
      for (const listener of listeners)
        listener.changed({ kind: 'inbox', tenant: tenantIdSchema.parse(tenant) })
    },
    catalog() {
      for (const listener of listeners) listener.changed({ kind: 'catalog' })
    },
    close() {
      for (const listener of listeners) listener.closed()
    },
  }
}

type LoginAnswer = 'acting' | 'denied' | 'basis-unavailable' | 'throws'

export function world() {
  const store = createMemoryStore()
  const authority = fakeAuthority()
  const clock = fakeClock()
  const consent = fakeConsent()
  const sources = createSourceRegistry()
  sources.register({
    name: sourceNameSchema.parse('demo.things'),
    label: 'Demo',
    types: [
      event('changed'),
      event('for-people', { subscribable: ['person'] }),
      event('plain', { subject: { presence: 'none', hint: '' } }),
    ],
  })
  const channels = createChannelRegistry()
  channels.register(fakeChannel('in-app'))
  channels.register(fakeChannel('mail', { leavesSystem: true }))
  const limitsOf = { bodyLength: 1000, causalDepth: 3 }
  const sending = createSending({
    authority,
    store,
    sources,
    clock,
    limits: limitsOf,
    defaults,
    accepted: () => {},
  })
  const real: NotificationFaces = {
    sending,
    inbox: createInbox({ authority, store, clock, pageLimit: 50 }),
    subscriptions: createSubscriptions({
      authority,
      store,
      sources,
      consent,
      clock,
      defaults,
      beatRange: { min: 5, max: 1440 },
    }),
    destinations: createDestinations({ authority, store, channels, defaults }),
    catalog: createCatalog({ authority, sources, channels }),
  }
  const feed = changeFeed()
  const state = {
    login: 'acting' as LoginAnswer,
    faces: real as NotificationFaces | undefined,
    feed: feed as ReturnType<typeof changeFeed> | undefined,
    actor: { kind: 'owner' } as Actor,
    logins: [] as string[],
  }
  const principal = { principal: 'issued' } as unknown as Principal
  const contextOf = (tenant: string): CallContext => ({
    tenant: tenantIdSchema.parse(tenant),
    subject: principal,
    actor: state.actor,
  })
  const contribution = createNotificationContribution({
    principals: {
      async actingFor(_login, tenant) {
        state.logins.push(tenant)
        if (state.login === 'throws') throw new Error('identity is down')
        return state.login === 'acting' ? { ok: principal } : { refused: state.login }
      },
      contextOf: (_principal, tenant) => contextOf(tenant),
    },
    faces: () => state.faces,
    changes: () => state.feed,
  })
  const login = {} as LoginIdentity
  const controller = new AbortController()
  const context = { principal: login, messageId: 'm-1', signal: controller.signal }

  async function call<K extends Name>(name: K, sample: Record<string, unknown>) {
    const handler = contribution.operations[name] as Handlers[K]
    const answer = await handler(context as never, bodyOf(name, { tenant: TENANT, ...sample }))
    return wire(name, answer as AnswerOf<Operations[K]>)
  }

  /** Hands one event to the real domain, as a source would. */
  async function send(
    eventId: string,
    more: Partial<SendRequestInput['event']> = {},
    tenant = TENANT,
  ) {
    const accepted = await sending.send(contextOf(tenant), {
      identity: { tenant, source: 'demo.things', eventId },
      event: {
        type: 'changed',
        subject: 'repo/a',
        at: '2026-11-18T05:59:00.000Z',
        content: { title: `Title ${eventId}`, body: `Body ${eventId}`, locator: null },
        replaceKey: null,
        renotify: false,
        named: [],
        origin: null,
        ...more,
      },
    })
    if (accepted.kind !== 'done') throw new Error(`send answered ${accepted.kind}`)
  }

  return {
    store,
    authority,
    clock,
    consent,
    channels,
    real,
    feed,
    state,
    contribution,
    context,
    controller,
    call,
    send,
  }
}
