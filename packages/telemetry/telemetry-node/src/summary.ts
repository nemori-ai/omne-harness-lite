// Offline aggregation of telemetry JSON lines into a hotspot report. The rules are SPEC.md TN-11.
import { actingScopeCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { LOG_LEVELS, type LogLevel, type SegmentOutcome } from './record.ts'

/** Reader-side selection of records. It grants no access: the report stays on the operator host. */
export type SummaryFilter = Readonly<{
  tenant?: TenantId
  /** Inclusive. */
  from?: Date
  /** Exclusive. */
  to?: Date
}>

export type DurationStats = Readonly<{
  min: number
  p50: number
  p95: number
  p99: number
  max: number
}>

export type SegmentSummary = Readonly<{
  owner: string
  name: string
  count: number
  outcomes: Readonly<Record<SegmentOutcome, number>>
  durationMs: DurationStats
}>

export type EventSummary = Readonly<{ owner: string; name: string; level: LogLevel; count: number }>

export type TelemetrySummary = Readonly<{
  /** In descending p95 order. */
  segments: readonly SegmentSummary[]
  /** In descending count order. */
  events: readonly EventSummary[]
  logs: Readonly<Record<LogLevel, number>>
  unfinished: number
  skipped: Readonly<{ invalid: number; otherKinds: number }>
  /** The times of the first and the last counted record, or null when no record is counted. */
  window: Readonly<{ from: string; to: string }> | null
}>

const OUTCOMES: readonly SegmentOutcome[] = ['ok', 'failure', 'unknown']

/** What one valid telemetry line contributes to the report. */
type FactBody =
  | Readonly<{ signal: 'segment-start'; pair: string }>
  | Readonly<{
      signal: 'segment-end'
      pair: string
      owner: string
      name: string
      outcome: SegmentOutcome
      durationMs: number
    }>
  | Readonly<{ signal: 'event'; owner: string; name: string; level: LogLevel }>
  | Readonly<{ signal: 'log'; level: LogLevel }>
  | Readonly<{ signal: 'metric' }>

type Fact = FactBody & Readonly<{ time: number; tenant: TenantId | undefined }>

type Line =
  | Readonly<{ kind: 'blank' }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'other-kind' }>
  | Readonly<{ kind: 'fact'; fact: Fact }>

