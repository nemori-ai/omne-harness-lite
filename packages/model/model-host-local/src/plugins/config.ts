import { fieldOf, isIntegerAtLeast, rejected, type Parsed } from '../fields.ts'

function schemaOf<T>(validate: (value: unknown) => Parsed<T>) {
  return { '~standard': { version: 1 as const, vendor: 'model-host-local', validate } }
}

export type ModelHostSettings = Readonly<{
  concurrencyLimit: number
  wakeCapacity: number
  scanBatchSize: number
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
  if (!isIntegerAtLeast(scanIntervalMs, 1))
    return rejected('scanIntervalMs must be a positive safe integer')
  return { value: { concurrencyLimit, wakeCapacity, scanBatchSize, scanIntervalMs } }
}

export const modelHostConfigSchema = schemaOf(parseHostSettings)

export type ModelPreparationSettings = Readonly<{
  maxCitedCalls: number
}>

function parsePreparationSettings(value: unknown): Parsed<ModelPreparationSettings> {
  const maxCitedCalls = fieldOf(value, 'maxCitedCalls')
  if (!isIntegerAtLeast(maxCitedCalls, 1))
    return rejected('maxCitedCalls must be a positive safe integer')
  return { value: { maxCitedCalls } }
}

export const modelPreparationConfigSchema = schemaOf(parsePreparationSettings)
