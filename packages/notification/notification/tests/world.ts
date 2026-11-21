import {
  channelNameSchema,
  eventTypeNameSchema,
  sourceNameSchema,
  type EventTypeDeclaration,
  type RecipientRef,
  type SendRequestInput,
  type SourceDeclaration,
  type TenantId,
} from '@omne-harness/notification-contract'
import {
  createCatalog,
  createChannelRegistry,
  createDelivery,
  createDestinations,
  createInbox,
  createSending,
  createSourceRegistry,
  createSubscriptions,
  type RecipientDefaults,
} from '@omne-harness/notification'
import {
  context,
  createMemoryStore,
  fakeAuthority,
  fakeChannel,
  fakeClock,
  fakeConsent,
  fakeHints,
  fakeStanding,
} from '@omne-harness/notification/testing'

export const person: RecipientRef = { kind: 'person' }
export const agent = (ref: string): RecipientRef => ({ kind: 'agent', ref })
export const source = sourceNameSchema.parse('demo.things')
export const typeName = eventTypeNameSchema.parse('changed')

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

export const declaration = (...types: EventTypeDeclaration[]): SourceDeclaration => ({
  name: source,
  label: 'Demo',
  types: types.length === 0 ? [declared()] : types,
})

export function request(
  eventId: string,
  event: Partial<SendRequestInput['event']> = {},
  tenant = 't1',
): SendRequestInput {
  return {
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
      ...event,
    },
  }
}

export const defaults: RecipientDefaults = {
  person: { channel: channelNameSchema.parse('in-app'), minLevel: 'weak' },
  agent: { channel: channelNameSchema.parse('session'), minLevel: 'weak' },
}
export const MINUTE = 60_000

export function world(...types: EventTypeDeclaration[]) {
  const ctx = context()
  const store = createMemoryStore()
  const authority = fakeAuthority()
  const clock = fakeClock()
  const sources = createSourceRegistry()
  const unregister = sources.register(declaration(...types))
  const wakes: TenantId[] = []
  const sending = createSending({
    authority,
    store,
    sources,
    clock,
    limits: { bodyLength: 1000, causalDepth: 3 },
    defaults,
    accepted: tenant => wakes.push(tenant),
  })
  const inbox = createInbox({ authority, store, clock, pageLimit: 50 })
  const consent = fakeConsent()
  const subscriptions = createSubscriptions({
    authority,
    store,
    sources,
    consent,
    clock,
    defaults,
    beatRange: { min: 5, max: 1440 },
  })
  const channels = createChannelRegistry()
  const inApp = fakeChannel('in-app')
  const session = fakeChannel('session', { defaultMinIntervalMs: 10 * MINUTE })
  const removeInApp = channels.register(inApp)
  channels.register(session)
  const destinations = createDestinations({ authority, store, channels, defaults })
  const catalog = createCatalog({ authority, sources, channels })
  const standing = fakeStanding()
  const hints = fakeHints()
  const delivery = createDelivery({
    store,
    channels,
    sources,
    authority,
    standing,
    clock,
    hints,
    defaults,
    config: {
      listLimit: 3,
      retry: { maxAttempts: 3, backoffMs: [MINUTE] },
      deliverTimeoutMs: 20,
      defaultBeatMinutes: 30,
    },
  })
  const advance = () => delivery.advance(ctx.tenant)
  const ref = (eventId: string, recipient: RecipientRef = person) => ({
    recipient,
    identity: { tenant: ctx.tenant, source, eventId },
  })
  const list = async (recipient: RecipientRef = person, filter: 'all' | 'unresolved' = 'all') => {
    const page = await inbox.list(ctx, { recipient, filter, after: null, limit: 50 })
    if (page.kind !== 'done') throw new Error(`list answered ${page.kind}`)
    return page.value.entries
  }
  const as = (ref: string) => context('t1', { kind: 'agent', recipient: { kind: 'agent', ref } })
  return {
    store,
    authority,
    clock,
    sources,
    unregister,
    wakes,
    sending,
    inbox,
    consent,
    subscriptions,
    channels,
    inApp,
    session,
    removeInApp,
    destinations,
    catalog,
    standing,
    hints,
    delivery,
    advance,
    ctx,
    as,
    ref,
    list,
  }
}
