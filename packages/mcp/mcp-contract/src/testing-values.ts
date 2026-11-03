// Helpers of the `./testing` entry: JSON trees from plain data, and branded sample values. They
// throw on bad input, because a bad sample is a defect of the suite, not of the subject.
import { readJsonText, type JsonValue } from '@omne-harness/json-text'
import {
  isActionName,
  isCatalogRevision,
  isGeneration,
  isProtocolVersion,
  isRequestState,
  isTaskId,
  type ActionName,
  type CatalogRevision,
  type Generation,
  type ProtocolVersion,
  type RequestState,
  type TaskId,
} from './brands.ts'

const LIMITS = {
  maxBytes: 1_000_000,
  maxDepth: 64,
  maxItems: 100_000,
  maxMembers: 10_000,
  maxStringLength: 1_000_000,
  maxNumberLength: 100,
} as const

/** The lossless tree of a plain JSON value. */
export function jsonOf(value: unknown): JsonValue {
  const read = readJsonText(JSON.stringify(value), LIMITS)
  if (read.kind !== 'ok') throw new TypeError(`sample is not JSON: ${read.kind}`)
  return read.value
}

export function generationOf(value: number): Generation {
  if (!isGeneration(value)) throw new TypeError(`not a generation: ${value}`)
  return value
}

export function revisionOf(value: number): CatalogRevision {
  if (!isCatalogRevision(value)) throw new TypeError(`not a catalog revision: ${value}`)
  return value
}

export function actionNameOf(value: string): ActionName {
  if (!isActionName(value)) throw new TypeError(`not an action name: ${value}`)
  return value
}

export function protocolVersionOf(value: string): ProtocolVersion {
  if (!isProtocolVersion(value)) throw new TypeError(`not a protocol version: ${value}`)
  return value
}

export function requestStateOf(value: string): RequestState {
  if (!isRequestState(value)) throw new TypeError(`not a request state: ${value}`)
  return value
}

export function taskIdOf(value: string): TaskId {
  if (!isTaskId(value)) throw new TypeError(`not a task id: ${value}`)
  return value
}