type JsonObject = Readonly<Record<string, unknown>>

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(record: JsonObject, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function member<T extends string>(record: JsonObject, key: string, allowed: readonly T[]) {
  return allowed.find(item => item === record[key])
}

function pairOf(record: JsonObject): string | undefined {
  const trace = text(record, 'trace')
  const span = text(record, 'span')
  return trace === undefined || span === undefined ? undefined : JSON.stringify([trace, span])
}

type Named = Readonly<{ owner: string; name: string }>

function isDuration(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function segmentEnd(record: JsonObject, named: Named): FactBody | undefined {
  const pair = pairOf(record)
  const outcome = member(record, 'outcome', OUTCOMES)
  const durationMs = record['durationMs']
  if (pair === undefined || outcome === undefined || !isDuration(durationMs)) return undefined
  return { signal: 'segment-end', pair, ...named, outcome, durationMs }
}

function event(record: JsonObject, named: Named): FactBody | undefined {
  const level = member(record, 'level', LOG_LEVELS)
  return level === undefined ? undefined : { signal: 'event', ...named, level }
}

/** One reader per TN-3 signal. A `segment-event` counts as an event of its own definition. */
const BODIES = new Map<string, (record: JsonObject, named: Named) => FactBody | undefined>([
  [
    'segment-start',
    record => {
      const pair = pairOf(record)
      return pair === undefined ? undefined : { signal: 'segment-start', pair }
    },
  ],
  ['segment-end', segmentEnd],
  ['event', event],
  ['segment-event', event],
  [
    'log',
    record => {
      const level = member(record, 'level', LOG_LEVELS)
      return level === undefined ? undefined : { signal: 'log', level }
    },
  ],
  ['metric', () => ({ signal: 'metric' })],
])

function bodyOf(record: JsonObject): FactBody | undefined {
  const owner = text(record, 'owner')
  const name = text(record, 'name')
  const read = BODIES.get(text(record, 'signal') ?? '')
  if (owner === undefined || name === undefined || read === undefined) return undefined
  return read(record, { owner, name })
}

/** The tenant of a scope, `undefined` for the system scope, or `null` for a scope that does not parse. */
function tenantOfScope(scope: unknown): TenantId | undefined | null {
  if (!isObject(scope)) return null
  const parsed = actingScopeCodec.parse(JSON.stringify(scope))
  if (!parsed.ok) return null
  return parsed.value.kind === 'tenant' ? parsed.value.tenant : undefined
}

function parseLine(line: string): Line {
  if (line.trim() === '') return { kind: 'blank' }
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    return { kind: 'invalid' }
  }
  if (!isObject(value)) return { kind: 'invalid' }
  const kind = text(value, 'kind')
  if (kind === undefined) return { kind: 'invalid' }
  if (kind !== 'telemetry') return { kind: 'other-kind' }
  const time = Date.parse(text(value, 'time') ?? '')
  const tenant = tenantOfScope(value['scope'])
  const body = bodyOf(value)
  if (Number.isNaN(time) || tenant === null || body === undefined) return { kind: 'invalid' }
  return { kind: 'fact', fact: { ...body, time, tenant } }
}

function selected(fact: Fact, filter: SummaryFilter): boolean {
  if (filter.tenant !== undefined) {
    if (fact.tenant === undefined || !tenantEquals(fact.tenant, filter.tenant)) return false
  }
  if (filter.from !== undefined && fact.time < filter.from.getTime()) return false
  if (filter.to !== undefined && fact.time >= filter.to.getTime()) return false
  return true
}

/** Nearest rank: the value at rank ceil(p / 100 * n) of the ascending values, ranks from 1. */
function percentile(sorted: readonly number[], p: number): number {
  const rank = Math.max(1, Math.ceil((p * sorted.length) / 100))
  return sorted[rank - 1] ?? Number.NaN
}

function durationStats(durations: readonly number[]): DurationStats {
  const sorted = [...durations].sort((a, b) => a - b)
  return {
    min: sorted[0] ?? Number.NaN,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted.at(-1) ?? Number.NaN,
  }
}

type SegmentGroup = {
  owner: string
  name: string
  outcomes: Record<SegmentOutcome, number>
  durations: number[]
}

function byName(a: { owner: string; name: string }, b: { owner: string; name: string }): number {
  return a.owner.localeCompare(b.owner) || a.name.localeCompare(b.name)
}

/** Collects the facts. One instance per call, so the function stays pure. */
class Tally {
  readonly segments = new Map<string, SegmentGroup>()
  readonly events = new Map<string, EventSummary>()
  readonly logs: Record<LogLevel, number> = { error: 0, warn: 0, info: 0, debug: 0 }
  readonly starts = new Set<string>()
  readonly endedPairs = new Set<string>()
  first = Number.POSITIVE_INFINITY
  last = Number.NEGATIVE_INFINITY

  add(fact: Fact): void {
    this.first = Math.min(this.first, fact.time)
    this.last = Math.max(this.last, fact.time)
    switch (fact.signal) {
      case 'segment-start':
        this.starts.add(fact.pair)
        return
      case 'segment-end': {
        this.endedPairs.add(fact.pair)
        const key = JSON.stringify([fact.owner, fact.name])
        const group = this.segments.get(key) ?? {
          owner: fact.owner,
          name: fact.name,
          outcomes: { ok: 0, failure: 0, unknown: 0 },
          durations: [],
        }
        group.outcomes[fact.outcome] += 1
        group.durations.push(fact.durationMs)
        this.segments.set(key, group)
        return
      }
      case 'event': {
        const key = JSON.stringify([fact.owner, fact.name, fact.level])
        const count = (this.events.get(key)?.count ?? 0) + 1
        this.events.set(key, { owner: fact.owner, name: fact.name, level: fact.level, count })
        return
      }
      case 'log':
        this.logs[fact.level] += 1
        return
      case 'metric':
        return
    }
  }

  segmentSummaries(): SegmentSummary[] {
    return [...this.segments.values()]
      .map(group => ({
        owner: group.owner,
        name: group.name,
        count: group.durations.length,
        outcomes: group.outcomes,
        durationMs: durationStats(group.durations),
      }))
      .sort((a, b) => b.durationMs.p95 - a.durationMs.p95 || byName(a, b))
  }

  eventSummaries(): EventSummary[] {
    return [...this.events.values()].sort(
      (a, b) =>
        b.count - a.count ||
        byName(a, b) ||
        LOG_LEVELS.indexOf(a.level) - LOG_LEVELS.indexOf(b.level),
    )
  }

  unfinished(): number {
    return [...this.starts].filter(pair => !this.endedPairs.has(pair)).length
  }

  window(): TelemetrySummary['window'] {
    if (this.first > this.last) return null
    return { from: new Date(this.first).toISOString(), to: new Date(this.last).toISOString() }
  }
}

/**
 * Aggregates telemetry JSON lines (SPEC.md TN-3) into a report. A line that is not a valid record
 * is counted and skipped, never thrown.
 */
export function summarizeTelemetry(
  lines: Iterable<string>,
  filter: SummaryFilter = {},
): TelemetrySummary {
  const tally = new Tally()
  const skipped = { invalid: 0, otherKinds: 0 }
  for (const line of lines) {
    const parsed = parseLine(line)
    if (parsed.kind === 'invalid') skipped.invalid += 1
    else if (parsed.kind === 'other-kind') skipped.otherKinds += 1
    else if (parsed.kind === 'fact' && selected(parsed.fact, filter)) tally.add(parsed.fact)
  }
  return {
    segments: tally.segmentSummaries(),
    events: tally.eventSummaries(),
    logs: tally.logs,
    unfinished: tally.unfinished(),
    skipped,
    window: tally.window(),
  }
}
