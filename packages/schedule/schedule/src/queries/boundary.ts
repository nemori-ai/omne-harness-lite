import { createHash } from 'node:crypto'
import canonicalize from 'canonicalize'
import { z } from 'zod'
import {
  ScheduleAdoptedBasisSchema,
  ScheduleAuthorSchema,
  ScheduleDomainErrorSchema,
  ScheduleFingerprintSchema,
  ScheduleIdSchema,
  ScheduleInstantSchema,
  ScheduleOwnerSchema,
  ScheduleRefSchema,
  ScheduleViewSchema,
  type ScheduleCallContext,
  type ScheduleDomainError,
  type ScheduleView,
} from '@omne-harness/schedule-contract'
import type { ReadAccess } from '../management/types.ts'

const ref = ScheduleRefSchema
export const ReadAccessSchema = z.strictObject({
  owner: ScheduleOwnerSchema,
  principalRef: ref,
  visibility: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('ownerAll') }),
    z.strictObject({ kind: z.literal('grantedIds'), scheduleIds: z.array(ScheduleIdSchema) }),
    z.strictObject({
      kind: z.literal('authoredIds'),
      scheduleIds: z.array(ScheduleIdSchema),
      author: ScheduleAuthorSchema,
    }),
  ]),
  authorityRevision: ref,
  visibilityDigest: ScheduleFingerprintSchema,
})
export const RecordSchema = z.strictObject({
  view: ScheduleViewSchema,
  activationExclusive: ScheduleInstantSchema.nullable(),
  consentLock: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('clear') }),
    z.strictObject({
      kind: z.literal('reconfirmationRequired'),
      grantRef: ref,
      revokedGeneration: z.int().nonnegative(),
    }),
  ]),
  quota: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('held'), reservationRef: ref }),
    z.strictObject({ kind: z.literal('released'), releaseRef: ref }),
    z.strictObject({
      kind: z.literal('transferred'),
      reservationRef: ref,
      successorId: ScheduleIdSchema,
    }),
  ]),
  adoptedBasis: ScheduleAdoptedBasisSchema.nullable(),
  definitionRef: ref,
})
export const RecordSnapshotSchema = z.strictObject({
  observationRevision: ref,
  value: RecordSchema,
})
export const ObservationSchema = z.strictObject({ observationRevision: ref })
export const ReadEnvelopeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ok'), value: z.unknown() }),
  z.strictObject({ kind: z.literal('absent') }),
  z.strictObject({ kind: z.literal('changed') }),
  z.strictObject({ kind: z.literal('unavailable'), error: ScheduleDomainErrorSchema }),
])
export const CursorSchema = z.strictObject({
  version: z.literal(1),
  action: z.enum(['list', 'revisions', 'executions', 'agenda']),
  queryHash: ScheduleFingerprintSchema,
  observationRevision: ref,
  continuation: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('provider'), cursor: ref }),
    z.strictObject({
      kind: z.literal('agenda'),
      asOf: ScheduleInstantSchema,
      lastKey: z.array(z.string()).length(4),
    }),
  ]),
})
export type QueryCursor = z.infer<typeof CursorSchema>
export class QueryFailure extends Error {
  readonly error: ScheduleDomainError
  constructor(error: ScheduleDomainError) {
    super(error.message)
    this.error = error
  }
}
export function fail(
  context: ScheduleCallContext,
  code: ScheduleDomainError['code'],
  message: string,
  reason?: string,
): never {
  throw new QueryFailure({
    code,
    message,
    requestId: context.requestId,
    retryable: code !== 'invalid_input' && code !== 'forbidden',
    details: reason ? { reason } : {},
  })
}
export function digest(value: unknown): string {
  const json = canonicalize(value)
  if (json === undefined) throw new TypeError('Expected canonical JSON')
  return createHash('sha256').update(json).digest('hex')
}
export function equal(a: unknown, b: unknown): boolean {
  return canonicalize(a) === canonicalize(b)
}
export function requireEqual(context: ScheduleCallContext, a: unknown, b: unknown) {
  if (!equal(a, b)) fail(context, 'stale_cursor', 'Observation changed')
}
export function visible(context: ScheduleCallContext, access: ReadAccess, view: ScheduleView) {
  if (!equal(view.owner, access.owner))
    fail(context, 'provider_failure', 'Store returned a different owner')
  const visibility = access.visibility
  if (visibility.kind !== 'ownerAll' && !visibility.scheduleIds.includes(view.scheduleId))
    fail(context, 'provider_failure', 'Store returned a schedule outside current visibility')
  if (visibility.kind === 'authoredIds' && !equal(visibility.author, view.author))
    fail(context, 'provider_failure', 'Store returned a different author')
}
export function requireId(context: ScheduleCallContext, access: ReadAccess, scheduleId: string) {
  if (
    access.visibility.kind !== 'ownerAll' &&
    !access.visibility.scheduleIds.some(id => id === scheduleId)
  )
    fail(context, 'forbidden', 'Schedule is outside current visibility')
}
export function decodeCursor(
  context: ScheduleCallContext,
  cursor: string | null,
  action: QueryCursor['action'],
  queryHash: string,
): QueryCursor | null {
  if (cursor === null) return null
  try {
    const parsed = CursorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')))
    if (
      parsed.action === action &&
      parsed.queryHash === queryHash &&
      encodeCursor(parsed) === cursor
    )
      return parsed
  } catch {
    /* Invalid cursors carry no authority. */
  }
  return fail(context, 'stale_cursor', 'Cursor does not match this query')
}
export function encodeCursor(value: QueryCursor): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

export function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}
