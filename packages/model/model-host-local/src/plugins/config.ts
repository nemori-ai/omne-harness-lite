// The configuration of the local host plugins, parsed once at the plugin boundary (Standard Schema,
// the same shape as the credential plugin). Every number comes from the operator: the design does
// not turn an unmeasured production number into a default, so a missing or out-of-range value
// fails the load instead of falling back.
import { fieldOf, isIntegerAtLeast } from '../fields.ts'

type Issue = { message: string }
type Parsed<T> = Readonly<{ value: T }> | Readonly<{ issues: Issue[] }>

function rejected(message: string): Parsed<never> {
  return { issues: [{ message }] }
}

function schemaOf<T>(validate: (value: unknown) => Parsed<T>) {
  return { '~standard': { version: 1 as const, vendor: 'model-host-local', validate } }
}

/** The four bounds of the local host. All are required. */
export type ModelHostSettings = Readonly<{
  /** The most drives that run at once. */
  concurrencyLimit: number
  /** The most calls that wait for a drive, counting a running call that was woken again. */
  wakeCapacity: number
  /** The calls one recovery scan page reads. Consumed by the recovery scan, not by the host. */
  scanBatchSize: number
  /** The pause between recovery scans, in milliseconds. Consumed by the recovery scan. */
  scanIntervalMs: number
}>

function parseHostSettings(value: unknown): Parsed<ModelHostSettings> {
  const concurrencyLimit = fieldOf(value, 'concurrencyLimit')
  if (!isIntegerAtLeast(concurrencyLimit, 1))
    return rejected('concurrencyLimit must be a positive safe integer')
  const wakeCapacity = fieldOf(value, 'wakeCapacity')
  if (!isIntegerAtLeast(wakeCapacity, 1))
    return rejected('wakeCapacity must be a positive safe integer')
  const scanBatchSize = fieldOf(value, 'scanBatchSize')
  if (!isIntegerAtLeast(scanBatchSize, 1))
    return rejected('scanBatchSize must be a positive safe integer')
  const scanIntervalMs = fieldOf(value, 'scanIntervalMs')
  if (!isIntegerAtLeast(scanIntervalMs, 0))
    return rejected('scanIntervalMs must be a non-negative safe integer')
  return { value: { concurrencyLimit, wakeCapacity, scanBatchSize, scanIntervalMs } }
}

export const modelHostConfigSchema = schemaOf(parseHostSettings)

/** The bound of the request preparation plugin. */
export type ModelPreparationSettings = Readonly<{
  /** The most distinct calls one lineage may name. */
  maxCitedCalls: number
}>

function parsePreparationSettings(value: unknown): Parsed<ModelPreparationSettings> {
  const maxCitedCalls = fieldOf(value, 'maxCitedCalls')
  if (!isIntegerAtLeast(maxCitedCalls, 1))
    return rejected('maxCitedCalls must be a positive safe integer')
  return { value: { maxCitedCalls } }
}

export const modelPreparationConfigSchema = schemaOf(parsePreparationSettings)
