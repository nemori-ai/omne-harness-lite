// The construction-time checks of the configuration (342: capacities positive, delays
// non-negative and finite, the driver retry delay a timer can hold, all verified at load). A bad configuration is an assembly defect, so
// each check throws instead of building a runtime or a ledger that would misbehave later.
import type { ToolConfiguration, ToolLedgerConfiguration } from './construction.ts'
import { isPositiveSafeInteger, judgeAuthorLimits } from './limits.ts'

const LEDGER_CAPACITIES = [
  'resultPageBytes',
  'ledgerCommitAttempts',
  'queueCapacity',
] as const satisfies readonly (keyof ToolLedgerConfiguration)[]
const CAPACITIES = ['processBatchBytes', 'observerBufferBytes', ...LEDGER_CAPACITIES] as const
const DELAYS = ['processBatchDelayMs', 'reconciliationDelayMs'] as const
const DEFAULT_DRIVER_STEPS_PER_RUN = 16
const DEFAULT_DRIVER_RETRY_DELAY_MS = 1_000
/** The longest delay a timer holds: a larger one would fire after 1 ms. */
const MAX_TIMER_DELAY_MS = 2_147_483_647

/** The steps one driver run takes before it yields: the configured value or the default. */
export function driverStepsPerRun(configuration: ToolConfiguration): number {
  return configuration.driverStepsPerRun ?? DEFAULT_DRIVER_STEPS_PER_RUN
}

/**
 * The wait before a run that failed, met an undecided environment, or made no progress is run
 * again (SPEC 23): the configured value or the default.
 */
export function driverRetryDelayMs(configuration: ToolConfiguration): number {
  return configuration.driverRetryDelayMs ?? DEFAULT_DRIVER_RETRY_DELAY_MS
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/** The retry delay is at least 1 ms, so a failed run is never run again in a tight loop. */
function isRetryDelay(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_TIMER_DELAY_MS
  )
}

function isRuntimeBudget(key: string): boolean {
  return (
    (CAPACITIES as readonly string[]).includes(key) ||
    (DELAYS as readonly string[]).includes(key) ||
    key === 'driverStepsPerRun' ||
    key === 'driverRetryDelayMs'
  )
}

function checkCapacities(configuration: object, keys: readonly string[]): void {
  for (const key of keys)
    if (!isPositiveSafeInteger(Reflect.get(configuration, key)))
      throw new TypeError(`configuration.${key}: range`)
}

/** The whole runtime configuration: the author limits, the capacities and the delays. */
export function checkToolConfiguration(configuration: ToolConfiguration): void {
  const limits = judgeAuthorLimits(
    Object.fromEntries(Object.entries(configuration).filter(([key]) => !isRuntimeBudget(key))),
    'configuration',
  )
  if ('failure' in limits) throw new TypeError(`${limits.failure.field}: ${limits.failure.reason}`)
  checkCapacities(configuration, CAPACITIES)
  if (
    Reflect.get(configuration, 'driverStepsPerRun') !== undefined &&
    !isPositiveSafeInteger(configuration.driverStepsPerRun)
  )
    throw new TypeError('configuration.driverStepsPerRun: range')
  if (
    Reflect.get(configuration, 'driverRetryDelayMs') !== undefined &&
    !isRetryDelay(configuration.driverRetryDelayMs)
  )
    throw new TypeError('configuration.driverRetryDelayMs: range')
  for (const key of DELAYS)
    if (!isNonNegativeSafeInteger(configuration[key]))
      throw new TypeError(`configuration.${key}: range`)
}

/** The part the ledger reads: the result page size, the commit attempts and the queue capacity. */
export function checkLedgerConfiguration(configuration: ToolLedgerConfiguration): void {
  if (typeof configuration !== 'object' || configuration === null)
    throw new TypeError('configuration: type')
  checkCapacities(configuration, LEDGER_CAPACITIES)
}
