import { readJsonText } from '@omne-harness/json-text'
import type { ToolConfiguration, ToolLedgerConfiguration } from './construction.ts'
import { isPositiveSafeInteger, judgeAuthorLimits } from './limits.ts'
import { lateWriteWindowMs, offloadingFits, SYSTEM_RETURN } from './result-offloading.ts'

const LEDGER_CAPACITIES = [
  'resultPageBytes',
  'ledgerCommitAttempts',
  'queueCapacity',
] as const satisfies readonly (keyof ToolLedgerConfiguration)[]
const CAPACITIES = ['processBatchBytes', 'observerBufferBytes', ...LEDGER_CAPACITIES] as const
const DELAYS = ['processBatchDelayMs', 'reconciliationDelayMs'] as const
const DEFAULT_DRIVER_STEPS_PER_RUN = 16
const DEFAULT_DRIVER_RETRY_DELAY_MS = 1_000
const MAX_TIMER_DELAY_MS = 2_147_483_647

export function driverStepsPerRun(configuration: ToolConfiguration): number {
  return configuration.driverStepsPerRun ?? DEFAULT_DRIVER_STEPS_PER_RUN
}

export function driverRetryDelayMs(configuration: ToolConfiguration): number {
  return configuration.driverRetryDelayMs ?? DEFAULT_DRIVER_RETRY_DELAY_MS
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

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
    key === 'offloading' ||
    key === 'readResultArguments' ||
    key === 'driverStepsPerRun' ||
    key === 'driverRetryDelayMs'
  )
}

function checkCapacities(configuration: object, keys: readonly string[]): void {
  for (const key of keys)
    if (!isPositiveSafeInteger(Reflect.get(configuration, key)))
      throw new TypeError(`configuration.${key}: range`)
}

export function checkToolConfiguration(configuration: ToolConfiguration): void {
  const limits = judgeAuthorLimits(
    Object.fromEntries(Object.entries(configuration).filter(([key]) => !isRuntimeBudget(key))),
    'configuration',
  )
  if ('failure' in limits) throw new TypeError(`${limits.failure.field}: ${limits.failure.reason}`)
  checkResultConfiguration(configuration)
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

export function checkLedgerConfiguration(configuration: ToolLedgerConfiguration): void {
  if (typeof configuration !== 'object' || configuration === null)
    throw new TypeError('configuration: type')
  checkResultConfiguration(configuration)
  checkCapacities(configuration, [...LEDGER_CAPACITIES, 'authorBufferBytes', 'authorBufferItems'])
}

function checkResultConfiguration(configuration: ToolLedgerConfiguration): void {
  readJsonText('null', configuration.readResultArguments)
  const policy = configuration.offloading
  if (typeof policy !== 'object' || policy === null)
    throw new TypeError('configuration.offloading: required')
  readJsonText('null', policy.jsonDocument)
  readJsonText('null', policy.jsonRecord)
  checkCapacities(policy, [
    'maxInlineUtf8Bytes',
    'maxRetentionMs',
    'maxBodyBytes',
    'previewUtf8Bytes',
    'maxPageBytes',
    'maxWriterMetadataBytes',
    'permitMs',
    'orphanGraceMs',
  ])
  if (policy.previewDivisor !== undefined) checkCapacities(policy, ['previewDivisor'])
  if (!isNonNegativeSafeInteger(policy.clockSkewMs))
    throw new TypeError('configuration.offloading.clockSkewMs: range')
  const window = lateWriteWindowMs(policy)
  if (policy.orphanGraceMs <= window)
    throw new TypeError('configuration.offloading.orphanGraceMs: not-above-late-write-window')
  if (policy.maxRetentionMs <= window)
    throw new TypeError('configuration.offloading.maxRetentionMs: not-above-late-write-window')
  if (!offloadingFits(SYSTEM_RETURN, policy))
    throw new TypeError('configuration.offloading: header-and-preview-exceed-threshold')
}
