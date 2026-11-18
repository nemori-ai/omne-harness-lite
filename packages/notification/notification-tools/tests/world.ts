import { readJsonText } from '@omne-harness/json-text'
import {
  createCatalog,
  createChannelRegistry,
  createInbox,
  createSending,
  createSourceRegistry,
  createSubscriptions,
} from '@omne-harness/notification'
import {
  channelNameSchema,
  eventTypeNameSchema,
  sourceNameSchema,
  tenantIdSchema,
  type Actor,
  type CallContext,
  type EventTypeDeclaration,
  type RecipientRef,
  type SendRequestInput,
} from '@omne-harness/notification-contract'
import {
  attachNotifications,
  bindNotifications,
  createNotificationsAuthor,
  notificationsExecutor,
  notificationsToolModule,
  type NotificationCallSource,
  type NotificationToolFaces,
} from '@omne-harness/notification-tools'
import {
  createMemoryStore,
  fakeAuthority,
  fakeChannel,
  fakeClock,
  fakeConsent,
} from '@omne-harness/notification/testing'
import { createIndependentToolScope } from '@omne-harness/tool'
import type { ToolDecision } from '@omne-harness/tool-contract'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import { commandArguments, deriveDefinition } from '@omne-harness/tool-contract/provider'

export const TENANT = 't1'
export const person: RecipientRef = { kind: 'person' }
export const agent = (ref: string) => ({ kind: 'agent', ref }) as const
export const POSTS = { source: 'agent.posts', type: 'post' } as const
export const NOW = '2026-11-18T06:00:00.000Z'

export const json = (value: unknown) => {
  const read = readJsonText(JSON.stringify(value), {
    maxBytes: 262_144,
    maxDepth: 16,
    maxItems: 1024,
    maxMembers: 64,
    maxStringLength: 65_536,
    maxNumberLength: 32,
  })
  if (read.kind !== 'ok') throw new Error('json')
  return read.value
}

