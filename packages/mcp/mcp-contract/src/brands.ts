declare const brand: unique symbol
type Brand<T, B extends string> = T & { readonly [brand]: B }

export type EndpointName = Brand<string, 'EndpointName'>
export type EndpointHolding = Brand<string, 'EndpointHolding'>
export type AdoptionRevision = Brand<string, 'AdoptionRevision'>
export type CredentialBinding = Brand<string, 'CredentialBinding'>
export type ActionName = Brand<string, 'ActionName'>
export type DefinitionDigest = Brand<string, 'DefinitionDigest'>
export type InstructionsDigest = Brand<string, 'InstructionsDigest'>
export type Generation = Brand<number, 'Generation'>
export type CatalogRevision = Brand<number, 'CatalogRevision'>
export type CorrelationKey = Brand<string, 'CorrelationKey'>
export type RequestState = Brand<string, 'RequestState'>
export type TaskId = Brand<string, 'TaskId'>
export type ProtocolVersion = Brand<string, 'ProtocolVersion'>
export type Millis = Brand<number, 'Millis'>
export type ConnectionTarget = Brand<string, 'ConnectionTarget'>

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const NAME_MAX = 64
const DIGEST = /^sha256:[0-9a-f]{64}$/u
const SCHEME = /^(https?):\/\/[^/?#\\]/u
const WHITESPACE = /\s/u
const LOOPBACK_HOSTS: readonly string[] = ['localhost', '127.0.0.1', '[::1]']

function hasUnsafeCharacter(text: string): boolean {
  if (WHITESPACE.test(text)) return true
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true
  }
  return false
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isWhole(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
}

export function isEndpointName(value: unknown): value is EndpointName {
  return typeof value === 'string' && value.length <= NAME_MAX && NAME.test(value)
}

export function isEndpointHolding(value: unknown): value is EndpointHolding {
  return isText(value)
}

export function isAdoptionRevision(value: unknown): value is AdoptionRevision {
  return isText(value)
}

export function isCredentialBinding(value: unknown): value is CredentialBinding {
  return isText(value)
}

export function isActionName(value: unknown): value is ActionName {
  return isText(value)
}

function isSha256Text(value: unknown): value is string {
  return typeof value === 'string' && DIGEST.test(value)
}

export function isDefinitionDigest(value: unknown): value is DefinitionDigest {
  return isSha256Text(value)
}

export function isInstructionsDigest(value: unknown): value is InstructionsDigest {
  return isSha256Text(value)
}

export function isGeneration(value: unknown): value is Generation {
  return isWhole(value, 0)
}

export function isCatalogRevision(value: unknown): value is CatalogRevision {
  return isWhole(value, 1)
}

export function isCorrelationKey(value: unknown): value is CorrelationKey {
  return isText(value)
}

export function isRequestState(value: unknown): value is RequestState {
  return typeof value === 'string'
}

export function isTaskId(value: unknown): value is TaskId {
  return isText(value)
}

export function isProtocolVersion(value: unknown): value is ProtocolVersion {
  return isText(value)
}

export function isMillis(value: unknown): value is Millis {
  return isWhole(value, 1)
}

export function isConnectionTarget(value: unknown): value is ConnectionTarget {
  if (typeof value !== 'string' || hasUnsafeCharacter(value)) return false
  const scheme = SCHEME.exec(value)?.[1]
  if (scheme === undefined || value.includes('#') || value.includes('\\')) return false
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.hostname === '' || url.username !== '' || url.password !== '') return false
  return scheme === 'https' || LOOPBACK_HOSTS.includes(url.hostname)
}
