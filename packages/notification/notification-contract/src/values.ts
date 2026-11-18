import { z } from 'zod'

/** The hard ceiling of a body in UTF-16 code units. A deployment may configure a lower limit. */
export const BODY_CEILING = 65_536

export const tenantIdSchema = z.string().min(1).max(200).brand<'NotificationTenantId'>()
export type TenantId = z.infer<typeof tenantIdSchema>

/** `<domain>.<name>`: the key of a registered notification source. */
export const sourceNameSchema = z
  .string()
  .max(100)
  .regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/)
  .brand<'NotificationSourceName'>()
export type SourceName = z.infer<typeof sourceNameSchema>

export const eventTypeNameSchema = z
  .string()
  .max(100)
  .regex(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/)
  .brand<'NotificationEventTypeName'>()
export type EventTypeName = z.infer<typeof eventTypeNameSchema>

export const channelNameSchema = z
  .string()
  .max(100)
  .regex(/^[a-z][a-z0-9-]*$/)
  .brand<'NotificationChannelName'>()
export type ChannelName = z.infer<typeof channelNameSchema>

/** A UTC instant with millisecond precision. Two instants compare as strings. */
export const instantSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine(value => {
    const time = Date.parse(value)
    return !Number.isNaN(time) && new Date(time).toISOString() === value
  })
  .brand<'NotificationInstant'>()
export type Instant = z.infer<typeof instantSchema>

export const sendIdentitySchema = z
  .strictObject({
    tenant: tenantIdSchema,
    source: sourceNameSchema,
    eventId: z.string().min(1).max(200),
  })
  .readonly()
export type SendIdentity = z.infer<typeof sendIdentitySchema>

export const recipientRefSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('person') }).readonly(),
  z.strictObject({ kind: z.literal('agent'), ref: z.string().min(1).max(200) }).readonly(),
])
export type RecipientRef = z.infer<typeof recipientRefSchema>
export type RecipientKind = RecipientRef['kind']

export const scopeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('all') }).readonly(),
  z.strictObject({ kind: z.literal('subject'), equals: z.string().min(1).max(500) }).readonly(),
  z
    .strictObject({ kind: z.literal('subject-prefix'), prefix: z.string().min(1).max(500) })
    .readonly(),
])
export type Scope = z.infer<typeof scopeSchema>

export const levelSchema = z.enum(['off', 'weak', 'strong'])
export type Level = z.infer<typeof levelSchema>
/** The level a notification carries once it is in an inbox. */
export type BoxedLevel = Exclude<Level, 'off'>

export const termSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('standing') }).readonly(),
  z.strictObject({ kind: z.literal('once') }).readonly(),
  z.strictObject({ kind: z.literal('until'), at: instantSchema }).readonly(),
])
export type Term = z.infer<typeof termSchema>

export const basisSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('owner') }).readonly(),
  z
    .strictObject({ kind: z.literal('blanket'), generation: z.number().int().nonnegative() })
    .readonly(),
  z.strictObject({ kind: z.literal('granular'), decision: z.string().min(1).max(200) }).readonly(),
])
export type Basis = z.infer<typeof basisSchema>

export const noteSchema = z.string().min(1).max(500)

export const causeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('named') }).readonly(),
  z
    .strictObject({
      kind: z.literal('subscription'),
      scope: scopeSchema,
      note: noteSchema.nullable(),
    })
    .readonly(),
  z.strictObject({ kind: z.literal('type-default') }).readonly(),
])
export type Cause = z.infer<typeof causeSchema>

export const marksSchema = z
  .strictObject({
    seenAt: instantSchema.nullable(),
    resolved: z
      .strictObject({ how: z.enum(['done', 'dismissed']), at: instantSchema })
      .readonly()
      .nullable(),
    supersededBy: sendIdentitySchema.nullable(),
  })
  .readonly()
