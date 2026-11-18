import {
  recipientKey,
  type Beat,
  type BoxEntry,
  type Destination,
  type DestinationRef,
  type InboxPage,
  type InboxQuery,
  type Marks,
  type NotificationRecord,
  type NotificationRef,
  type NotificationSummary,
  type NotificationView,
  type RecipientRef,
  type SendIdentity,
  type Subscription,
  type SubscriptionKey,
  type TenantId,
} from '@omne-harness/notification-contract'
import type { NotificationStore, StoreAnswer, StoreRead } from '../store.ts'
import { acceptSend } from '../transactions/accept.ts'
import {
  formBeatUnit,
  formStrongUnit,
  recordDelivery,
  remindStanding,
} from '../transactions/deliver.ts'
import { writeDestination } from '../transactions/destinations.ts'
import { markNotification } from '../transactions/mark.ts'
import { writeBeat, writeSubscription } from '../transactions/subscribe.ts'
import type { NotificationTxn, SendRecord, StoredUnit } from '../txn.ts'

/** One tenant's facts. Plain data, so a transaction is a copy that replaces the original. */
export type TenantFacts = {
  sends: Map<string, SendRecord>
  notifications: Map<string, NotificationRecord>
  recipients: Map<string, RecipientRef>
  subscriptions: Map<string, Subscription>
  beats: Map<string, Beat>
  destinations: Map<string, Destination>
  units: Map<string, StoredUnit>
  reminders: Set<string>
  sequence: number
}

const emptyFacts = (): TenantFacts => ({
  sends: new Map(),
  notifications: new Map(),
  recipients: new Map([['person', { kind: 'person' }]]),
  subscriptions: new Map(),
  beats: new Map(),
  destinations: new Map(),
  units: new Map(),
  reminders: new Set(),
  sequence: 0,
})

const sendKey = (source: string, eventId: string) => JSON.stringify([source, eventId])
const notificationKey = (recipient: RecipientRef, identity: SendIdentity) =>
  JSON.stringify([recipientKey(recipient), identity.source, identity.eventId])
export const subscriptionKey = (key: SubscriptionKey) =>
  JSON.stringify([recipientKey(key.recipient), key.source, key.type, key.scope])

const destinationKey = (ref: DestinationRef) =>
  JSON.stringify([recipientKey(ref.recipient), ref.id])
const reminderKey = (recipient: RecipientRef, item: string) =>
  JSON.stringify([recipientKey(recipient), item])
const unresolved = (marks: Marks) => marks.resolved === null && marks.supersededBy === null

function boxEntry(facts: TenantFacts, record: NotificationRecord): BoxEntry {
  const send = facts.sends.get(sendKey(record.identity.source, record.identity.eventId))!
  const { type, content } = send.event
  const { title, body, locator } = content
  const { source } = record.identity
  return { ...record, source, type, title, body, locator, external: send.external }
}

