// The construction-time checks of the configuration (342: capacities positive, delays
// non-negative and finite, all verified at load). A bad configuration is an assembly defect, so
// each check throws instead of building a runtime or a ledger that would misbehave later.
import type { ToolConfiguration, ToolLedgerConfiguration } from './construction.ts'
import { isPositiveSafeInteger, judgeAuthorLimits } from './limits.ts'

const LEDGER_CAPACITIES = [
  'resultPageBytes',
  'ledgerCommitAttempts',
] as const satisfies readonly (keyof ToolLedgerConfiguration)[]
const CAPACITIES = ['processBatchBytes', 'observerBufferBytes', ...LEDGER_CAPACITIES] as const
const DELAYS = ['processBatchDelayMs', 'reconciliationDelayMs'] as const

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isRuntimeBudget(key: string): boolean {
  return (
    (CAPACITIES as readonly string[]).includes(key) || (DELAYS as readonly string[]).includes(key)
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
  for (const key of DELAYS)
    if (!isNonNegativeSafeInteger(configuration[key]))
      throw new TypeError(`configuration.${key}: range`)
}

/** The part the ledger reads: the result page size and the commit attempts. */
export function checkLedgerConfiguration(configuration: ToolLedgerConfiguration): void {
  if (typeof configuration !== 'object' || configuration === null)
    throw new TypeError('configuration: type')
  checkCapacities(configuration, LEDGER_CAPACITIES)
}
