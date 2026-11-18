import {
  recipientKey,
  type DestinationRef,
  type InboxPage,
  type InboxQuery,
  type NotificationRef,
  type NotificationSummary,
  type NotificationView,
  type RecipientRef,
} from '@omne-harness/notification-contract'
import type { DeliveryState, SendView } from '@omne-harness/notification'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { z } from 'zod'
import {
  beatOf,
  BOX,
  notificationOf,
  recipientsOf,
  select,
  sendOf,
  sqlTxn,
  type SqlPort,
} from './facts.ts'
import {
  destinationSchema,
  HANDLER,
  PROTOCOL,
  sendRecordSchema,
  storedUnitSchema,
} from './schema.ts'

/** One request per read of the repository. `args` are the arguments of that read, in order. */
export type ReadRequest = Readonly<{ read: ReadName; args: readonly unknown[] }>
export type ReadName = keyof typeof READS

const text = z.string()
const parsed = <T>(schema: z.ZodType<T>, cell: unknown): T =>
  schema.parse(JSON.parse(text.parse(cell)))

function summaries(
  port: SqlPort,
  where: string,
  params: readonly (string | number)[],
  atMost: number | null = null,
) {
  const sql = `${BOX} WHERE ${where}`
  const found =
    atMost === null
      ? select(port, sql, params)
      : port.execute(`${sql} LIMIT ?`, [...params, atMost]).rows
  return found.map(row => {
    const record = notificationOf(row[0], row[1])
    const send = parsed(sendRecordSchema, row[2])
    const { identity, recipient, sequence, level, cause, acceptedAt, marks } = record
    const { type, subject, at, content } = send.event
    const summary: NotificationSummary = {
      identity,
      recipient,
      sequence,
      source: identity.source,
      type,
      title: content.title,
      level,
      cause,
      acceptedAt,
      marks,
    }
    return { summary, rest: { subject, at, body: content.body, locator: content.locator } }
  })
}

function box(port: SqlPort, query: InboxQuery): InboxPage {
  const open = query.filter === 'unresolved' ? ' AND n.unresolved = 1' : ''
  const after = query.after === null ? '' : ' AND n.sequence > ?'
  const where = `n.recipient = ?${open}${after} ORDER BY n.sequence ASC`
  const params = [recipientKey(query.recipient), ...(query.after === null ? [] : [query.after])]
  const found = summaries(port, where, params, query.limit + 1)
  const entries = found.slice(0, query.limit).map(entry => entry.summary)
  return { entries, next: found.length > query.limit ? (entries.at(-1)?.sequence ?? null) : null }
}

function notification(port: SqlPort, ref: NotificationRef): NotificationView | null {
  const where = 'n.recipient = ? AND n.source = ? AND n.event_id = ?'
  const { source, eventId } = ref.identity
  const [found] = summaries(port, where, [recipientKey(ref.recipient), source, eventId])
  return found === undefined ? null : { ...found.summary, ...found.rest }
}

function send(port: SqlPort, identity: NotificationRef['identity']): SendView | null {
  const record = sendOf(port, identity.source, identity.eventId)
  if (record === null) return null
  const where = 'n.source = ? AND n.event_id = ? ORDER BY n.sequence ASC'
  const notifications = summaries(port, where, [identity.source, identity.eventId]).map(
    ({ summary }) => ({ recipient: summary.recipient, marks: summary.marks }),
  )
  return { record, notifications }
}

function delivery(port: SqlPort, now: string): DeliveryState {
  const all = 'SELECT record FROM nt_destinations ORDER BY rowid'
  const due = 'SELECT record FROM nt_units WHERE pending = 1 AND due_at <= ? ORDER BY due_at, id'
  return {
    destinations: select(port, all, []).map(row => parsed(destinationSchema, row[0])),
    beats: recipientsOf(port).map(recipient => ({ recipient, beat: beatOf(port, recipient) })),
    due: select(port, due, [now]).map(row => parsed(storedUnitSchema, row[0])),
  }
}

function reminded(port: SqlPort, recipient: RecipientRef): string[] {
  const sql = 'SELECT item FROM nt_reminders WHERE recipient = ? ORDER BY rowid'
  return select(port, sql, [recipientKey(recipient)]).map(row => text.parse(row[0]))
}

/** Each read of the repository port, by its name. */
const READS = {
  send,
  box,
  notification,
  delivery,
  reminded,
  subscription: (port: SqlPort, key: never) => sqlTxn(port).subscription(key),
  subscriptions: (port: SqlPort, recipient: RecipientRef) =>
    sqlTxn(port).subscriptionsOf(recipient),
  subscriptionsFor: (port: SqlPort, source: never, type: never) =>
    sqlTxn(port).subscriptionsFor(source, type),
  beat: beatOf,
  destinations: (port: SqlPort, recipient: RecipientRef) => sqlTxn(port).destinations(recipient),
  pendingStrong(port: SqlPort, ref: DestinationRef) {
    const txn = sqlTxn(port)
    const destination = txn.destinations(ref.recipient).find(entry => entry.id === ref.id)
    return destination === undefined
      ? []
      : txn.pendingStrong(ref.recipient, destination.strongCursor)
  },
  unresolved: (port: SqlPort, recipient: RecipientRef) => sqlTxn(port).unresolved(recipient),
} as const

const requestSchema = z.strictObject({
  read: z.enum(Object.keys(READS) as [ReadName, ...ReadName[]]),
  args: z.array(z.unknown()),
})

export default {
  handler: HANDLER,
  protocol: PROTOCOL,
  read(input, port) {
    const request = requestSchema.safeParse(input)
    if (!request.success) return { kind: 'failed', diagnostic: 'invalid_notification_read' }
    const run = READS[request.data.read] as (port: SqlPort, ...args: unknown[]) => unknown
    return { kind: 'read', output: (run(port, ...request.data.args) ?? null) as JsonValue }
  },
} satisfies ReadHandlerModule