export function memoryTxn(facts: TenantFacts): NotificationTxn {
  const boxOf = (recipient: RecipientRef) =>
    [...facts.notifications.values()].filter(
      record => recipientKey(record.recipient) === recipientKey(recipient),
    )
  return {
    send: (source, eventId) => facts.sends.get(sendKey(source, eventId)) ?? null,
    insertSend(record) {
      facts.sends.set(sendKey(record.identity.source, record.identity.eventId), record)
    },
    recipients: () => [...facts.recipients.values()],
    ensureRecipient(recipient) {
      if (!facts.recipients.has(recipientKey(recipient)))
        facts.recipients.set(recipientKey(recipient), recipient)
    },
    subscriptionsFor: (source, type) =>
      [...facts.subscriptions.values()].filter(
        subscription => subscription.source === source && subscription.type === type,
      ),
    expireSubscription(key) {
      const current = facts.subscriptions.get(subscriptionKey(key))
      if (current !== undefined)
        facts.subscriptions.set(subscriptionKey(key), { ...current, expired: true })
    },
    subscription: key => facts.subscriptions.get(subscriptionKey(key)) ?? null,
    subscriptionsOf: recipient =>
      [...facts.subscriptions.values()].filter(
        subscription => recipientKey(subscription.recipient) === recipientKey(recipient),
      ),
    putSubscription(subscription) {
      facts.subscriptions.set(subscriptionKey(subscription), subscription)
    },
    deleteSubscription(key) {
      facts.subscriptions.delete(subscriptionKey(key))
    },
    beat: recipient => facts.beats.get(recipientKey(recipient)) ?? { kind: 'default' },
    setBeat(recipient, beat) {
      facts.beats.set(recipientKey(recipient), beat)
    },
    nextSequence: () => ++facts.sequence,
    notification: (recipient, identity) =>
      facts.notifications.get(notificationKey(recipient, identity)) ?? null,
    insertNotification(record) {
      facts.notifications.set(notificationKey(record.recipient, record.identity), record)
    },
    setMarks(recipient, identity, marks: Marks) {
      const key = notificationKey(recipient, identity)
      facts.notifications.set(key, { ...facts.notifications.get(key)!, marks })
    },
    sameKey: (recipient, source, replaceKey) =>
      boxOf(recipient).filter(
        record => record.identity.source === source && record.replaceKey === replaceKey,
      ),
    currentSequence: () => facts.sequence,
    pendingStrong: (recipient, after) =>
      boxOf(recipient)
        .filter(record => record.level === 'strong' && !record.quiet && record.sequence > after)
        .filter(record => unresolved(record.marks))
        .sort((a, b) => a.sequence - b.sequence)
        .map(record => boxEntry(facts, record)),
    unresolved: recipient =>
      boxOf(recipient)
        .filter(record => unresolved(record.marks))
        .sort((a, b) => a.sequence - b.sequence)
        .map(record => boxEntry(facts, record)),
    destinations: recipient =>
      [...facts.destinations.values()].filter(
        destination => recipientKey(destination.recipient) === recipientKey(recipient),
      ),
    putDestination(destination) {
      facts.destinations.set(destinationKey(destination), destination)
    },
    deleteDestination(ref) {
      facts.destinations.delete(destinationKey(ref))
    },
    unit: id => facts.units.get(id) ?? null,
    putUnit(unit) {
      facts.units.set(unit.id, unit)
    },
    reminded: (recipient, item) => facts.reminders.has(reminderKey(recipient, item)),
    insertReminder(recipient, item) {
      facts.reminders.add(reminderKey(recipient, item))
    },
  }
}

/** What the next commit or read does instead of its normal work. Used once, then cleared. */
export type MemoryFault = 'rolled-back' | 'unknown-lost' | 'unknown-applied' | 'read-unavailable'

export type MemoryStore = NotificationStore &
  Readonly<{
    /** Makes the next commit or read fail in the given way. */
    fail(fault: MemoryFault): void
    /** The number of commits that changed the facts. */
    commits(): number
    /** Direct access for arranging a test. */
    facts(tenant: TenantId): TenantFacts
  }>

const snapshot = (facts: TenantFacts) =>
  JSON.stringify(Object.values(facts).map(part => (typeof part === 'number' ? part : [...part])))

function summary(facts: TenantFacts, record: NotificationRecord): NotificationSummary {
  const send = facts.sends.get(sendKey(record.identity.source, record.identity.eventId))!
  const { identity, recipient, sequence, level, cause, acceptedAt, marks } = record
  return {
    identity,
    recipient,
    sequence,
    source: identity.source,
    type: send.event.type,
    title: send.event.content.title,
    level,
    cause,
    acceptedAt,
    marks,
  }
}

