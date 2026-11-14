import { systemScope } from '@omne-harness/legal-identity'
import { validateBinding, type OwnedRef } from '@omne-harness/telemetry-contract'
import type { TelemetryRecord } from './record.ts'

export type TelemetryBudgets = Readonly<{
  maxRecordBytes: number
  maxQueueItems: number
  maxQueueBytes: number
  maxOpenSegments: number
  maxLogTextLength: number
  summaryIntervalMs: number
  maxSegmentLifetimeMs?: number
}>

export type ResolvedBudgets = Readonly<Required<TelemetryBudgets>>

export const DEFAULT_SEGMENT_LIFETIME_MS = 3_600_000

export type TelemetryOutlet =
  | Readonly<{ kind: 'writer'; write(record: TelemetryRecord): void }>
  | Readonly<{ kind: 'file'; path: string }>

export type TelemetryClock = Readonly<{
  now(): Date
  monotonicMs(): number
}>

export type TelemetryRuntimeOptions = Readonly<{
  generation: string
  instance: OwnedRef
  clock: TelemetryClock
  randomBytes(size: number): Uint8Array
  outlet: TelemetryOutlet
  budgets: TelemetryBudgets
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

export type ParsedOptions = Readonly<
  Omit<TelemetryRuntimeOptions, 'budgets'> & { budgets: ResolvedBudgets }
>

function isValidInstance(instance: OwnedRef): boolean {
  return (
    validateBinding({ scope: systemScope(), component: 'telemetry-node', instance }).kind === 'ok'
  )
}

const GENERATION = /^[\x21-\x7e]{1,128}$/

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
