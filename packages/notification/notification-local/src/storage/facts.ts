import { z } from 'zod'
import {
  recipientKey,
  recipientRefSchema,
  type Beat,
  type BoxEntry,
  type NotificationRecord,
  type RecipientRef,
  type SendIdentity,
  type SubscriptionKey,
} from '@omne-harness/notification-contract'
import type { NotificationTxn, SendRecord } from '@omne-harness/notification'
import type { QueryRows, SqlValue } from '@omne-harness/sql-contract/worker'
import {
  beatSchema,
  destinationSchema,
  notificationRecordSchema,
  ROW_LIMIT,
  sendRecordSchema,
  storedUnitSchema,
  subscriptionSchema,
} from './schema.ts'

/** What both the participant and the read handler are given: one statement at a time, inside one transaction. */
export type SqlPort = Readonly<{ execute(sql: string, params: readonly SqlValue[]): QueryRows }>

const PERSON: RecipientRef = { kind: 'person' }
const text = z.string()

/** Runs a SELECT with the row limit. A result that reaches past the limit fails instead of being cut. */
export function select(port: SqlPort, sql: string, params: readonly SqlValue[]): QueryRows['rows'] {
  const found = port.execute(`${sql} LIMIT ${ROW_LIMIT + 1}`, params).rows
  if (found.length > ROW_LIMIT) throw new Error('more rows than one statement may return')
  return found
}

/** Every stored row is parsed where it is read: a row that does not fit its schema fails the read. */
function rows<T>(
  port: SqlPort,
  schema: z.ZodType<T>,
  sql: string,
  params: readonly SqlValue[],
): T[] {
  return select(port, sql, params).map(row => schema.parse(JSON.parse(text.parse(row[0]))))
}

const one = <T>(found: readonly T[]): T | null => found[0] ?? null
const unresolved = (record: NotificationRecord) =>
  record.marks.resolved === null && record.marks.supersededBy === null ? 1 : 0
const scopeKey = (key: SubscriptionKey) => JSON.stringify(key.scope)
const subscriptionParams = (key: SubscriptionKey) => [
  recipientKey(key.recipient),
  key.source,
  key.type,
  scopeKey(key),
]

export function boxEntry(record: NotificationRecord, send: SendRecord): BoxEntry {
  const { type, content } = send.event
  const { title, body, locator } = content
  return {
    ...record,
    source: record.identity.source,
    type,
    title,
    body,
    locator,
    external: send.external,
  }
}

const BOX =
  'SELECT n.record, s.record FROM nt_notifications n JOIN nt_sends s ON s.source = n.source AND s.event_id = n.event_id'

function entries(port: SqlPort, where: string, params: readonly SqlValue[]): BoxEntry[] {
  return select(port, `${BOX} WHERE ${where} ORDER BY n.sequence ASC`, params).map(row =>
    boxEntry(
      notificationRecordSchema.parse(JSON.parse(text.parse(row[0]))),
      sendRecordSchema.parse(JSON.parse(text.parse(row[1]))),
    ),
  )
}

export function sendOf(port: SqlPort, source: string, eventId: string): SendRecord | null {
  const sql = 'SELECT record FROM nt_sends WHERE source = ? AND event_id = ?'
  return one(rows(port, sendRecordSchema, sql, [source, eventId]))
}

export function beatOf(port: SqlPort, recipient: RecipientRef): Beat {
  const sql = 'SELECT beat FROM nt_beats WHERE recipient = ?'
  return one(rows(port, beatSchema, sql, [recipientKey(recipient)])) ?? { kind: 'default' }
}

/** The person is a recipient of every tenant, written or not. */
export function recipientsOf(port: SqlPort): RecipientRef[] {
  const stored = rows(
    port,
    recipientRefSchema,
    'SELECT record FROM nt_recipients ORDER BY rowid',
    [],
  )
  return stored.some(recipient => recipient.kind === 'person') ? stored : [PERSON, ...stored]
}

export function currentSequence(port: SqlPort): number {
  const [row] = select(port, "SELECT value FROM nt_counters WHERE name = 'sequence'", [])
  return row === undefined ? 0 : Number(z.bigint().or(z.number()).parse(row[0]))
}

