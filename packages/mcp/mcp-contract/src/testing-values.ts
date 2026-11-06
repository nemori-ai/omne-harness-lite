// Helpers of the `./testing` entry: JSON trees from plain data, and branded sample values. They
// throw on bad input, because a bad sample is a defect of the suite, not of the subject.
import { readJsonText, type JsonValue } from '@omne-harness/json-text'
import {
  isActionName,
  isAdoptionRevision,
  isCatalogRevision,
  isConnectionTarget,
  isCorrelationKey,
  isCredentialBinding,
  isEndpointHolding,
  isEndpointName,
  isGeneration,
  isMillis,
  isProtocolVersion,
  isRequestState,
  isTaskId,
  type ActionName,
  type AdoptionRevision,
  type CatalogRevision,
  type ConnectionTarget,
  type CorrelationKey,
  type CredentialBinding,
  type Generation,
  type Millis,
  type ProtocolVersion,
  type RequestState,
  type TaskId,
} from './brands.ts'
import type { EndpointRef, PeerIdentity } from './values.ts'

const LIMITS = {
  maxBytes: 1_000_000,
  maxDepth: 64,
  maxItems: 100_000,
  maxMembers: 10_000,
  maxStringLength: 1_000_000,
  maxNumberLength: 100,
} as const

/** The lossless tree of JSON text, so that a number keeps the lexeme as written. */
export function jsonTextOf(text: string): JsonValue {
  const read = readJsonText(text, LIMITS)
  if (read.kind !== 'ok') throw new TypeError(`sample is not JSON: ${read.kind}`)
  return read.value
}

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

export function adoptionRevisionOf(value: string): AdoptionRevision {
  if (!isAdoptionRevision(value)) throw new TypeError(`not an adoption revision: ${value}`)
  return value
}

export function credentialBindingOf(value: string): CredentialBinding {
  if (!isCredentialBinding(value)) throw new TypeError(`not a credential binding: ${value}`)
  return value
}

export function connectionTargetOf(value: string): ConnectionTarget {
  if (!isConnectionTarget(value)) throw new TypeError(`not a connection target: ${value}`)
  return value
}

export function correlationKeyOf(value: string): CorrelationKey {
  if (!isCorrelationKey(value)) throw new TypeError(`not a correlation key: ${value}`)
  return value
}

export function millisOf(value: number): Millis {
  if (!isMillis(value)) throw new TypeError(`not a count of milliseconds: ${value}`)
  return value
}

/** An endpoint reference; the holding is `tenant/<name>` unless given. */
export function endpointRefOf(name: string, holding = `tenant/${name}`): EndpointRef {
  if (!isEndpointName(name)) throw new TypeError(`not an endpoint name: ${name}`)
  if (!isEndpointHolding(holding)) throw new TypeError(`not an endpoint holding: ${holding}`)
  return { name, holding }
}

/** The negotiated facts of a peer that offers tools: the version given, the modern one unless given. */
export function peerIdentityOf(version = '2026-07-28'): PeerIdentity {
  return { protocolVersion: protocolVersionOf(version), capabilities: jsonOf({ tools: {} }) }
}
