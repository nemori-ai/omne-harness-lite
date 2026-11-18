import {
  beatSlot,
  findEventType,
  planBeat,
  planStrong,
  recipientKey,
  sameRecipient,
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

type Reminder = Readonly<{ recipient: RecipientRef; item: StandingItem }>

type Standing = Readonly<{
  /** Items of a recipient that were open at an instant, or null when they could not be read. */
  openAt(recipient: RecipientRef, instant: Instant): number | null
  strong: readonly Reminder[]
}>

const UNREADABLE: Standing = { openAt: () => null, strong: [] }
const minutesOf = (beat: Beat, fallback: number | null) =>
  beat.kind === 'every' ? beat.minutes : beat.kind === 'off' ? null : fallback
const startOf = (slot: number, minutes: number) =>
  new Date(slot * minutes * 60_000).toISOString() as Instant

type Pass = Readonly<{
  tenant: TenantId
  now: Instant
  recipients: readonly RecipientRef[]
  destinations: readonly Destination[]
  beatMinutes(recipient: RecipientRef): number | null
  /** The unresolved notifications of a recipient, or null when they cannot be read. Read at most once. */
  box(recipient: RecipientRef): Promise<readonly BoxEntry[] | null>
}>

export function createDelivery(deps: DeliveryDependencies): NotificationDelivery {
  const { store, channels, config, defaults } = deps

  function passOf(tenant: TenantId, now: Instant, state: DeliveryState): Pass {
    const boxes = new Map<string, Promise<readonly BoxEntry[] | null>>()
    const beats = new Map(state.beats.map(entry => [recipientKey(entry.recipient), entry.beat]))
    const recipients = state.beats.map(entry => entry.recipient)
    const own = (recipient: RecipientRef) =>
      state.destinations.filter(entry => sameRecipient(entry.recipient, recipient))
    return {
      tenant,
      now,
      recipients,
      destinations: recipients.flatMap(recipient =>
        withBuiltin(recipient, own(recipient), defaults),
      ),
      beatMinutes: recipient =>
        minutesOf(
          beats.get(recipientKey(recipient)) ?? { kind: 'default' },
          config.defaultBeatMinutes,
        ),
      box(recipient) {
        const key = recipientKey(recipient)
        const read = async () => {
          const box = await store.unresolved(tenant, recipient)
          return box.kind === 'read' ? box.value : null
        }
        if (!boxes.has(key)) boxes.set(key, read())
        return boxes.get(key)!
      },
    }
  }

  const destinationOf = (pass: Pass, ref: DeliveryUnit['destination']) =>
    pass.destinations.find(
      entry => entry.id === ref.id && sameRecipient(entry.recipient, ref.recipient),
    ) ?? null

  async function deliver(pass: Pass, unit: DeliveryUnit): Promise<void> {
    const destination = destinationOf(pass, unit.destination)
    const record = (result: DeliveryResult) => {
      const command = { unit: unit.id, result, policy: config.retry, now: deps.clock.now() }
      return store.recordDelivery(pass.tenant, command)
    }
    if (destination === null) {
      await record({ kind: 'failed', reason: 'destination-removed', retryable: false })
      return
    }
    const channel = channels.lookup(destination.channel)
    if (!destination.enabled || channel.kind !== 'registered') return
    const { recipient, address } = destination
    const delivery = { recipient, address, unit }
    const answer = await record(await attempt(channel.channel, delivery, config.deliverTimeoutMs))
    if (answer.kind !== 'committed' || answer.value.kind !== 'recorded') return
    const { plan } = answer.value
    if (plan.kind === 'retry') deps.hints.wakeAt(pass.tenant, plan.at)
  }

  async function formed(pass: Pass, answer: StoreAnswer<FormResult>): Promise<void> {
    if (answer.kind !== 'committed') return
    if (answer.value.kind === 'wait') deps.hints.wakeAt(pass.tenant, answer.value.until)
    if (answer.value.kind === 'formed') await deliver(pass, answer.value.unit)
  }

  async function disclosureFor(
    pass: Pass,
    destination: Destination,
    channel: ChannelContribution,
  ): Promise<Disclosure | 'unavailable'> {
    if (!channel.leavesSystem) return { kind: 'full' }
    try {
      return await deps.authority.disclosure(pass.tenant, destination)
    } catch {
      return 'unavailable'
    }
  }

  async function strong(pass: Pass, destination: Destination, channel: ChannelContribution) {
    const pending = await store.pendingStrong(pass.tenant, destination)
    if (pending.kind === 'unavailable') return
    const minIntervalMs = channel.defaultMinIntervalMs
    const facts = { ...destination, channelPresent: true, minIntervalMs }
    const plan = planStrong(pass.now, facts, pending.value)
    if (plan.kind === 'wait') deps.hints.wakeAt(pass.tenant, plan.until)
    if (plan.kind !== 'form') return
    const disclosure = await disclosureFor(pass, destination, channel)
    if (disclosure === 'unavailable') return
    const { now } = pass
    const command = {
      destination,
      now,
      minIntervalMs,
      listLimit: config.listLimit,
      disclosure,
      defaults,
    }
    await formed(pass, await store.formStrong(pass.tenant, command))
  }

  async function beat(pass: Pass, destination: Destination, standing: Standing) {
    const minutes = pass.beatMinutes(destination.recipient)
    if (minutes === null || destination.minLevel !== 'weak') return
    const slot = beatSlot(pass.now, minutes)
    deps.hints.wakeAt(pass.tenant, startOf(slot.index + 1, minutes))
    const box = await pass.box(destination.recipient)
    if (box === null) return
    const standingOpen = standing.openAt(destination.recipient, slot.start)
    const facts = { ...destination, channelPresent: true, minIntervalMs: 0 }
    if (planBeat(slot, facts, box, standingOpen).kind !== 'form') return
    const { now } = pass
    const command = { destination, slot, now, listLimit: config.listLimit, standingOpen, defaults }
    await formed(pass, await store.formBeat(pass.tenant, command))
  }

  /** Who a standing item is for. Null: it cannot be decided now. */
  async function addressees(pass: Pass, item: StandingItem) {
    const source = deps.sources.lookup(item.source)
    const declared =
      source.kind === 'registered' ? findEventType(source.declaration, item.type) : null
    if (declared?.kind.kind !== 'standing') return []
    const subscriptions = await store.subscriptionsFor(pass.tenant, item.source, item.type)
    if (subscriptions.kind === 'unavailable') return null
    const addressing = { subject: item.subject, named: [], origin: null }
    return selectRecipients(addressing, declared, pass.recipients, subscriptions.value, pass.now)
  }

  async function readStanding(pass: Pass): Promise<Standing> {
    let read: StandingRead
    try {
      read = await deps.standing.read(pass.tenant)
    } catch {
      return UNREADABLE
    }
    if (read.kind !== 'ok') return UNREADABLE
    const open = new Map<string, Instant[]>()
    const strongItems: Reminder[] = []
    for (const item of read.items) {
      const selected = await addressees(pass, item)
      if (selected === null) return UNREADABLE
      for (const { recipient, level } of selected) {
        const key = recipientKey(recipient)
        open.set(key, [...(open.get(key) ?? []), item.since])
        if (level === 'strong') strongItems.push({ recipient, item })
      }
    }
    const openAt = (recipient: RecipientRef, instant: Instant) =>
      (open.get(recipientKey(recipient)) ?? []).filter(since => since <= instant).length
    return { openAt, strong: strongItems }
  }

  async function remind(pass: Pass, { recipient, item }: Reminder): Promise<void> {
    const reminded = await store.reminded(pass.tenant, recipient)
    if (reminded.kind === 'unavailable' || reminded.value.includes(item.id)) return
    const answer = await store.remind(pass.tenant, { recipient, item, defaults, now: pass.now })
    if (answer.kind !== 'committed') return
    for (const unit of answer.value) await deliver(pass, unit)
  }

  async function run(tenant: TenantId): Promise<void> {
    const now = deps.clock.now()
    const read = await store.delivery(tenant, now)
    if (read.kind === 'unavailable') return
    const pass = passOf(tenant, now, read.value)
    for (const due of read.value.due) await deliver(pass, unitOf(due))
    const standing = await readStanding(pass)
    for (const destination of pass.destinations) {
      const channel = channels.lookup(destination.channel)
      if (!destination.enabled || channel.kind !== 'registered') continue
      await strong(pass, destination, channel.channel)
      await beat(pass, destination, standing)
    }
    for (const reminder of standing.strong) await remind(pass, reminder)
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