/** A reference repository: each commit runs a script on a copy of the tenant's facts and replaces them on success. */
export function createMemoryStore(): MemoryStore {
  const tenants = new Map<TenantId, TenantFacts>()
  let commitFault: Exclude<MemoryFault, 'read-unavailable'> | null = null
  let readFault = false
  let commits = 0
  const factsOf = (tenant: TenantId) => {
    if (!tenants.has(tenant)) tenants.set(tenant, emptyFacts())
    return tenants.get(tenant)!
  }
  const takeCommitFault = () => {
    const current = commitFault
    commitFault = null
    return current
  }

  async function commit<T>(
    tenant: TenantId,
    script: (txn: NotificationTxn) => T,
  ): Promise<StoreAnswer<T>> {
    const failure = takeCommitFault()
    if (failure === 'rolled-back') return { kind: 'rolled-back' }
    if (failure === 'unknown-lost') return { kind: 'unknown' }
    const working = structuredClone(factsOf(tenant))
    const before = snapshot(working)
    const value = script(memoryTxn(working))
    tenants.set(tenant, working)
    if (snapshot(working) !== before) commits += 1
    return failure === 'unknown-applied' ? { kind: 'unknown' } : { kind: 'committed', value }
  }

  function read<T>(tenant: TenantId, query: (facts: TenantFacts) => T): StoreRead<T> {
    if (readFault) {
      readFault = false
      return { kind: 'unavailable' }
    }
    return { kind: 'read', value: query(factsOf(tenant)) }
  }

  return {
    fail(next) {
      if (next === 'read-unavailable') readFault = true
      else commitFault = next
    },
    commits: () => commits,
    facts: factsOf,
    accept: (tenant, command) => commit(tenant, txn => acceptSend(txn, command)),
    mark: (tenant, command) => commit(tenant, txn => markNotification(txn, command)),
    subscribe: (tenant, command) => commit(tenant, txn => writeSubscription(txn, command)),
    setBeat: (tenant, command) =>
      commit(tenant, txn => {
        writeBeat(txn, command)
        return null
      }),
    subscription: async (tenant, key) =>
      read(tenant, facts => facts.subscriptions.get(subscriptionKey(key)) ?? null),
    subscriptions: async (tenant, recipient) =>
      read(tenant, facts => memoryTxn(facts).subscriptionsOf(recipient)),
    beat: async (tenant, recipient) => read(tenant, facts => memoryTxn(facts).beat(recipient)),
    destination: (tenant, command) => commit(tenant, txn => writeDestination(txn, command)),
    formStrong: (tenant, command) => commit(tenant, txn => formStrongUnit(txn, command)),
    formBeat: (tenant, command) => commit(tenant, txn => formBeatUnit(txn, command)),
    remind: (tenant, command) => commit(tenant, txn => remindStanding(txn, command)),
    recordDelivery: (tenant, command) => commit(tenant, txn => recordDelivery(txn, command)),
    destinations: async (tenant, recipient) =>
      read(tenant, facts => memoryTxn(facts).destinations(recipient)),
    delivery: async (tenant, now) =>
      read(tenant, facts => ({
        destinations: [...facts.destinations.values()],
        beats: [...facts.recipients.values()].map(recipient => ({
          recipient,
          beat: memoryTxn(facts).beat(recipient),
        })),
        due: [...facts.units.values()].filter(
          unit => unit.state === 'pending' && unit.dueAt <= now,
        ),
      })),
    pendingStrong: async (tenant, ref) =>
      read(tenant, facts => {
        const txn = memoryTxn(facts)
        const destination = txn.destinations(ref.recipient).find(entry => entry.id === ref.id)
        return destination === undefined
          ? []
          : txn.pendingStrong(ref.recipient, destination.strongCursor)
      }),
    unresolved: async (tenant, recipient) =>
      read(tenant, facts => memoryTxn(facts).unresolved(recipient)),
    subscriptionsFor: async (tenant, source, type) =>
      read(tenant, facts => memoryTxn(facts).subscriptionsFor(source, type)),
    reminded: async (tenant, recipient) =>
      read(tenant, facts =>
        [...facts.reminders]
          .map(key => JSON.parse(key) as [string, string])
          .filter(([owner]) => owner === recipientKey(recipient))
          .map(([, item]) => item),
      ),
    send: async (tenant, identity) =>
      read(tenant, facts => {
        const record = facts.sends.get(sendKey(identity.source, identity.eventId))
        if (record === undefined) return null
        const notifications = record.recipients.map(recipient => ({
          recipient,
          marks: facts.notifications.get(notificationKey(recipient, identity))!.marks,
        }))
        return { record, notifications }
      }),
    box: async (tenant, query: InboxQuery) =>
      read(tenant, (facts): InboxPage => {
        const matching = [...facts.notifications.values()]
          .filter(record => recipientKey(record.recipient) === recipientKey(query.recipient))
          .filter(record => query.filter === 'all' || unresolved(record.marks))
          .filter(record => query.after === null || record.sequence > query.after)
          .sort((a, b) => a.sequence - b.sequence)
        const entries = matching.slice(0, query.limit).map(record => summary(facts, record))
        const next = matching.length > query.limit ? entries.at(-1)!.sequence : null
        return { entries, next }
      }),
    notification: async (tenant, ref: NotificationRef) =>
      read(tenant, (facts): NotificationView | null => {
        const record = facts.notifications.get(notificationKey(ref.recipient, ref.identity))
        if (record === undefined) return null
        const { event } = facts.sends.get(sendKey(ref.identity.source, ref.identity.eventId))!
        const { subject, at, content } = event
        return {
          ...summary(facts, record),
          subject,
          at,
          body: content.body,
          locator: content.locator,
        }
      }),
  }
}
