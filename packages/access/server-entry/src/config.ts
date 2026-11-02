// The deployment configuration of the entry. Every value is given by the assembly; this member
// writes no initial value. `listenAddress` may only be the loopback address (SPEC「服务端的 HTTP 层责任」).
import type { JsonLimits } from '@omne-harness/json-text'

export const LOOPBACK_ADDRESS = '127.0.0.1'

/** The five json-text budgets besides `maxBytes`, which each path's body limit supplies. */
export type JsonBudgets = Readonly<Omit<JsonLimits, 'maxBytes'>>

export type ServerEntryConfig = Readonly<{
  /** Must be `127.0.0.1`. Any other address is a configuration error at start. */
  listenAddress: string
  /** 0 asks the host for a free port. */
  listenPort: number
  /** The request body limits of the two paths, in bytes. */
  maxBodyBytes: Readonly<{ small: number; input: number }>
  /** The SSE heartbeat interval. */
  heartbeatIntervalMs: number
  /** The json-text budgets of the strict read, `maxBytes` excluded. */
  jsonBudgets: JsonBudgets
  /** The deployment bound of `read-history`'s `pageBytes`. */
  maxPageBytes: number
  /** The history entry kinds this deployment discloses through `read-history`. */
  historyKinds: readonly string[]
  /** The observation resource bounds and the retention of an ended observation record. */
  observation: Readonly<{ perLogin: number; perInstance: number; cancelRetentionMs: number }>
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

/** Checks the shape of a configuration. The listen address is checked at `start`, so a wrong address fails the start, not the construction. */
export function checkConfig(config: ServerEntryConfig): ServerEntryConfig {
  if (typeof config.listenAddress !== 'string')
    throw new ServerEntryConfigError('server-entry: listenAddress must be a string')
  nonNegativeInteger(config.listenPort, 'listenPort')
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
  positiveInteger(config.maxPageBytes, 'maxPageBytes')
  if (
    !Array.isArray(config.historyKinds) ||
    config.historyKinds.some(kind => typeof kind !== 'string')
  )
    throw new ServerEntryConfigError('server-entry: historyKinds must be a list of strings')
  positiveInteger(config.observation.perLogin, 'observation.perLogin')
  positiveInteger(config.observation.perInstance, 'observation.perInstance')
  nonNegativeInteger(config.observation.cancelRetentionMs, 'observation.cancelRetentionMs')
  return config
}

/** The read budgets of one path: the five configured budgets plus that path's body limit. */
export function readLimits(config: ServerEntryConfig, maxBytes: number): JsonLimits {
  return { ...config.jsonBudgets, maxBytes }
}

/** The budgets of the responses this member writes. The content comes from trusted members, so only the shape is checked. */
export const OUTPUT_LIMITS: JsonLimits = Object.freeze({
  maxBytes: Number.MAX_SAFE_INTEGER,
  maxDepth: Number.MAX_SAFE_INTEGER,
  maxItems: Number.MAX_SAFE_INTEGER,
  maxMembers: Number.MAX_SAFE_INTEGER,
  maxStringLength: Number.MAX_SAFE_INTEGER,
  maxNumberLength: Number.MAX_SAFE_INTEGER,
})
