// A statistics query checked before any source is read: the zone by its IANA name, the range,
// the dimensions, and the buckets laid out in the zone within the limit the assembly gives.
import { Temporal } from '@js-temporal/polyfill'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { UsageFailure } from './ports.ts'
import {
  USAGE_BUCKETS,
  USAGE_DIMENSIONS,
  type UsageBucket,
  type UsageInstant,
  type UsageQuery,
} from './values.ts'

/** A bucket from its start up to, not including, its end, in epoch milliseconds. */
export type UsageEdge = Readonly<{ start: number; end: number }>
export type CheckedUsageQuery = UsageQuery & Readonly<{ edges: readonly UsageEdge[] }>

const invalid = (field: Extract<UsageFailure, { kind: 'invalid' }>['field'], reason: string) =>
  fail<UsageFailure>({ kind: 'invalid', field, reason })

function zoneOf(zone: unknown): string | null {
  if (typeof zone !== 'string' || zone === '' || /^[+-]/u.test(zone)) return null
  try {
    return Temporal.Now.zonedDateTimeISO(zone).timeZoneId
  } catch {
    return null
  }
}

function instantOf(text: unknown): number | null {
  if (typeof text !== 'string') return null
  try {
    return Temporal.Instant.from(text).epochMilliseconds
  } catch {
    return null
  }
}

function floorIn(at: number, zone: string, bucket: Exclude<UsageBucket, 'none'>) {
  const local = Temporal.Instant.fromEpochMilliseconds(at).toZonedDateTimeISO(zone)
  if (bucket === 'hour') return local.round({ smallestUnit: 'hour', roundingMode: 'floor' })
  const day = local.startOfDay()
  if (bucket === 'day') return day
  if (bucket === 'week') return day.subtract({ days: day.dayOfWeek - 1 }).startOfDay()
  return day.with({ day: 1 }).startOfDay()
}

const STEP = { day: { days: 1 }, week: { weeks: 1 }, month: { months: 1 } }

function nextOf(at: Temporal.ZonedDateTime, bucket: Exclude<UsageBucket, 'none'>) {
  return bucket === 'hour' ? at.add({ hours: 1 }) : at.add(STEP[bucket]).startOfDay()
}

/** The buckets that cover [from, to), the first and the last cut to the range; null past the limit. */
export function edgesOf(
  from: number,
  to: number,
  zone: string,
  bucket: UsageBucket,
  limit: number,
): readonly UsageEdge[] | null {
  if (bucket === 'none') return [{ start: from, end: to }]
  const edges: UsageEdge[] = []
  let cursor = floorIn(from, zone, bucket)
  let start = from
  while (start < to) {
    if (edges.length === limit) return null
    cursor = nextOf(cursor, bucket)
    const end = Math.min(cursor.toInstant().epochMilliseconds, to)
    edges.push({ start, end })
    start = end
  }
  return edges
}

export function checkUsageQuery(
  query: UsageQuery,
  limits: Readonly<{ buckets: number }>,
): Outcome<CheckedUsageQuery, UsageFailure> {
  const scope = query.scope as { kind: unknown; session?: unknown }
  if (scope.kind === 'organization') return fail({ kind: 'unsupported', field: 'scope' })
  if (
    scope.kind !== 'tenant' &&
    !(scope.kind === 'session' && typeof scope.session === 'string' && scope.session !== '')
  )
    return invalid('scope', 'shape')
  const zone = zoneOf(query.zone)
  if (zone === null) return invalid('zone', 'iana-name')
  const from = instantOf(query.range.from)
  const to = instantOf(query.range.to)
  if (from === null || to === null) return invalid('range', 'instant')
  if (from >= to) return invalid('range', 'order')
  if (!(USAGE_BUCKETS as readonly unknown[]).includes(query.bucket))
    return invalid('bucket', 'value')
  const dimensions = query.groupBy as readonly unknown[]
  if (
    dimensions.length > 2 ||
    new Set(dimensions).size !== dimensions.length ||
    !dimensions.every(item => (USAGE_DIMENSIONS as readonly unknown[]).includes(item))
  )
    return invalid('groupBy', 'dimensions')
  const edges = edgesOf(from, to, zone, query.bucket, limits.buckets)
  if (edges === null) return fail({ kind: 'too-large', limit: 'buckets' })
  return succeed({ ...query, zone, edges })
}

export const instantText = (at: number): UsageInstant => new Date(at).toISOString()
