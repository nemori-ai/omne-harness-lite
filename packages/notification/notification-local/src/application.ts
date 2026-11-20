import {
  type NotificationCatalog,
  type NotificationChangeFeed,
  type NotificationDestinations,
  type NotificationInbox,
  type NotificationSending,
  type NotificationSubscriptions,
  type StandingRead,
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
  type Clock,
  type NotificationAuthority,
  type NotificationChannels,
  type NotificationSources,
  type StandingItems,
  type SubscriptionConsents,
} from '@omne-harness/notification'
import { createChanges, inAppChannel, observed } from './changes.ts'
import { createWakeUps, realTimers, type Timers } from './hints.ts'
import { parsePolicy } from './policy.ts'
import { AGENT_POSTS, blockedItems, NOTIFICATION_SYSTEM } from './sources.ts'
import { createSqlNotificationStore, type NotificationSqlOptions } from './storage/store.ts'

export type NotificationLocalOptions = Readonly<{
  /** Parsed against the policy schema. A missing or invalid value refuses to load. */
  policy: unknown
  sql: NotificationSqlOptions &
    Readonly<{
      /** Every tenant that may hold notifications now. Null: not known now, so nothing is scanned. */
      tenants(): Promise<readonly TenantId[] | null>
    }>
  ports: Readonly<{
    authority: NotificationAuthority
    consent: SubscriptionConsents
    standing: StandingItems
  }>
  clock: Clock
  timers?: Timers
  report?: (error: unknown) => void
}>

export type NotificationFaces = Readonly<{
  sending: NotificationSending
  inbox: NotificationInbox
  subscriptions: NotificationSubscriptions
  destinations: NotificationDestinations
  catalog: NotificationCatalog
}>

export type NotificationLocalApplication = NotificationFaces &
  Readonly<{
    sources: NotificationSources
    channels: NotificationChannels
    changes: NotificationChangeFeed
    /** The standing items this group publishes about itself for one tenant: its blocked destinations. */
    blocked(tenant: TenantId): Promise<StandingRead>
    /** Does what is due for every tenant. Runs at start and on an interval, so a lost wake-up is made up. */
    scan(): Promise<void>
    /** Stops admitting, lets what is in flight end, then withdraws its registrations and timers. Facts stay. */
    close(): Promise<void>
  }>

const STOPPED = { kind: 'basis-unavailable' } as const

function createLifetime() {
  const pending = new Set<Promise<unknown>>()
  let stopping = false
  return {
    get stopping() {
      return stopping
    },
    track<T>(work: Promise<T>): Promise<T> {
      pending.add(work)
      const done = () => void pending.delete(work)
      work.then(done, done)
      return work
    },
    async drain(): Promise<void> {
      stopping = true
      await Promise.allSettled(pending)
    },
  }
}

/** Wraps every operation of a face: it answers basis-unavailable once the stop began, and is counted while it runs. */
function guarded<F extends object>(face: F, lifetime: ReturnType<typeof createLifetime>): F {
  const wrapped: Record<string, unknown> = {}
  for (const [name, operation] of Object.entries(face)) {
    const run = operation as (...args: unknown[]) => Promise<unknown>
    wrapped[name] = (...args: unknown[]) =>
      lifetime.stopping ? Promise.resolve(STOPPED) : lifetime.track(run(...args))
  }
  return wrapped as F
}

export async function createNotificationLocalApplication(
  options: NotificationLocalOptions,
): Promise<NotificationLocalApplication> {
  const policy = parsePolicy(options.policy)
  const { clock } = options
  const report = options.report ?? (() => {})
  const { authority, consent, standing } = options.ports
  const defaults = policy.recipients
  const changes = createChanges(report)
  const store = observed(createSqlNotificationStore(options.sql), changes)
  const catalogChanged = () => changes.emit({ kind: 'catalog' })
  const sources = createSourceRegistry(catalogChanged)
  const channels = createChannelRegistry(catalogChanged)
  const lifetime = createLifetime()

  const advance = (tenant: TenantId) => {
    if (!lifetime.stopping) lifetime.track(delivery.advance(tenant)).catch(report)
  }
  const hints = createWakeUps(clock, options.timers ?? realTimers, advance)
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
      listLimit: policy.listLimit,
      retry: policy.retry,
      deliverTimeoutMs: policy.deliverTimeoutMs,
      defaultBeatMinutes: policy.beat.defaultMinutes,
    },
  })

  const withdraw = [
    sources.register(AGENT_POSTS),
    sources.register(NOTIFICATION_SYSTEM),
    channels.register(inAppChannel(changes)),
  ]

  async function scan(): Promise<void> {
    const tenants = await options.sql.tenants()
    if (tenants === null) return
    await Promise.all(tenants.map(tenant => lifetime.track(delivery.advance(tenant))))
  }
  const timers = options.timers ?? realTimers
  let periodic: unknown
  const schedule = () => {
    periodic = timers.set(() => {
      if (lifetime.stopping) return
      lifetime.track(scan()).catch(report)
      schedule()
    }, policy.scanIntervalMs)
  }

  const limits = { bodyLength: policy.bodyLength, causalDepth: policy.causalDepth }
  const beatRange = { min: policy.beat.minMinutes, max: policy.beat.maxMinutes }
  const faces: NotificationFaces = {
    sending: createSending({
      authority,
      store,
      sources,
      clock,
      limits,
      defaults,
      accepted: advance,
    }),
    inbox: createInbox({ authority, store, clock, pageLimit: policy.pageLimit }),
    subscriptions: createSubscriptions({
      authority,
      store,
      sources,
      consent,
      clock,
      defaults,
      beatRange,
    }),
    destinations: createDestinations({ authority, store, channels, defaults }),
    catalog: createCatalog({ authority, sources, channels }),
  }

  let closing: Promise<void> | undefined
  await scan()
  schedule()
  return {
    sending: guarded(faces.sending, lifetime),
    inbox: guarded(faces.inbox, lifetime),
    subscriptions: guarded(faces.subscriptions, lifetime),
    destinations: guarded(faces.destinations, lifetime),
    catalog: guarded(faces.catalog, lifetime),
    sources,
    channels,
    changes: { subscribe: changes.subscribe },
    async blocked(tenant) {
      const state = await store.delivery(tenant, clock.now())
      if (state.kind === 'unavailable') return { kind: 'unknown' }
      return { kind: 'ok', items: blockedItems(state.value.destinations) }
    },
    scan,
    close() {
      closing ??= (async () => {
        await lifetime.drain()
        timers.clear(periodic)
        hints.stop()
        for (const undo of withdraw.reverse()) undo()
        changes.close()
      })()
      return closing
    },
  }
}