export type Marks = z.infer<typeof marksSchema>
export const UNMARKED: Marks = { seenAt: null, resolved: null, supersededBy: null }

/** Where a click on the notification leads: a session, a card, a schedule, a job. Opaque here. */
export const locatorSchema = z
  .strictObject({ kind: z.string().min(1).max(64), ref: z.string().min(1).max(500) })
  .readonly()
export type Locator = z.infer<typeof locatorSchema>

export const contentSchema = z
  .strictObject({
    title: z.string().min(1).max(200),
    body: z.string().max(BODY_CEILING),
    locator: locatorSchema.nullable(),
  })
  .readonly()
export type Content = z.infer<typeof contentSchema>

/** Present only on events an agent emits. The tool member fills it; a model cannot. */
export const originSchema = z
  .strictObject({ emitter: recipientRefSchema, depth: z.number().int().nonnegative() })
  .readonly()
export type Origin = z.infer<typeof originSchema>

export const eventFactsSchema = z
  .strictObject({
    type: eventTypeNameSchema,
    subject: z.string().min(1).max(500).nullable(),
    at: instantSchema,
    content: contentSchema,
    replaceKey: z.string().min(1).max(200).nullable(),
    renotify: z.boolean(),
    named: z.array(recipientRefSchema).max(16).readonly(),
    origin: originSchema.nullable(),
  })
  .readonly()
export type EventFacts = z.infer<typeof eventFactsSchema>

export const sendRequestSchema = z
  .strictObject({ identity: sendIdentitySchema, event: eventFactsSchema })
  .readonly()
export type SendRequest = z.infer<typeof sendRequestSchema>

/** The key under which one recipient is stored and compared. */
export function recipientKey(recipient: RecipientRef): string {
  return recipient.kind === 'person' ? 'person' : `agent:${recipient.ref}`
}

export function sameRecipient(a: RecipientRef, b: RecipientRef): boolean {
  return recipientKey(a) === recipientKey(b)
}

export function sameIdentity(a: SendIdentity, b: SendIdentity): boolean {
  return a.tenant === b.tenant && a.source === b.source && a.eventId === b.eventId
}

/** The four answers every operation uses. `done` carries whether an earlier success was recalled. */
export type Outcome<T, R> =
  | Readonly<{ kind: 'done'; value: T; recalled: boolean }>
  | Readonly<{ kind: 'refused'; reason: R }>
  | Readonly<{ kind: 'basis-unavailable' }>
  | Readonly<{ kind: 'unknown' }>

export type ParseRefusal =
  | 'invalid-source-name'
  | 'incomplete-identity'
  | 'content-too-large'
  | 'invalid-scope'
  | 'invalid-term'
  | 'invalid-request'

export type Parsed<T> = Readonly<{ ok: T }> | Readonly<{ refused: ParseRefusal }>

type Issue = Readonly<{ path: readonly PropertyKey[]; code: string }>

function refusalOf(issues: readonly Issue[]): ParseRefusal {
  const first = issues[0]
  const path = first === undefined ? [] : first.path.map(String)
  const at = (...keys: string[]) => keys.every((key, index) => path[index] === key)
  if (at('identity', 'source') || at('source')) return 'invalid-source-name'
  if (at('identity')) return 'incomplete-identity'
  if (at('event', 'content') && first?.code === 'too_big') return 'content-too-large'
  if (path.includes('scope')) return 'invalid-scope'
  if (path.includes('term')) return 'invalid-term'
  return 'invalid-request'
}

/** Parses an input at the boundary. Inside the domain the parsed type is not checked again. */
export function parseWith<T>(schema: z.ZodType<T>, input: unknown): Parsed<T> {
  const parsed = schema.safeParse(input)
  return parsed.success ? { ok: parsed.data } : { refused: refusalOf(parsed.error.issues) }
}

export function parseSendRequest(input: unknown): Parsed<SendRequest> {
  return parseWith(sendRequestSchema, input)
}
