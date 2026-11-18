import { z } from 'zod'
import {
  basisSchema,
  causeSchema,
  channelNameSchema,
  eventFactsSchema,
  eventTypeNameSchema,
  instantSchema,
  levelSchema,
  locatorSchema,
  marksSchema,
  noteSchema,
  recipientRefSchema,
  scopeSchema,
  sendIdentitySchema,
  sourceNameSchema,
  termSchema,
  type Beat,
  type Destination,
  type NotificationRecord,
  type Subscription,
} from '@omne-harness/notification-contract'
import type { SendRecord, StoredUnit } from '@omne-harness/notification'

export const PARTICIPANT = 'notification.persistence'
export const PROTOCOL = 'notification-persistence/1'
export const HANDLER = 'notification.repository'
export const MIGRATION = { owner: PARTICIPANT, id: 'notification-1' }
export const TABLES = [
  'nt_sends',
  'nt_recipients',
  'nt_beats',
  'nt_notifications',
  'nt_subscriptions',
  'nt_destinations',
  'nt_units',
  'nt_reminders',
  'nt_counters',
]

export const sendRecordSchema = z.strictObject({
  identity: sendIdentitySchema,
  event: eventFactsSchema,
  external: z.boolean(),
  acceptedAt: instantSchema,
  recipients: z.array(recipientRefSchema),
}) satisfies z.ZodType<SendRecord>

export const notificationRecordSchema = z.strictObject({
  identity: sendIdentitySchema,
  recipient: recipientRefSchema,
  sequence: z.number().int().positive(),
  level: z.enum(['weak', 'strong']),
  cause: causeSchema,
  acceptedAt: instantSchema,
  marks: marksSchema,
  replaceKey: z.string().nullable(),
  quiet: z.boolean(),
}) satisfies z.ZodType<NotificationRecord>

export const subscriptionSchema = z.strictObject({
  recipient: recipientRefSchema,
  source: sourceNameSchema,
  type: eventTypeNameSchema,
  scope: scopeSchema,
  level: levelSchema,
  note: noteSchema.nullable(),
  term: termSchema,
  basis: basisSchema,
  expired: z.boolean(),
}) satisfies z.ZodType<Subscription>

export const beatSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('default') }),
  z.strictObject({ kind: z.literal('off') }),
  z.strictObject({ kind: z.literal('every'), minutes: z.number().int().positive() }),
]) satisfies z.ZodType<Beat>

export const destinationSchema = z.strictObject({
  recipient: recipientRefSchema,
  id: z.string().min(1),
  channel: channelNameSchema,
  address: z.string(),
  minLevel: z.enum(['strong', 'weak']),
  enabled: z.boolean(),
  builtin: z.boolean(),
  lastStrongAt: instantSchema.nullable(),
  strongCursor: z.number().int().nonnegative(),
  strongUnits: z.number().int().nonnegative(),
  blockedSince: instantSchema.nullable(),
}) satisfies z.ZodType<Destination>

const unitEntrySchema = z.strictObject({
  identity: sendIdentitySchema,
  source: sourceNameSchema,
  type: eventTypeNameSchema,
  title: z.string(),
})

const standingItemSchema = z.strictObject({
  id: z.string().min(1),
  source: sourceNameSchema,
  type: eventTypeNameSchema,
  subject: z.string().nullable(),
  title: z.string(),
  locator: locatorSchema.nullable(),
  since: instantSchema,
})

const unitBodySchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('single'),
    entry: unitEntrySchema.extend({
      body: z.string(),
      locator: locatorSchema.nullable(),
      cause: causeSchema,
      external: z.boolean(),
    }),
  }),
  z.strictObject({
    kind: z.literal('digest'),
    count: z.number().int().nonnegative(),
    listed: z.array(unitEntrySchema),
    standingOpen: z.number().int().nonnegative().nullable(),
  }),
  z.strictObject({ kind: z.literal('standing'), item: standingItemSchema }),
])

const deliveryResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('delivered') }),
  z.strictObject({ kind: z.literal('failed'), reason: z.string(), retryable: z.boolean() }),
  z.strictObject({ kind: z.literal('unknown') }),
])

export const storedUnitSchema = z.strictObject({
  id: z.string().min(1),
  destination: z.strictObject({ recipient: recipientRefSchema, id: z.string().min(1) }),
  kind: z.enum(['strong', 'beat', 'standing']),
  members: z.array(sendIdentitySchema),
  body: unitBodySchema,
  formedAt: instantSchema,
  attempts: z.number().int().nonnegative(),
  state: z.enum(['pending', 'delivered', 'stopped']),
  dueAt: instantSchema,
  last: deliveryResultSchema.nullable(),
}) satisfies z.ZodType<StoredUnit>

/** The most rows one statement may return. More is a failure, never a shorter answer. */
export const ROW_LIMIT = 20_000

/** The scripts a commit may run. The participant refuses any other name. */
export const SCRIPTS = [
  'accept',
  'mark',
  'subscribe',
  'setBeat',
  'destination',
  'formStrong',
  'formBeat',
  'remind',
  'recordDelivery',
] as const
export type ScriptName = (typeof SCRIPTS)[number]
