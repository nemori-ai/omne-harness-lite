import {
  beatSlot,
  findEventType,
  planBeat,
  planStrong,
  recipientKey,
  selectRecipients,
  type Beat,
  type BoxEntry,
  type ChannelContribution,
  type DeliveryResult,
  type DeliveryUnit,
  type Destination,
  type Disclosure,
  type Instant,
  type RecipientRef,
  type RetryPolicy,
  type StandingItem,
  type StandingRead,
  type TenantId,
} from '@omne-harness/notification-contract'
import type { ClockHints, Clock, NotificationAuthority, StandingItems } from './ports.ts'
import type { NotificationChannels, NotificationSources } from './registries.ts'
import type { DeliveryState, NotificationStore, StoreAnswer } from './store.ts'
import type { FormResult } from './transactions/deliver.ts'
import { withBuiltin, type RecipientDefaults } from './transactions/destinations.ts'
import { unitOf } from './txn.ts'

export type DeliveryConfig = Readonly<{
  listLimit: number
  retry: RetryPolicy
  deliverTimeoutMs: number
  /** The beat of a recipient that set none, in minutes. Null: no beat. */
  defaultBeatMinutes: number | null
}>

export type DeliveryDependencies = Readonly<{
  store: NotificationStore
  channels: NotificationChannels
  sources: NotificationSources
  authority: NotificationAuthority
  standing: StandingItems
  clock: Clock
  hints: ClockHints
  defaults: RecipientDefaults
  config: DeliveryConfig
}>

/** Pushes what is in the inboxes to the destinations. Driven by wake-ups, decided by the store. */
export interface NotificationDelivery {
  /** Does everything that is due for one tenant now. Calls for one tenant never overlap. */
  advance(tenant: TenantId): Promise<void>
}

const UNKNOWN: DeliveryResult = { kind: 'unknown' }
const RESULT_KINDS = ['delivered', 'failed', 'unknown']

/** Asks a channel once. A throw, a timeout or an answer of no known kind is `unknown`. */
function attempt(
  channel: ChannelContribution,
  delivery: Parameters<ChannelContribution['deliver']>[0],
  timeoutMs: number,
): Promise<DeliveryResult> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(UNKNOWN), timeoutMs)
    Promise.resolve()
      .then(() => channel.deliver(delivery))
      .then(
        result => resolve(RESULT_KINDS.includes(result?.kind) ? result : UNKNOWN),
        () => resolve(UNKNOWN),
      )
      .finally(() => clearTimeout(timer))
  })
}

type Standing = Readonly<{
  /** Items of a recipient that were open at an instant, or null when they could not be read. */
  openAt(recipient: RecipientRef, instant: Instant): number | null
  /** The items each recipient is to be reminded of at once. */
  strong: readonly Readonly<{ recipient: RecipientRef; item: StandingItem }>[]
}>

const UNREADABLE: Standing = { openAt: () => null, strong: [] }
const minutesOf = (beat: Beat, fallback: number | null) =>
  beat.kind === 'every' ? beat.minutes : beat.kind === 'off' ? null : fallback