const event = (name: string, more: Partial<EventTypeDeclaration> = {}): EventTypeDeclaration => ({
  name: eventTypeNameSchema.parse(name),
  label: `Label of ${name}`,
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

/** The real domain over the memory store, with the source agents post to and one demo source. */
export function domain() {
  const store = createMemoryStore()
  const authority = fakeAuthority()
  const clock = fakeClock(NOW)
  const consent = fakeConsent()
  const sources = createSourceRegistry()
  sources.register({
    name: sourceNameSchema.parse(POSTS.source),
    label: 'Agent posts',
    types: [
      event(POSTS.type, { subject: { presence: 'required', hint: 'the agent that wrote it' } }),
    ],
  })
  sources.register({
    name: sourceNameSchema.parse('demo.things'),
    label: 'Demo',
    types: [event('changed'), event('for-people', { subscribable: ['person'] })],
  })
  const channels = createChannelRegistry()
  channels.register(fakeChannel('in-app'))
  channels.register(fakeChannel('session'))
  const limits = { bodyLength: 1000, causalDepth: 3 }
  const sending = createSending({
    authority,
    store,
    sources,
    clock,
    limits,
    defaults,
    accepted: () => {},
  })
  const faces: NotificationToolFaces = {
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
    catalog: createCatalog({ authority, sources, channels }),
  }
  const contextOf = (actor: Actor, tenant = TENANT): CallContext => ({
    tenant: tenantIdSchema.parse(tenant),
    subject: { test: tenant },
    actor,
  })
  const owner = contextOf({ kind: 'owner' })
  /** Hands one event of the demo source to the domain, as that source would. */
  async function emit(eventId: string, more: Partial<SendRequestInput['event']> = {}) {
    const accepted = await sending.send(owner, {
      identity: { tenant: TENANT, source: 'demo.things', eventId },
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
    if (accepted.kind !== 'done') throw new Error(`emit answered ${accepted.kind}`)
  }
  async function boxOf(recipient: RecipientRef, filter: 'all' | 'unresolved' = 'all') {
    const page = await faces.inbox.list(owner, { recipient, filter, after: null, limit: 50 })
    if (page.kind !== 'done') throw new Error(`list answered ${page.kind}`)
    return page.value.entries
  }
  return { store, authority, clock, consent, sources, faces, contextOf, owner, emit, boxOf }
}

function scope() {
  const created = createIndependentToolScope({
    signal: new AbortController().signal,
    limits: {
      authorBufferBytes: 65536,
      authorBufferItems: 100,
      authorWaitHistoryBytes: 65536,
      authorWaitHistoryItems: 100,
    },
    process: null,
    waits: null,
  })
  if ('failure' in created) throw new Error(JSON.stringify(created.failure))
  return created.ok
}

export function author(maximum = 65_536) {
  const created = createNotificationsAuthor(json({ resultMaxBytes: maximum }))
  if ('failure' in created) throw new Error(JSON.stringify(created.failure))
  const read = readToolRegistration(created.ok)
  if (read?.kind !== 'commands') throw new Error('commands')
  const registration = read
  const definition = deriveDefinition(
    {
      asset: { name: 'Notifications', adoption: notificationsToolModule.executor },
      requiredCapabilities: [],
    },
    created.ok.facts,
  )
  /** Cuts the params of the named command out of a whole call and parses them, as the binding does. */
  function decode(command: string, params: unknown) {
    const operation = registration.operations.find(([name]) => name === command)?.[1]
    const text = JSON.stringify({ command, params })
    const cut = commandArguments(definition, command, {
      original: text,
      effective: text,
      complete: true,
    })
    if ('failure' in cut) return cut
    if (operation === undefined || operation.author.kind !== 'ordinary') throw new Error('ordinary')
    return operation.author.parameters.parse(cut.ok)
  }
  return { definition, registration, decode }
}

const tool = author()

/** One agent's calls of the tool against the domain. `source` overrides what the application would bind. */
export function caller(
  d: ReturnType<typeof domain>,
  ref = 'a1',
  overrides: Partial<NotificationCallSource> = {},
) {
  const self = agent(ref)
  const bound = bindNotifications({
    tenant: TENANT,
    call: `call-of-${ref}`,
    posts: POSTS,
    faces: () => d.faces,
    context: async () => d.contextOf({ kind: 'agent', recipient: self }),
    causalDepth: () => 0,
    now: () => NOW,
    ...overrides,
  })
  const execution = attachNotifications(scope(), bound)
  const segment = { emit: () => undefined, signal: execution.context.signal } as never

  async function run(command: string, params: unknown = {}) {
    const parsed = tool.decode(command, params)
    if ('failure' in parsed) return { failure: parsed.failure }
    return notificationsExecutor.initial(parsed.ok as never, null, segment)
  }
  /** The value of a completed call: its first line and the JSON under it. */
  async function ok(command: string, params: unknown = {}) {
    const answer = await run(command, params)
    if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
    if (answer.ok.kind !== 'completed') throw new Error(answer.ok.kind)
    const [head = '', body = 'null'] = answer.ok.value.split('\n')
    return { head, value: JSON.parse(body) as any }
  }
  async function failure(command: string, params: unknown = {}) {
    const answer = await run(command, params)
    if (!('failure' in answer))
      throw new Error(`expected a failure, got ${JSON.stringify(answer.ok)}`)
    return answer.failure as { kind: string; reason: string; operation?: string }
  }
  async function suspended(command: string, params: unknown = {}) {
    const answer = await run(command, params)
    if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
    if (answer.ok.kind !== 'suspended') throw new Error(answer.ok.kind)
    return answer.ok
  }
  const resume = (state: Uint8Array, decision: ToolDecision<unknown>) =>
    notificationsExecutor.resume({ checkpoint: state, response: decision }, null, segment)
  return { self, bound, execution, segment, run, ok, failure, suspended, resume }
}

export function unattached() {
  const execution = scope()
  return { emit: () => undefined, signal: execution.context.signal } as never
}

export const selected = (cardId: string, optionId: string): ToolDecision<unknown> => ({
  kind: 'answer',
  value: { answers: [{ cardId, kind: 'selection', optionId }] },
})
