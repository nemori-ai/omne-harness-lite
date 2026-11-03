import { createHash } from 'node:crypto'
import canonicalize from 'canonicalize'
import {
  CALENDAR_PROTOCOL,
  type CalendarCallContext,
  type CalendarSnapshot,
} from '@omne-harness/calendar-contract'

export function supplyDigest(value: unknown): string {
  const canonical = canonicalize(value)
  if (canonical === undefined) throw new Error('Expected a JSON value')
  return createHash('sha256').update(canonical).digest('hex')
}
export function supplyFingerprint(input: {
  context: CalendarCallContext
  operation: string
  aggregateRef: string
  payload: unknown
}): string {
  return supplyDigest({
    protocol: CALENDAR_PROTOCOL,
    operation: input.operation,
    owner: input.context.owner,
    aggregateRef: input.aggregateRef,
    payload: input.payload,
    expectedRevision: null,
    consentRef: null,
  })
}
export function snapshotContent(
  snapshot: Pick<
    CalendarSnapshot,
    'calendarId' | 'coverageStart' | 'coverageEnd' | 'timezone' | 'weeklyDefault' | 'overrides'
  >,
) {
  return {
    calendarId: snapshot.calendarId,
    coverageStart: snapshot.coverageStart,
    coverageEnd: snapshot.coverageEnd,
    timezone: snapshot.timezone,
    weeklyDefault: snapshot.weeklyDefault,
    overrides: snapshot.overrides,
  }
}