export function createDelivery(deps: DeliveryDependencies): NotificationDelivery {
  const { store, channels, config } = deps

  async function deliver(tenant: TenantId, unit: DeliveryUnit, destination: Destination | null) {
    const record = (result: DeliveryResult) =>
      store.recordDelivery(tenant, {
        unit: unit.id,
        result,
        policy: config.retry,
        now: deps.clock.now(),
      })
    if (destination === null) {
      await record({ kind: 'failed', reason: 'destination-removed', retryable: false })
      return
    }
    const channel = channels.lookup(destination.channel)
    if (!destination.enabled || channel.kind !== 'registered') return
    const { recipient, address } = destination
    const result = await attempt(
      channel.channel,
      { recipient, address, unit },
      config.deliverTimeoutMs,
    )
    const answer = await record(result)
    if (answer.kind === 'committed' && answer.value.kind === 'recorded') {
      const { plan } = answer.value
      if (plan.kind === 'retry') deps.hints.wakeAt(tenant, plan.at)
    }
  }

  async function formed(
    tenant: TenantId,
    destination: Destination,
    answer: StoreAnswer<FormResult>,
  ) {
    if (answer.kind !== 'committed') return
    if (answer.value.kind === 'wait') deps.hints.wakeAt(tenant, answer.value.until)
    if (answer.value.kind === 'formed') await deliver(tenant, answer.value.unit, destination)
  }

  async function disclosureFor(
    tenant: TenantId,
    destination: Destination,
    channel: ChannelContribution,
  ): Promise<Disclosure | 'unavailable'> {
    if (!channel.leavesSystem) return { kind: 'full' }
    try {
      return await deps.authority.disclosure(tenant, destination)
    } catch {
      return 'unavailable'
    }
  }

  async function strong(
    tenant: TenantId,
    destination: Destination,
    channel: ChannelContribution,
    now: Instant,
  ) {
    const pending = await store.pendingStrong(tenant, destination)
    if (pending.kind === 'unavailable') return
    const minIntervalMs = channel.defaultMinIntervalMs
    const facts = { ...destination, channelPresent: true, minIntervalMs }
    const plan = planStrong(now, facts, pending.value)
    if (plan.kind === 'wait') deps.hints.wakeAt(tenant, plan.until)
    if (plan.kind !== 'form') return
    const disclosure = await disclosureFor(tenant, destination, channel)
    if (disclosure === 'unavailable') return
    const { listLimit } = config
    const { defaults } = deps
    const command = { destination, now, minIntervalMs, listLimit, disclosure, defaults }
    await formed(tenant, destination, await store.formStrong(tenant, command))
  }

  async function beat(
    tenant: TenantId,
    destination: Destination,
    minutes: number,
    box: readonly BoxEntry[],
    standingOpen: number | null,
    now: Instant,
  ) {
    const slot = beatSlot(now, minutes)
    const facts = { ...destination, channelPresent: true, minIntervalMs: 0 }
    if (planBeat(slot, facts, box, standingOpen).kind !== 'form') return
    const { listLimit } = config
    const command = { destination, slot, now, listLimit, standingOpen, defaults: deps.defaults }
    await formed(tenant, destination, await store.formBeat(tenant, command))
  }

  async function readStanding(
    tenant: TenantId,
    state: DeliveryState,
    now: Instant,
  ): Promise<Standing> {
    let read: StandingRead
    try {
      read = await deps.standing.read(tenant)
    } catch {
      return UNREADABLE
    }
    if (read.kind !== 'ok') return UNREADABLE
    const open = new Map<string, Instant[]>()
    const strongItems: { recipient: RecipientRef; item: StandingItem }[] = []
    const recipients = state.beats.map(entry => entry.recipient)
    for (const item of read.items) {
      const source = deps.sources.lookup(item.source)
      const declared =
        source.kind === 'registered' ? findEventType(source.declaration, item.type) : null
      if (declared === null || declared.kind.kind !== 'standing') continue
      const subscriptions = await store.subscriptionsFor(tenant, item.source, item.type)
      if (subscriptions.kind === 'unavailable') return UNREADABLE
      const addressing = { subject: item.subject, named: [], origin: null }
      for (const selected of selectRecipients(
        addressing,
        declared,
        recipients,
        subscriptions.value,
        now,
      )) {
        const key = recipientKey(selected.recipient)
        open.set(key, [...(open.get(key) ?? []), item.since])
        if (selected.level === 'strong') strongItems.push({ recipient: selected.recipient, item })
      }
    }
    const openAt = (recipient: RecipientRef, instant: Instant) =>
      (open.get(recipientKey(recipient)) ?? []).filter(since => since <= instant).length
    return { openAt, strong: strongItems }
  }

  async function remind(
    tenant: TenantId,
    destinations: readonly Destination[],
    standing: Standing,
    now: Instant,
  ) {
    const done = new Map<string, readonly string[] | null>()
    for (const { recipient, item } of standing.strong) {
      const key = recipientKey(recipient)
      if (!done.has(key)) {
        const read = await store.reminded(tenant, recipient)
        done.set(key, read.kind === 'read' ? read.value : null)
      }
      const reminded = done.get(key)
      if (reminded === null || reminded === undefined || reminded.includes(item.id)) continue
      const answer = await store.remind(tenant, { recipient, item, defaults: deps.defaults, now })
      if (answer.kind !== 'committed') continue
      for (const unit of answer.value)
        await deliver(tenant, unit, find(destinations, unit.destination))
    }
  }

  async function run(tenant: TenantId): Promise<void> {
    const now = deps.clock.now()
    const read = await store.delivery(tenant, now)
    if (read.kind === 'unavailable') return
    const state = read.value
    const destinations = state.beats.flatMap(({ recipient }) => {
      const key = recipientKey(recipient)
      const own = state.destinations.filter(entry => recipientKey(entry.recipient) === key)
      return withBuiltin(recipient, own, deps.defaults)
    })
    for (const due of state.due)
      await deliver(tenant, unitOf(due), find(destinations, due.destination))
    const standing = await readStanding(tenant, state, now)
    const boxes = new Map<string, readonly BoxEntry[] | null>()
    for (const destination of destinations) {
      const channel = channels.lookup(destination.channel)
      if (!destination.enabled || channel.kind !== 'registered') continue
      await strong(tenant, destination, channel.channel, now)
      const key = recipientKey(destination.recipient)
      const own = state.beats.find(entry => recipientKey(entry.recipient) === key)
      const minutes = minutesOf(own?.beat ?? { kind: 'default' }, config.defaultBeatMinutes)
      if (minutes === null || destination.minLevel !== 'weak') continue
      const next = beatSlot(now, minutes).index + 1
      deps.hints.wakeAt(tenant, new Date(next * minutes * 60_000).toISOString() as Instant)
      if (!boxes.has(key)) {
        const box = await store.unresolved(tenant, destination.recipient)
        boxes.set(key, box.kind === 'read' ? box.value : null)
      }
      const box = boxes.get(key)
      if (box === null || box === undefined) continue
      const open = standing.openAt(destination.recipient, beatSlot(now, minutes).start)
      await beat(tenant, destination, minutes, box, open, now)
    }
    await remind(tenant, destinations, standing, now)
  }

  const running = new Map<TenantId, { again: boolean; done: Promise<void> }>()
  return {
    advance(tenant) {
      const current = running.get(tenant)
      if (current !== undefined) {
        current.again = true
        return current.done
      }
      const turn = { again: false, done: Promise.resolve() }
      turn.done = (async () => {
        try {
          do {
            turn.again = false
            await run(tenant)
          } while (turn.again)
        } finally {
          running.delete(tenant)
        }
      })()
      running.set(tenant, turn)
      return turn.done
    },
  }
}

function find(
  destinations: readonly Destination[],
  ref: DeliveryUnit['destination'],
): Destination | null {
  return (
    destinations.find(
      destination =>
        destination.id === ref.id &&
        recipientKey(destination.recipient) === recipientKey(ref.recipient),
    ) ?? null
  )
}
