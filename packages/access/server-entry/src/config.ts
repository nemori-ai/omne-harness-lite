import type { JsonLimits } from '@omne-harness/json-text'

export const LOOPBACK_ADDRESS = '127.0.0.1'

export type JsonBudgets = Readonly<Omit<JsonLimits, 'maxBytes'>>

export type ServerEntryConfig = Readonly<{
  listenAddress: string
  listenPort: number
  maxInFlightRequests: number
  maxBodyBytes: Readonly<{ small: number; input: number }>
  heartbeatIntervalMs: number
  jsonBudgets: JsonBudgets
  observation: Readonly<{ perLogin: number; perInstance: number }>
}>

export class ServerEntryConfigError extends Error {
  override readonly name = 'ServerEntryConfigError'
}

function positiveInteger(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new ServerEntryConfigError(`server-entry: ${name} must be a positive safe integer`)
  return value
}

function nonNegativeInteger(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new ServerEntryConfigError(`server-entry: ${name} must be a non-negative safe integer`)
  return value
}

export function checkConfig(config: ServerEntryConfig): ServerEntryConfig {
  if (typeof config.listenAddress !== 'string')
    throw new ServerEntryConfigError('server-entry: listenAddress must be a string')
  nonNegativeInteger(config.listenPort, 'listenPort')
  positiveInteger(config.maxInFlightRequests, 'maxInFlightRequests')
  positiveInteger(config.maxBodyBytes.small, 'maxBodyBytes.small')
  positiveInteger(config.maxBodyBytes.input, 'maxBodyBytes.input')
  positiveInteger(config.heartbeatIntervalMs, 'heartbeatIntervalMs')
  for (const key of [
    'maxDepth',
    'maxItems',
    'maxMembers',
    'maxStringLength',
    'maxNumberLength',
  ] as const)
    positiveInteger(config.jsonBudgets[key], `jsonBudgets.${key}`)
  positiveInteger(config.observation.perLogin, 'observation.perLogin')
  positiveInteger(config.observation.perInstance, 'observation.perInstance')
  return config
}

export function readLimits(config: ServerEntryConfig, maxBytes: number): JsonLimits {
  return { ...config.jsonBudgets, maxBytes }
}

export const OUTPUT_LIMITS: JsonLimits = Object.freeze({
  maxBytes: Number.MAX_SAFE_INTEGER,
  maxDepth: Number.MAX_SAFE_INTEGER,
  maxItems: Number.MAX_SAFE_INTEGER,
  maxMembers: Number.MAX_SAFE_INTEGER,
  maxStringLength: Number.MAX_SAFE_INTEGER,
  maxNumberLength: Number.MAX_SAFE_INTEGER,
})