/** One tenant's facts over one SQL transaction. The scripts of the domain run on it unchanged. */
export function sqlTxn(port: SqlPort): NotificationTxn {
  const notification = (recipient: RecipientRef, identity: SendIdentity) =>
    one(
      rows(
        port,
        notificationRecordSchema,
        'SELECT record FROM nt_notifications WHERE recipient = ? AND source = ? AND event_id = ?',
        [recipientKey(recipient), identity.source, identity.eventId],
      ),
    )
  const writeNotification = (record: NotificationRecord) => {
    const { identity, recipient, sequence, level, quiet, replaceKey } = record
    port.execute(
      'INSERT INTO nt_notifications (recipient, source, event_id, sequence, strong, quiet, unresolved, replace_key, record) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(recipient, source, event_id) DO UPDATE SET unresolved = excluded.unresolved, record = excluded.record',
      [
        recipientKey(recipient),
        identity.source,
        identity.eventId,
        sequence,
        level === 'strong' ? 1 : 0,
        quiet ? 1 : 0,
        unresolved(record),
        replaceKey,
        JSON.stringify(record),
      ],
    )
  }
  return {
    send: (source, eventId) => sendOf(port, source, eventId),
    insertSend(record) {
      const { source, eventId } = record.identity
      const sql = 'INSERT INTO nt_sends (source, event_id, record) VALUES (?, ?, ?)'
      port.execute(sql, [source, eventId, JSON.stringify(record)])
    },
    recipients: () => recipientsOf(port),
    ensureRecipient(recipient) {
      const sql =
        'INSERT INTO nt_recipients (recipient, record) VALUES (?, ?) ON CONFLICT(recipient) DO NOTHING'
      port.execute(sql, [recipientKey(recipient), JSON.stringify(recipient)])
    },
    subscriptionsFor: (source, type) =>
      rows(
        port,
        subscriptionSchema,
        'SELECT record FROM nt_subscriptions WHERE source = ? AND type = ? ORDER BY rowid',
        [source, type],
      ),
    expireSubscription(key) {
      const current = this.subscription(key)
      if (current !== null) this.putSubscription({ ...current, expired: true })
    },
    subscription: key =>
      one(
        rows(
          port,
          subscriptionSchema,
          'SELECT record FROM nt_subscriptions WHERE recipient = ? AND source = ? AND type = ? AND scope = ?',
          subscriptionParams(key),
        ),
      ),
    subscriptionsOf: recipient =>
      rows(
        port,
        subscriptionSchema,
        'SELECT record FROM nt_subscriptions WHERE recipient = ? ORDER BY rowid',
        [recipientKey(recipient)],
      ),
    putSubscription(subscription) {
      port.execute(
        'INSERT INTO nt_subscriptions (recipient, source, type, scope, record) VALUES (?, ?, ?, ?, ?) ON CONFLICT(recipient, source, type, scope) DO UPDATE SET record = excluded.record',
        [...subscriptionParams(subscription), JSON.stringify(subscription)],
      )
    },
    deleteSubscription(key) {
      port.execute(
        'DELETE FROM nt_subscriptions WHERE recipient = ? AND source = ? AND type = ? AND scope = ?',
        subscriptionParams(key),
      )
    },
    beat: recipient => beatOf(port, recipient),
    setBeat(recipient, beat) {
      port.execute(
        'INSERT INTO nt_beats (recipient, beat) VALUES (?, ?) ON CONFLICT(recipient) DO UPDATE SET beat = excluded.beat',
        [recipientKey(recipient), JSON.stringify(beat)],
      )
    },
    nextSequence() {
      const next = currentSequence(port) + 1
      port.execute(
        "INSERT INTO nt_counters (name, value) VALUES ('sequence', ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value",
        [next],
      )
      return next
    },
    notification,
    insertNotification: writeNotification,
    setMarks(recipient, identity, marks) {
      const record = notification(recipient, identity)
      if (record === null) throw new Error('marks of a notification that is not stored')
      writeNotification({ ...record, marks })
    },
    sameKey: (recipient, source, replaceKey) =>
      rows(
        port,
        notificationRecordSchema,
        'SELECT record FROM nt_notifications WHERE recipient = ? AND source = ? AND replace_key = ? ORDER BY sequence',
        [recipientKey(recipient), source, replaceKey],
      ),
    currentSequence: () => currentSequence(port),
    pendingStrong: (recipient, after) =>
      entries(
        port,
        'n.recipient = ? AND n.unresolved = 1 AND n.strong = 1 AND n.quiet = 0 AND n.sequence > ?',
        [recipientKey(recipient), after],
      ),
    unresolved: recipient =>
      entries(port, 'n.recipient = ? AND n.unresolved = 1', [recipientKey(recipient)]),
    destinations: recipient =>
      rows(
        port,
        destinationSchema,
        'SELECT record FROM nt_destinations WHERE recipient = ? ORDER BY rowid',
        [recipientKey(recipient)],
      ),
    putDestination(destination) {
      port.execute(
        'INSERT INTO nt_destinations (recipient, id, record) VALUES (?, ?, ?) ON CONFLICT(recipient, id) DO UPDATE SET record = excluded.record',
        [recipientKey(destination.recipient), destination.id, JSON.stringify(destination)],
      )
    },
    deleteDestination(ref) {
      const sql = 'DELETE FROM nt_destinations WHERE recipient = ? AND id = ?'
      port.execute(sql, [recipientKey(ref.recipient), ref.id])
    },
    unit: id => one(rows(port, storedUnitSchema, 'SELECT record FROM nt_units WHERE id = ?', [id])),
    putUnit(unit) {
      port.execute(
        'INSERT INTO nt_units (id, pending, due_at, record) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET pending = excluded.pending, due_at = excluded.due_at, record = excluded.record',
        [unit.id, unit.state === 'pending' ? 1 : 0, unit.dueAt, JSON.stringify(unit)],
      )
    },
    reminded(recipient, item) {
      const sql = 'SELECT item FROM nt_reminders WHERE recipient = ? AND item = ?'
      return select(port, sql, [recipientKey(recipient), item]).length > 0
    },
    insertReminder(recipient, item, at) {
      const sql = 'INSERT INTO nt_reminders (recipient, item, at) VALUES (?, ?, ?)'
      port.execute(sql, [recipientKey(recipient), item, at])
    },
  }
}
