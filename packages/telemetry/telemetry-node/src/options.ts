import { systemScope } from '@omne-harness/legal-identity'
import { validateBinding, type OwnedRef } from '@omne-harness/telemetry-contract'
import type { TelemetryRecord } from './record.ts'

/**
 * The run-time budgets. The six first-version members are required: the numbers come from
 * configuration, and the code holds no default (IC-14). `maxSegmentLifetimeMs` came later and is
 * optional, so that a configuration written before it keeps working; its default is
 * `DEFAULT_SEGMENT_LIFETIME_MS` (TN-6).
 */
export type TelemetryBudgets = Readonly<{
  /** The largest serialized record, in UTF-8 bytes. A larger record is `dropped(invalid)`. */
  maxRecordBytes: number
  /** The most records that wait for the outlet. Above it a record is `dropped(capacity)`. */
  maxQueueItems: number
  /** The most serialized bytes that wait for the outlet. Above it a record is `dropped(capacity)`. */
  maxQueueBytes: number
  /** The most segments open at one time. Above it `startSegment` answers `dropped(capacity)`. */
  maxOpenSegments: number
  /** The longest text of a `log` record, in characters. A longer text is cut. */
  maxLogTextLength: number
  /** The shortest time between two self-monitoring summary lines. */
  summaryIntervalMs: number
  /**
   * The longest time a segment stays open, in milliseconds. A segment open for longer expires: it
   * gives up its place, is counted under `droppedBy.expired`, and its `end` answers
   * `dropped(expired)`.
   */
  maxSegmentLifetimeMs?: number
}>

/** The budgets after `parseOptions`: the optional member is resolved. */
export type ResolvedBudgets = Readonly<Required<TelemetryBudgets>>

/** One hour. The value that the closure tel-r4-node of card #1140 proposed; RFC-0013 names the budget without a number. */
export const DEFAULT_SEGMENT_LIFETIME_MS = 3_600_000

/**
 * Where records go. `writer` hands each record object to a write function of the application (the
 * one record writer of stdout or stderr). `file` appends one JSON line per record to a file through
 * a Pino synchronous destination that the runtime owns.
 */
export type TelemetryOutlet =
  | Readonly<{ kind: 'writer'; write(record: TelemetryRecord): void }>
  | Readonly<{ kind: 'file'; path: string }>

export type TelemetryClock = Readonly<{
  /** Wall time, for the `time` of a record. */
  now(): Date
  /** Monotonic milliseconds, for durations, deadlines and the summary interval. */
  monotonicMs(): number
}>

export type TelemetryRuntimeOptions = Readonly<{
  /** The output generation, written on every record the runtime forms. */
  generation: string
  /** The identity of this run, written on every `log` record that the runtime admits. */
  instance: OwnedRef
  clock: TelemetryClock
  /** Random bytes for trace and span identities. */
  randomBytes(size: number): Uint8Array
  outlet: TelemetryOutlet
  budgets: TelemetryBudgets
  /** The rate-limited self-monitoring line. The application connects it to stderr. */
  summary(line: string): void
}>

const BUDGET_KEYS = [
  'maxRecordBytes',
  'maxQueueItems',
  'maxQueueBytes',
  'maxOpenSegments',
  'maxLogTextLength',
  'summaryIntervalMs',
] as const satisfies readonly (keyof TelemetryBudgets)[]

function fail(message: string): never {
  throw new TypeError(`telemetry runtime: ${message}`)
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
}

function budgets(input: TelemetryBudgets): ResolvedBudgets {
  for (const key of BUDGET_KEYS) {
    const value: unknown = input[key]
    if (!isPositiveInteger(value)) fail(`budget ${key} must be a positive integer`)
  }
  const lifetime: unknown = input.maxSegmentLifetimeMs
  if (lifetime !== undefined && !isPositiveInteger(lifetime))
    fail('budget maxSegmentLifetimeMs must be a positive integer when present')
  return Object.freeze({
    ...(Object.fromEntries(BUDGET_KEYS.map(key => [key, input[key]])) as Omit<
      ResolvedBudgets,
      'maxSegmentLifetimeMs'
    >),
    maxSegmentLifetimeMs: lifetime ?? DEFAULT_SEGMENT_LIFETIME_MS,
  })
}

/** The options after the one-time check, with the budgets resolved. */
export type ParsedOptions = Readonly<
  Omit<TelemetryRuntimeOptions, 'budgets'> & { budgets: ResolvedBudgets }
>

function isValidInstance(instance: OwnedRef): boolean {
  // The binding rules own the shape of an OwnedRef; a probe binding reuses them.
  return (
    validateBinding({ scope: systemScope(), component: 'telemetry-node', instance }).kind === 'ok'
  )
}

const GENERATION = /^[\x21-\x7e]{1,128}$/

/**
 * Checks the configuration values of the options once, at creation: the generation, the
 * instance, the file path and the budgets. Functions are code, not configuration, and their types
 * hold. Throws TypeError for an invalid value.
 */
export function parseOptions(options: TelemetryRuntimeOptions): ParsedOptions {
  if (typeof options.generation !== 'string' || !GENERATION.test(options.generation))
    fail('generation must be 1 to 128 printable ASCII characters without space')
  if (!isValidInstance(options.instance)) fail('instance must be a valid OwnedRef')
  const outlet = options.outlet
  if (outlet.kind === 'file' && (typeof outlet.path !== 'string' || outlet.path === ''))
    fail('the file outlet needs a path')
  return Object.freeze({
    ...options,
    instance: { ...options.instance },
    budgets: budgets(options.budgets),
  })
}
